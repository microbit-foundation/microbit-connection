/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 *
 * Main-thread facade for the worker-hosted USB connection. Implements
 * MicrobitUSBConnection by forwarding calls over the message port and
 * re-emitting worker events; keeps only the device picker and DOM
 * listeners on the main thread.
 */
import {
  BoardVersion,
  ConnectOptions,
  ConnectionAvailabilityStatus,
  ConnectionStatus,
  DeviceConnectionEventMap,
  DeviceError,
  FlashDataSource,
  FlashOptions,
  assertConnected,
} from "../../device.js";
import { TypedEventTarget } from "../../events.js";
import { ConsoleLogging, Logging } from "../../logging.js";
import {
  type CoreConnectionInfo,
  type MicrobitUSBConnection,
  type MicrobitUSBConnectionOptions,
} from "../connection.js";
import { JacdacConnectionEventMap } from "../jacdac-events.js";
import { SerialConnectionEventMap } from "../serial-events.js";
import {
  ChosenDevice,
  FlashDataResult,
  ForwardedEventMessage,
  InitOptions,
  InitResult,
  LogMessage,
  PROTOCOL_VERSION,
  WorkerToMainMessage,
  deserializeError,
  toDeviceError,
} from "./protocol.js";
import { MessagePortLike, RpcEndpoint, RpcTransfer } from "./rpc.js";

export class MicrobitUSBConnectionWorkerFacade
  extends TypedEventTarget<
    DeviceConnectionEventMap &
      SerialConnectionEventMap &
      JacdacConnectionEventMap
  >
  implements MicrobitUSBConnection
{
  readonly type = "usb" as const;
  status: ConnectionStatus = ConnectionStatus.NoAuthorizedDevice;

  private rpc: RpcEndpoint;
  private logging: Logging;
  private pauseOnHidden: boolean;
  private initPromise: Promise<void>;
  private connectionInfo: CoreConnectionInfo | undefined;
  /**
   * The device granted by the picker (or matched from getDevices after a
   * worker-side reconnect). May briefly be undefined or stale after
   * background reconnects; only property access such as serialNumber is
   * supported in worker mode.
   */
  private usbDevice: USBDevice | undefined;
  private currentFlashDataSource: FlashDataSource | undefined;

  private workerErrorListener = () => {
    this.handleWorkerFailure(
      new DeviceError({
        code: "connection-error",
        message: "USB worker failed",
      }),
    );
  };

  private visibilityChangeListener = () => {
    this.rpc.post({
      kind: "visibility",
      visible: document.visibilityState === "visible",
    });
  };

  private beforeUnloadListener = () => {
    this.rpc.post({ kind: "pageunload" });
    // Mirrors the main-thread core: the page may stay open if another
    // beforeunload handler prompted the user.
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => this.rpc.post({ kind: "pagestayedopen" }), 1000);
      },
      { once: true },
    );
  };

  constructor(worker: Worker, options: MicrobitUSBConnectionOptions = {}) {
    super();
    this.logging = options.logging || new ConsoleLogging();
    this.pauseOnHidden = options.pauseOnHidden ?? true;
    const port = worker as unknown as MessagePortLike & {
      addEventListener(type: string, listener: () => void): void;
    };
    this.rpc = new RpcEndpoint(port);
    this.rpc.serve({
      requestDevice: async (args) =>
        this.handleRequestDevice(args[0] as USBDeviceRequestOptions),
      flashData: async (args) => this.handleFlashData(args[0] as BoardVersion),
    });
    this.rpc.onOther((message) =>
      this.handleWorkerMessage(message as WorkerToMainMessage),
    );
    try {
      port.addEventListener("error", this.workerErrorListener);
      port.addEventListener("messageerror", this.workerErrorListener);
    } catch {
      // Not a real Worker (e.g. a MessagePort in tests).
    }
    // Eager handshake so the worker is typically ready before connect().
    const init: InitOptions = {
      protocolVersion: PROTOCOL_VERSION,
      deviceSelectionMode: options.deviceSelectionMode,
      pauseOnHidden: options.pauseOnHidden,
    };
    this.initPromise = this.rpc
      .call<InitResult>("init", [init])
      .then(() => undefined);
    // Surfaced when awaited by the public methods.
    this.initPromise.catch(() => {});
  }

  async initialize(): Promise<void> {
    await this.initPromise;
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this.beforeUnloadListener);
      if (this.pauseOnHidden && window.document) {
        window.document.addEventListener(
          "visibilitychange",
          this.visibilityChangeListener,
        );
      }
    }
    await this.rpc.call("initialize", []);
  }

  dispose(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this.beforeUnloadListener);
      if (this.pauseOnHidden && window.document) {
        window.document.removeEventListener(
          "visibilitychange",
          this.visibilityChangeListener,
        );
      }
    }
    // The caller owns the Worker and is responsible for terminating it.
    this.rpc.call("dispose", []).catch(() => {});
  }

  async checkAvailability(): Promise<ConnectionAvailabilityStatus> {
    // WebUSB availability is the same on both sides of the boundary
    // (workers lack only requestDevice, which runs here anyway).
    if (!navigator.usb) {
      return "unsupported";
    }
    return "available";
  }

  async connect(options?: ConnectOptions): Promise<void> {
    await this.initPromise;
    await this.rpc.call("connect", [], {
      onProgress: options?.progress,
      signal: options?.signal,
    });
  }

  async disconnect(): Promise<void> {
    await this.initPromise;
    await this.rpc.call("disconnect", []);
  }

  async flash(
    dataSource: FlashDataSource,
    options: FlashOptions,
  ): Promise<void> {
    await this.initPromise;
    if (this.currentFlashDataSource) {
      throw new DeviceError({
        code: "connection-error",
        message: "Flash already in progress",
      });
    }
    this.currentFlashDataSource = dataSource;
    try {
      await this.rpc.call(
        "flash",
        [
          {
            partial: options.partial,
            minimumProgressIncrement: options.minimumProgressIncrement,
          },
        ],
        {
          // The core rate-limits progress; pass values through verbatim.
          onProgress: options.progress,
          signal: options.signal,
        },
      );
    } finally {
      this.currentFlashDataSource = undefined;
    }
  }

  async serialWrite(data: string): Promise<void> {
    await this.initPromise;
    await this.rpc.call("serialWrite", [data]);
  }

  async softwareReset(): Promise<void> {
    await this.initPromise;
    await this.rpc.call("softwareReset", []);
  }

  async clearDevice(): Promise<void> {
    await this.initPromise;
    await this.rpc.call("clearDevice", []);
  }

  async sendJacdacFrame(frame: Uint8Array): Promise<void> {
    await this.initPromise;
    // Cloned rather than transferred: the caller may reuse the buffer and
    // frames are small.
    await this.rpc.call("sendJacdacFrame", [frame]);
  }

  setRequestDeviceExclusionFilters(exclusionFilters: USBDeviceFilter[]): void {
    // Fire-and-forget: message ordering guarantees this lands before any
    // subsequent connect.
    this.rpc
      .call("setRequestDeviceExclusionFilters", [exclusionFilters])
      .catch(() => {});
  }

  getDeviceId(): number {
    assertConnected(this.connectionInfo);
    return this.connectionInfo.deviceId;
  }

  getBoardVersion(): BoardVersion {
    assertConnected(this.connectionInfo);
    return this.connectionInfo.boardVersion;
  }

  getDevice(): USBDevice | undefined {
    return this.usbDevice;
  }

  protected eventActivated(type: string): void {
    if (type === "serialdata" || type === "jacdacframe") {
      this.rpc.post({ kind: "subscribe", type });
    }
  }

  protected eventDeactivated(type: string): void {
    if (type === "serialdata" || type === "jacdacframe") {
      this.rpc.post({ kind: "unsubscribe", type });
    }
  }

  private async handleRequestDevice(
    options: USBDeviceRequestOptions,
  ): Promise<ChosenDevice> {
    this.dispatchEvent("beforerequestdevice");
    try {
      const device = await navigator.usb.requestDevice(options);
      this.usbDevice = device;
      return {
        serialNumber: device.serialNumber ?? undefined,
        vendorId: device.vendorId,
        productId: device.productId,
      };
    } finally {
      this.dispatchEvent("afterrequestdevice");
    }
  }

  private async handleFlashData(
    boardVersion: BoardVersion,
  ): Promise<FlashDataResult | RpcTransfer> {
    const dataSource = this.currentFlashDataSource;
    if (!dataSource) {
      throw new DeviceError({
        code: "connection-error",
        message: "No flash in progress",
      });
    }
    const data = await dataSource(boardVersion);
    if (typeof data === "string") {
      return { type: "text", data };
    }
    // Transfer the bytes; copy first if the view doesn't own its whole
    // buffer, as transferring would detach unrelated data.
    const bytes =
      data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
        ? data
        : data.slice();
    return new RpcTransfer({ type: "bytes", data: bytes }, [bytes.buffer]);
  }

  private handleWorkerMessage(message: WorkerToMainMessage): void {
    switch (message.kind) {
      case "event":
        this.handleForwardedEvent(message);
        break;
      case "log":
        this.replayLog(message);
        break;
      case "fatal":
        this.handleWorkerFailure(
          toDeviceError(deserializeError(message.error)),
        );
        break;
    }
  }

  private handleForwardedEvent(message: ForwardedEventMessage): void {
    switch (message.type) {
      case "status": {
        this.connectionInfo = message.connectionInfo;
        if (message.status === ConnectionStatus.NoAuthorizedDevice) {
          this.usbDevice = undefined;
        } else if (
          message.connectionInfo?.usbSerialNumber &&
          message.connectionInfo.usbSerialNumber !==
            this.usbDevice?.serialNumber
        ) {
          // The worker connected to a device we didn't pick (background
          // reconnect); refresh our main-thread handle asynchronously.
          this.refreshUsbDevice(message.connectionInfo.usbSerialNumber);
        }
        // Update the mirror before re-dispatching so listeners that read
        // back the status property see a consistent value.
        this.status = message.status;
        this.dispatchEvent("status", {
          status: message.status,
          previousStatus: message.previousStatus,
        });
        break;
      }
      case "backgrounderror":
        this.dispatchEvent("backgrounderror", {
          error: toDeviceError(deserializeError(message.error)),
          event: message.event,
        });
        break;
      case "serialdata":
        this.dispatchEvent("serialdata", { data: message.data });
        break;
      case "serialreset":
        this.dispatchEvent("serialreset");
        break;
      case "flash":
        this.dispatchEvent("flash");
        break;
      case "jacdacframe":
        this.dispatchEvent("jacdacframe", { frame: message.frame });
        break;
    }
  }

  private replayLog(message: LogMessage): void {
    switch (message.method) {
      case "log":
        this.logging.log(message.args[0]);
        break;
      case "error":
        this.logging.error(String(message.args[0]), message.args[1]);
        break;
      case "event":
        this.logging.event(message.args[0] as Parameters<Logging["event"]>[0]);
        break;
    }
  }

  private refreshUsbDevice(serialNumber: string): void {
    navigator.usb
      ?.getDevices()
      .then((devices) => {
        const match = devices.find((d) => d.serialNumber === serialNumber);
        if (match) {
          this.usbDevice = match;
        }
      })
      .catch(() => {});
  }

  private handleWorkerFailure(error: DeviceError): void {
    this.rpc.fail(error);
    this.logging.error("USB worker failed", error);
    if (this.status !== ConnectionStatus.Disconnected) {
      const previousStatus = this.status;
      this.status = ConnectionStatus.Disconnected;
      this.dispatchEvent("status", {
        status: this.status,
        previousStatus,
      });
    }
    this.dispatchEvent("backgrounderror", { error });
  }
}

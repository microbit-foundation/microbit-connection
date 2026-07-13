/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 *
 * Worker-side host: owns the real USB connection core and bridges it to
 * the main-thread facade over the message port.
 */
import {
  BoardVersion,
  ConnectionStatusChange,
  BackgroundErrorData,
  DeviceError,
  FlashDataSource,
} from "../../device.js";
import { Logging } from "../../logging.js";
import {
  createUSBConnectionCore,
  type MicrobitUSBConnectionCore,
} from "../connection.js";
import { type JacdacFrameData } from "../jacdac-events.js";
import { type SerialData } from "../serial-events.js";
import {
  ChosenDevice,
  FlashDataResult,
  FlashRpcOptions,
  InitOptions,
  InitResult,
  MainToWorkerMessage,
  PROTOCOL_VERSION,
  SubscribableEvent,
  WorkerToMainMessage,
  serializeError,
} from "./protocol.js";
import { MessagePortLike, RpcEndpoint } from "./rpc.js";

/**
 * Values in log/event messages must survive structured clone; errors are
 * flattened and anything else non-cloneable is stringified.
 */
const sanitizeForClone = (value: unknown): unknown => {
  if (value instanceof Error) {
    return serializeError(value);
  }
  try {
    structuredClone(value);
    return value;
  } catch {
    return String(value);
  }
};

export const startUSBWorkerHost = (port: MessagePortLike): void => {
  const rpc = new RpcEndpoint(port);
  let core: MicrobitUSBConnectionCore | undefined;
  const subscriptions = new Set<SubscribableEvent>();

  const postEvent = (message: WorkerToMainMessage, transfer?: Transferable[]) =>
    rpc.post(message, transfer);

  const logging: Logging = {
    log: (e) =>
      postEvent({ kind: "log", method: "log", args: [sanitizeForClone(e)] }),
    error: (m, e) =>
      postEvent({
        kind: "log",
        method: "error",
        args: [m, sanitizeForClone(e)],
      }),
    event: (event) =>
      postEvent({
        kind: "log",
        method: "event",
        args: [sanitizeForClone(event)],
      }),
  };

  /**
   * The picker runs on the main thread (requestDevice is window-only);
   * we re-acquire the granted device here by identity.
   */
  const requestDevice = async (
    options: USBDeviceRequestOptions,
  ): Promise<USBDevice> => {
    const chosen = await rpc.call<ChosenDevice>("requestDevice", [options]);
    const candidates = (await navigator.usb.getDevices()).filter(
      (d) => d.vendorId === chosen.vendorId && d.productId === chosen.productId,
    );
    const device = chosen.serialNumber
      ? candidates.find((d) => d.serialNumber === chosen.serialNumber)
      : // Without a serial number we can only proceed unambiguously.
        candidates.length === 1
        ? candidates[0]
        : undefined;
    if (!device) {
      throw new DeviceError({
        code: "connection-error",
        message: "Selected USB device is not visible in the worker",
      });
    }
    return device;
  };

  const forwarders = {
    status: (data: ConnectionStatusChange) =>
      postEvent({
        kind: "event",
        type: "status",
        status: data.status,
        previousStatus: data.previousStatus,
        connectionInfo: core?.getConnectionInfo(),
      }),
    backgrounderror: (data: BackgroundErrorData) =>
      postEvent({
        kind: "event",
        type: "backgrounderror",
        error: serializeError(data.error),
        event: data.event,
      }),
    flash: () => postEvent({ kind: "event", type: "flash" }),
    serialreset: () => postEvent({ kind: "event", type: "serialreset" }),
    // Subscription-driven (see below). The frame buffer is owned by the
    // pump and fresh per frame, so transferring it is safe.
    serialdata: (data: SerialData) =>
      postEvent({ kind: "event", type: "serialdata", data: data.data }),
    jacdacframe: (data: JacdacFrameData) =>
      postEvent({ kind: "event", type: "jacdacframe", frame: data.frame }, [
        data.frame.buffer,
      ]),
  };

  const requireCore = (): MicrobitUSBConnectionCore => {
    if (!core) {
      throw new DeviceError({
        code: "connection-error",
        message: "USB worker not initialized",
      });
    }
    return core;
  };

  rpc.serve({
    init: async (args) => {
      const options = args[0] as InitOptions;
      if (options.protocolVersion !== PROTOCOL_VERSION) {
        throw new DeviceError({
          code: "connection-error",
          message: `USB worker protocol version mismatch: main thread ${options.protocolVersion}, worker ${PROTOCOL_VERSION}. Update the worker bundle.`,
        });
      }
      if (core) {
        throw new DeviceError({
          code: "connection-error",
          message: "USB worker already initialized",
        });
      }
      core = createUSBConnectionCore({
        logging,
        deviceSelectionMode: options.deviceSelectionMode,
        pauseOnHidden: options.pauseOnHidden,
        requestDevice,
      });
      // Unconditional forwarding: these have no lazy side effects and the
      // facade needs status regardless of consumer listeners. The picker
      // events are deliberately NOT forwarded - the facade dispatches its
      // own around the real requestDevice call.
      core.addEventListener("status", forwarders.status);
      core.addEventListener("backgrounderror", forwarders.backgrounderror);
      core.addEventListener("flash", forwarders.flash);
      core.addEventListener("serialreset", forwarders.serialreset);
      const result: InitResult = { protocolVersion: PROTOCOL_VERSION };
      return result;
    },
    initialize: async () => requireCore().initialize(),
    connect: async (_args, context) =>
      requireCore().connect({ progress: context.progress }),
    disconnect: async () => requireCore().disconnect(),
    flash: async (args, context) => {
      const options = args[0] as FlashRpcOptions;
      // The data source callback lives on the main thread; ask for the
      // data once we know the board version.
      const dataSource: FlashDataSource = async (
        boardVersion: BoardVersion,
      ) => {
        const result = await rpc.call<FlashDataResult>("flashData", [
          boardVersion,
        ]);
        return result.data;
      };
      return requireCore().flash(dataSource, {
        partial: options.partial,
        minimumProgressIncrement: options.minimumProgressIncrement,
        progress: context.progress,
        signal: context.signal,
      });
    },
    serialWrite: async (args) => requireCore().serialWrite(args[0] as string),
    softwareReset: async () => requireCore().softwareReset(),
    clearDevice: async () => requireCore().clearDevice(),
    setRequestDeviceExclusionFilters: async (args) =>
      requireCore().setRequestDeviceExclusionFilters(
        args[0] as USBDeviceFilter[],
      ),
    sendJacdacFrame: async (args) =>
      requireCore().sendJacdacFrame(args[0] as Uint8Array),
    dispose: async () => requireCore().dispose(),
  });

  rpc.onOther((message) => {
    try {
      const msg = message as MainToWorkerMessage;
      switch (msg.kind) {
        case "subscribe": {
          if (core && !subscriptions.has(msg.type)) {
            subscriptions.add(msg.type);
            // Attaching the forwarder is what makes the core see a
            // listener, driving its lazy serial/pump start.
            if (msg.type === "serialdata") {
              core.addEventListener("serialdata", forwarders.serialdata);
            } else {
              core.addEventListener("jacdacframe", forwarders.jacdacframe);
            }
          }
          break;
        }
        case "unsubscribe": {
          if (core && subscriptions.has(msg.type)) {
            subscriptions.delete(msg.type);
            if (msg.type === "serialdata") {
              core.removeEventListener("serialdata", forwarders.serialdata);
            } else {
              core.removeEventListener("jacdacframe", forwarders.jacdacframe);
            }
          }
          break;
        }
        case "visibility":
          core?.handleVisibilityChange(msg.visible);
          break;
        case "pageunload":
          core?.handlePageUnloading();
          break;
        case "pagestayedopen":
          core?.handlePageStayedOpen();
          break;
      }
    } catch (e) {
      postEvent({ kind: "fatal", error: serializeError(e) });
    }
  });
};

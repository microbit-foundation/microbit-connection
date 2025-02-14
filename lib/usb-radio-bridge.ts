/**
 * (c) 2023, Center for Computational Thinking and Design at Aarhus University and contributors
 *
 * SPDX-License-Identifier: MIT
 */

import { AccelerometerDataEvent } from "./accelerometer.js";
import { ButtonEvent, ButtonState } from "./buttons.js";
import {
  BoardVersion,
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceConnection,
  DeviceConnectionEventMap,
  SerialDataEvent,
  SerialErrorEvent,
} from "./device.js";
import { TypedEventTarget } from "./events.js";
import { Logging, NullLogging } from "./logging.js";
import {
  ServiceConnectionEventMap,
  TypedServiceEventDispatcher,
} from "./service-events.js";
import * as protocol from "./usb-serial-protocol.js";
import { MicrobitWebUSBConnection } from "./usb.js";

const connectTimeoutDuration: number = 10000;

class BridgeError extends Error {}
class RemoteError extends Error {}

export interface MicrobitRadioBridgeConnectionOptions {
  logging: Logging;
}

interface ConnectCallbacks {
  onConnecting: () => void;
  onReconnecting: () => void;
  onRestartConnection: () => void;
  onFail: () => void;
  onSuccess: () => void;
}

export interface MicrobitRadioBridgeConnection extends DeviceConnection {
  /**
   * Sets remote device.
   *
   * @param deviceId The device id of remote micro:bit.
   */
  setRemoteDeviceId(deviceId: number): void;
}

/**
 * A radio bridge connection factory.
 */
export const createRadioBridgeConnection = (
  delegate: MicrobitWebUSBConnection,
  options?: MicrobitRadioBridgeConnectionOptions,
) => new MicrobitRadioBridgeConnectionImpl(delegate, options);

/**
 * Wraps around a USB connection to implement a subset of services over a serial protocol.
 *
 * When it connects/disconnects it affects the delegate connection.
 */
class MicrobitRadioBridgeConnectionImpl
  extends TypedEventTarget<DeviceConnectionEventMap & ServiceConnectionEventMap>
  implements MicrobitRadioBridgeConnection
{
  status: ConnectionStatus;
  private logging: Logging;
  private serialSession: RadioBridgeSerialSession | undefined;
  private remoteDeviceId: number | undefined;
  private disconnectPromise: Promise<void> | undefined;
  private serialSessionOpen = false;
  private ignoreDelegateStatus = false;

  private delegateStatusListener = (e: ConnectionStatusEvent) => {
    if (this.ignoreDelegateStatus) {
      return;
    }
    const currentStatus = this.status;
    if (e.status !== ConnectionStatus.CONNECTED) {
      this.setStatus(e.status);
      this.serialSession?.dispose();
    } else {
      this.status = ConnectionStatus.DISCONNECTED;
      if (
        currentStatus === ConnectionStatus.DISCONNECTED &&
        this.serialSessionOpen
      ) {
        this.serialSession?.connect();
      }
    }
  };

  constructor(
    private delegate: MicrobitWebUSBConnection,
    options?: MicrobitRadioBridgeConnectionOptions,
  ) {
    super();
    this.logging = options?.logging ?? new NullLogging();
    this.status = this.statusFromDelegate();
  }

  getBoardVersion(): BoardVersion | undefined {
    return this.delegate.getBoardVersion();
  }

  serialWrite(data: string): Promise<void> {
    return this.delegate.serialWrite(data);
  }

  async initialize(): Promise<void> {
    await this.delegate.initialize();
    this.setStatus(this.statusFromDelegate());
    this.delegate.addEventListener("status", this.delegateStatusListener);
  }

  dispose(): void {
    this.delegate.removeEventListener("status", this.delegateStatusListener);
    this.delegate.dispose();
  }

  clearDevice(): void {
    this.delegate.clearDevice();
  }

  setRemoteDeviceId(remoteDeviceId: number) {
    this.remoteDeviceId = remoteDeviceId;
  }

  async connect(): Promise<ConnectionStatus> {
    if (this.disconnectPromise) {
      await this.disconnectPromise;
    }
    // TODO: previously this skipped overlapping connect attempts but that seems awkward
    // can we... just not do that? or wait?

    if (this.remoteDeviceId === undefined) {
      throw new BridgeError(`Missing remote micro:bit ID`);
    }

    this.logging.event({
      type: "Connect",
      message: "Serial connect start",
    });
    this.ignoreDelegateStatus = false;
    await this.delegate.connect();

    try {
      this.serialSession = new RadioBridgeSerialSession(
        this.logging,
        this.remoteDeviceId,
        this.delegate,
        this.dispatchTypedEvent.bind(this),
        {
          onConnecting: () => this.setStatus(ConnectionStatus.CONNECTING),
          onReconnecting: () => {
            // Leave serial connection running in case the remote device comes back.
            if (this.status !== ConnectionStatus.RECONNECTING) {
              this.setStatus(ConnectionStatus.RECONNECTING);
            }
          },
          onRestartConnection: () => {
            // So that serial session does not get repetitively disposed in
            // delegate status listener when delegate is disconnected for restarting connection
            this.ignoreDelegateStatus = true;
          },
          onFail: () => {
            if (this.status !== ConnectionStatus.DISCONNECTED) {
              this.setStatus(ConnectionStatus.DISCONNECTED);
            }
            this.ignoreDelegateStatus = false;
            this.serialSessionOpen = false;
          },
          onSuccess: () => {
            if (this.status !== ConnectionStatus.CONNECTED) {
              this.setStatus(ConnectionStatus.CONNECTED);
            }
            this.ignoreDelegateStatus = false;
            this.serialSessionOpen = true;
          },
        },
      );

      await this.serialSession.connect();

      this.logging.event({
        type: "Connect",
        message: "Serial connect success",
      });
      return this.status;
    } catch (e) {
      this.serialSessionOpen = false;
      this.logging.error("Failed to initialise serial protocol", e);
      this.logging.event({
        type: "Connect",
        message: "Serial connect failed",
      });
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    if (this.disconnectPromise) {
      return this.disconnectPromise;
    }
    this.serialSessionOpen = false;
    this.disconnectPromise = (async () => {
      await this.serialSession?.dispose(true);
      this.disconnectPromise = undefined;
    })();
  }

  private log(v: any) {
    this.logging.log(v);
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.log("Radio connection status " + status);
    this.dispatchTypedEvent("status", new ConnectionStatusEvent(status));
  }

  private statusFromDelegate(): ConnectionStatus {
    return this.delegate.status == ConnectionStatus.CONNECTED
      ? ConnectionStatus.DISCONNECTED
      : this.delegate.status;
  }
}

/**
 * Wraps a connected delegate for a single session from attempted serial handshake to error/dispose.
 */
class RadioBridgeSerialSession {
  private unprocessedData = "";
  private previousButtonState = { buttonA: 0, buttonB: 0 };
  private onPeriodicMessageReceived: (() => void) | undefined;
  private lastReceivedMessageTimestamp: number | undefined;
  private connectionCheckIntervalId: ReturnType<typeof setInterval> | undefined;
  private isRestartingConnection: boolean = false;

  private serialErrorListener = (event: SerialErrorEvent) => {
    this.logging.error("Serial error", event.error);
    void this.dispose();
  };

  private serialDataListener = (event: SerialDataEvent) => {
    const { data } = event;
    const messages = protocol.splitMessages(this.unprocessedData + data);
    this.unprocessedData = messages.remainingInput;

    messages.messages.forEach(async (msg) => {
      this.lastReceivedMessageTimestamp = Date.now();

      // Messages are either periodic sensor data or command/response
      const sensorData = protocol.processPeriodicMessage(msg);
      if (sensorData) {
        this.onPeriodicMessageReceived?.();

        this.dispatchTypedEvent(
          "accelerometerdatachanged",
          new AccelerometerDataEvent({
            x: sensorData.accelerometerX,
            y: sensorData.accelerometerY,
            z: sensorData.accelerometerZ,
          }),
        );
        this.processButton("buttonA", "buttonachanged", sensorData);
        this.processButton("buttonB", "buttonbchanged", sensorData);
      } else {
        const messageResponse = protocol.processResponseMessage(msg);
        if (!messageResponse) {
          return;
        }
        const responseResolve = this.responseMap.get(messageResponse.messageId);
        if (responseResolve) {
          this.responseMap.delete(messageResponse.messageId);
          responseResolve(messageResponse);
        }
      }
    });
  };

  private processButton(
    button: "buttonA" | "buttonB",
    type: "buttonachanged" | "buttonbchanged",
    sensorData: protocol.MicrobitSensorState,
  ) {
    if (sensorData[button] !== this.previousButtonState[button]) {
      this.previousButtonState[button] = sensorData[button];
      this.dispatchTypedEvent(
        type,
        new ButtonEvent(
          type,
          sensorData[button] ? ButtonState.ShortPress : ButtonState.NotPressed,
        ),
      );
    }
  }

  private responseMap = new Map<
    number,
    (
      value: protocol.MessageResponse | PromiseLike<protocol.MessageResponse>,
    ) => void
  >();

  constructor(
    private logging: Logging,
    private remoteDeviceId: number,
    private delegate: MicrobitWebUSBConnection,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
    private callbacks: ConnectCallbacks,
  ) {}

  async connect() {
    this.delegate.addEventListener("serialdata", this.serialDataListener);
    this.delegate.addEventListener("serialerror", this.serialErrorListener);
    try {
      if (this.isRestartingConnection) {
        this.callbacks.onReconnecting();
      } else {
        this.callbacks.onConnecting();
      }
      await this.handshake();

      this.logging.log(`Serial: using remote device id ${this.remoteDeviceId}`);
      const remoteMbIdCommand = protocol.generateCmdRemoteMbId(
        this.remoteDeviceId,
      );
      const remoteMbIdResponse =
        await this.sendCmdWaitResponse(remoteMbIdCommand);
      if (
        remoteMbIdResponse.type === protocol.ResponseTypes.Error ||
        remoteMbIdResponse.value !== this.remoteDeviceId
      ) {
        throw new BridgeError(
          `Failed to set remote micro:bit ID. Expected ${this.remoteDeviceId}, got ${remoteMbIdResponse.value}`,
        );
      }

      // Request the micro:bit to start sending the periodic messages
      const startCmd = protocol.generateCmdStart({
        accelerometer: true,
        buttons: true,
      });
      const periodicMessagePromise = new Promise<void>((resolve, reject) => {
        this.onPeriodicMessageReceived = resolve;
        setTimeout(() => {
          this.onPeriodicMessageReceived = undefined;
          reject(new Error("Failed to receive data from remote micro:bit"));
        }, 500);
      });

      const startCmdResponse = await this.sendCmdWaitResponse(startCmd);
      if (startCmdResponse.type === protocol.ResponseTypes.Error) {
        throw new RemoteError(
          `Failed to start streaming sensors data. Error response received: ${startCmdResponse.message}`,
        );
      }

      // TODO: in the first-time connection case we used to move the error/disconnect to the background here, why? timing?
      await periodicMessagePromise;

      this.isRestartingConnection = false;
      await this.startConnectionCheck();
      this.callbacks.onSuccess();
    } catch (e) {
      this.callbacks.onFail();
      await this.dispose();
    }
  }

  async dispose(disconnect: boolean = false) {
    this.stopConnectionCheck();
    try {
      await this.sendCmdWaitResponse(protocol.generateCmdStop());
    } catch (e) {
      // If this fails the remote micro:bit has already gone away.
    }
    this.responseMap.clear();
    this.delegate.removeEventListener("serialdata", this.serialDataListener);
    this.delegate.removeEventListener("serialerror", this.serialErrorListener);
    if (disconnect) {
      await this.delegate.disconnect();
    }
    await this.delegate.softwareReset();
  }

  private async sendCmdWaitResponse(
    cmd: protocol.MessageCmd,
  ): Promise<protocol.MessageResponse> {
    const responsePromise = new Promise<protocol.MessageResponse>(
      (resolve, reject) => {
        this.responseMap.set(cmd.messageId, resolve);
        setTimeout(() => {
          this.responseMap.delete(cmd.messageId);
          reject(new Error(`Timeout waiting for response ${cmd.messageId}`));
        }, 1_000);
      },
    );
    await this.delegate.serialWrite(cmd.message);
    return responsePromise;
  }

  private async startConnectionCheck() {
    // Check for connection lost
    if (this.connectionCheckIntervalId === undefined) {
      this.connectionCheckIntervalId = setInterval(async () => {
        if (
          this.lastReceivedMessageTimestamp &&
          Date.now() - this.lastReceivedMessageTimestamp <= 1_000
        ) {
          this.callbacks.onSuccess();
        }
        if (
          this.lastReceivedMessageTimestamp &&
          Date.now() - this.lastReceivedMessageTimestamp > 1_000
        ) {
          this.logging.event({
            type: "Serial",
            message: "Serial connection lost...attempt to reconnect",
          });
          this.callbacks.onReconnecting();
        }
        if (
          this.lastReceivedMessageTimestamp &&
          Date.now() - this.lastReceivedMessageTimestamp >
            connectTimeoutDuration
        ) {
          await this.restartConnection();
        }
      }, 1000);
    }
  }

  private async restartConnection() {
    this.isRestartingConnection = true;
    this.logging.event({
      type: "Serial",
      message: "Serial connection lost...restart connection",
    });
    this.callbacks.onRestartConnection();
    await this.dispose(true);
    await this.delegate.connect();
    await this.connect();
  }

  private stopConnectionCheck() {
    clearInterval(this.connectionCheckIntervalId);
    this.connectionCheckIntervalId = undefined;
    this.lastReceivedMessageTimestamp = undefined;
  }

  private async handshake(): Promise<void> {
    // There is an issue where we cannot read data out from the micro:bit serial
    // buffer until the buffer has been filled.
    // As a workaround we can spam the micro:bit with handshake messages until
    // enough responses have been queued in the buffer to fill it and the data
    // starts to flow.
    this.logging.log("Serial handshake");
    const handshakeResult = await new Promise<protocol.MessageResponse>(
      async (resolve, reject) => {
        const attempts = 20;
        let attemptCounter = 0;
        let failureCounter = 0;
        let resolved = false;
        while (attemptCounter < 20 && !resolved) {
          attemptCounter++;
          this.sendCmdWaitResponse(protocol.generateCmdHandshake())
            .then((value) => {
              if (!resolved) {
                resolved = true;
                resolve(value);
              }
            })
            .catch(() => {
              // We expect some to time out, likely well after the handshake is completed.
              if (!resolved) {
                if (++failureCounter === attempts) {
                  reject(new BridgeError("Handshake not completed"));
                }
              }
            });
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      },
    );
    if (handshakeResult.value !== protocol.version) {
      throw new BridgeError(
        `Handshake failed. Unexpected protocol version ${protocol.version}`,
      );
    }
  }
}

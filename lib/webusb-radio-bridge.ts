// @ts-nocheck
/**
 * (c) 2023, Center for Computational Thinking and Design at Aarhus University and contributors
 *
 * SPDX-License-Identifier: MIT
 */

import { MicrobitWebUSBConnection } from "./webusb";
import * as protocol from "./webusb-serial-protocol";
import { Logging } from "./logging";

const connectTimeoutDuration: number = 10000;

class BridgeError extends Error {}
class RemoteError extends Error {}

export class MicrobitRadioBridgeConnection {
  private responseMap = new Map<
    number,
    (
      value: protocol.MessageResponse | PromiseLike<protocol.MessageResponse>,
    ) => void
  >();

  // To avoid concurrent connect attempts
  private isConnecting: boolean = false;

  private connectionCheckIntervalId: ReturnType<typeof setInterval> | undefined;
  private lastReceivedMessageTimestamp: number | undefined;
  private isReconnect: boolean = false;
  // Whether this is the final reconnection attempt.
  private finalAttempt = false;

  constructor(
    private usb: MicrobitWebUSBConnection,
    private logging: Logging,
    private remoteDeviceId: number,
  ) {}

  async connect(): Promise<void> {
    this.logging.event({
      type: this.isReconnect ? "Reconnect" : "Connect",
      message: "Serial connect start",
    });
    if (this.isConnecting) {
      this.logging.log(
        "Skipping connect attempt when one is already in progress",
      );
      return;
    }
    this.isConnecting = true;
    let unprocessedData = "";
    let previousButtonState = { A: 0, B: 0 };
    let onPeriodicMessageRecieved: (() => void) | undefined;

    const handleError = (e: unknown) => {
      this.logging.error("Serial error", e);
      void this.disconnectInternal(false, "bridge");
    };
    const processMessage = (data: string) => {
      const messages = protocol.splitMessages(unprocessedData + data);
      unprocessedData = messages.remainingInput;
      messages.messages.forEach(async (msg) => {
        this.lastReceivedMessageTimestamp = Date.now();

        // Messages are either periodic sensor data or command/response
        const sensorData = protocol.processPeriodicMessage(msg);
        if (sensorData) {
          // stateOnReconnected();
          // if (onPeriodicMessageRecieved) {
          //   onPeriodicMessageRecieved();
          //   onPeriodicMessageRecieved = undefined;
          // }
          // onAccelerometerChange(
          //   sensorData.accelerometerX,
          //   sensorData.accelerometerY,
          //   sensorData.accelerometerZ
          // );
          // if (sensorData.buttonA !== previousButtonState.A) {
          //   previousButtonState.A = sensorData.buttonA;
          //   onButtonChange(sensorData.buttonA, "A");
          // }
          // if (sensorData.buttonB !== previousButtonState.B) {
          //   previousButtonState.B = sensorData.buttonB;
          //   onButtonChange(sensorData.buttonB, "B");
          // }
        } else {
          const messageResponse = protocol.processResponseMessage(msg);
          if (!messageResponse) {
            return;
          }
          const responseResolve = this.responseMap.get(
            messageResponse.messageId,
          );
          if (responseResolve) {
            this.responseMap.delete(messageResponse.messageId);
            responseResolve(messageResponse);
          }
        }
      });
    };
    try {
      await this.usb.startSerial(processMessage, handleError);
      await this.handshake();
      // stateOnConnected(DeviceRequestStates.INPUT);

      // Check for connection lost
      if (this.connectionCheckIntervalId === undefined) {
        this.connectionCheckIntervalId = setInterval(async () => {
          if (
            this.lastReceivedMessageTimestamp &&
            Date.now() - this.lastReceivedMessageTimestamp > 1_000
          ) {
            // stateOnReconnectionAttempt();
          }
          if (
            this.lastReceivedMessageTimestamp &&
            Date.now() - this.lastReceivedMessageTimestamp >
              connectTimeoutDuration
          ) {
            await this.handleReconnect();
          }
        }, 1000);
      }

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

      // For now we only support input state.
      // TODO: when do we do this?
      if (false) {
        // Request the micro:bit to start sending the periodic messages
        const startCmd = protocol.generateCmdStart({
          accelerometer: true,
          buttons: true,
        });
        const periodicMessagePromise = new Promise<void>((resolve, reject) => {
          onPeriodicMessageRecieved = resolve;
          setTimeout(() => {
            onPeriodicMessageRecieved = undefined;
            reject(new Error("Failed to receive data from remote micro:bit"));
          }, 500);
        });

        const startCmdResponse = await this.sendCmdWaitResponse(startCmd);
        if (startCmdResponse.type === protocol.ResponseTypes.Error) {
          throw new RemoteError(
            `Failed to start streaming sensors data. Error response received: ${startCmdResponse.message}`,
          );
        }

        if (this.isReconnect) {
          await periodicMessagePromise;
        } else {
          periodicMessagePromise.catch(async (e) => {
            this.logging.error("Failed to initialise serial protocol", e);
            await this.disconnectInternal(false, "remote");
            this.isConnecting = false;
          });
        }
      }

      // stateOnAssigned(DeviceRequestStates.INPUT, this.usb.getModelNumber());
      // stateOnReady(DeviceRequestStates.INPUT);
      this.logging.event({
        type: this.isReconnect ? "Reconnect" : "Connect",
        message: "Serial connect success",
      });
    } catch (e) {
      this.logging.error("Failed to initialise serial protocol", e);
      this.logging.event({
        type: this.isReconnect ? "Reconnect" : "Connect",
        message: "Serial connect failed",
      });
      const reconnectHelp = e instanceof BridgeError ? "bridge" : "remote";
      await this.disconnectInternal(false, reconnectHelp);
      throw e;
    } finally {
      this.finalAttempt = false;
      this.isConnecting = false;
    }
  }

  async disconnect(): Promise<void> {
    return this.disconnectInternal(true, "bridge");
  }

  private stopConnectionCheck() {
    clearInterval(this.connectionCheckIntervalId);
    this.connectionCheckIntervalId = undefined;
    this.lastReceivedMessageTimestamp = undefined;
  }

  private async disconnectInternal(userDisconnect: boolean): Promise<void> {
    this.stopConnectionCheck();
    try {
      await this.sendCmdWaitResponse(protocol.generateCmdStop());
    } catch (e) {
      // If this fails the remote micro:bit has already gone away.
    }
    this.responseMap.clear();
    await this.usb.stopSerial();
    // stateOnDisconnected(
    //   DeviceRequestStates.INPUT,
    //   userDisconnect || this.finalAttempt
    //     ? false
    //     : this.isReconnect
    //       ? "autoReconnect"
    //       : "connect",
    //   reconnectHelp
    // );
  }

  async handleReconnect(): Promise<void> {
    if (this.isConnecting) {
      this.logging.log(
        "Serial disconnect ignored... reconnect already in progress",
      );
      return;
    }
    try {
      this.stopConnectionCheck();
      this.logging.log(
        "Serial disconnected... automatically trying to reconnect",
      );
      this.responseMap.clear();
      await this.usb.stopSerial();
      await this.usb.softwareReset();
      await this.reconnect();
    } catch (e) {
      this.logging.error(
        "Serial connect triggered by disconnect listener failed",
        e,
      );
    } finally {
      this.isConnecting = false;
    }
  }

  async reconnect(finalAttempt: boolean = false): Promise<void> {
    this.finalAttempt = finalAttempt;
    this.logging.log("Serial reconnect");
    this.isReconnect = true;
    await this.connect();
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
    await this.usb.serialWrite(cmd.message);
    return responsePromise;
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

export const startSerialConnection = async (
  logging: Logging,
  usb: MicrobitWebUSBConnection,
  remoteDeviceId: number,
): Promise<MicrobitRadioBridgeConnection | undefined> => {
  try {
    const serial = new MicrobitRadioBridgeConnection(
      usb,
      logging,
      remoteDeviceId,
    );
    await serial.connect();
    return serial;
  } catch (e) {
    return undefined;
  }
};
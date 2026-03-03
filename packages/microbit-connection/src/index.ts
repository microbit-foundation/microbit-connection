/**
 * @module @microbit/microbit-connection
 */
import { AccelerometerData, AccelerometerDataEvent } from "./accelerometer.js";
import { BoardId } from "./board-id.js";
import { ButtonEvent, ButtonEventType, ButtonState } from "./buttons.js";
import { DeviceBondState } from "./device-bond-state.js";
import {
  AfterRequestDevice,
  BackgroundErrorEvent,
  BeforeRequestDevice,
  BoardVersion,
  ConnectOptions,
  ConnectionAvailabilityStatus,
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceConnection,
  DeviceConnectionEventMap,
  DeviceError,
  DeviceErrorCode,
  FlashDataError,
  FlashDataSource,
  FlashOptions,
  ProgressCallback,
  ProgressStage,
  assertConnected,
} from "./device.js";
import { TypedEventTarget } from "./events.js";
import { LedMatrix } from "./led.js";
import { Logging, LoggingEvent } from "./logging.js";
import { MagnetometerData, MagnetometerDataEvent } from "./magnetometer.js";
import {
  FlashEvent,
  SerialConnectionEventMap,
  SerialDataEvent,
  SerialErrorEvent,
  SerialResetEvent,
} from "./serial-events.js";
import { ServiceConnectionEventMap } from "./service-events.js";
import { UARTDataEvent } from "./uart.js";

export {
  AfterRequestDevice,
  BackgroundErrorEvent,
  BeforeRequestDevice,
  BoardId,
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceConnectionEventMap,
  DeviceError,
  FlashDataError,
  assertConnected,
  FlashEvent,
  ProgressStage,
  SerialConnectionEventMap,
  SerialDataEvent,
  SerialErrorEvent,
  SerialResetEvent,
  ServiceConnectionEventMap,
  TypedEventTarget,
  UARTDataEvent,
};

export type {
  AccelerometerData,
  AccelerometerDataEvent,
  BoardVersion,
  ConnectionAvailabilityStatus,
  ButtonEvent,
  ButtonEventType,
  ButtonState,
  ConnectOptions,
  DeviceBondState,
  DeviceConnection,
  DeviceErrorCode,
  FlashDataSource,
  FlashOptions,
  LedMatrix,
  Logging,
  LoggingEvent,
  MagnetometerData,
  MagnetometerDataEvent,
  ProgressCallback,
};

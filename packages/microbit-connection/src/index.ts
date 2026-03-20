/**
 * @module @microbit/microbit-connection
 */
import {
  BackgroundErrorData,
  BoardVersion,
  ConnectOptions,
  ConnectionAvailabilityStatus,
  ConnectionStatus,
  ConnectionStatusChange,
  DeviceConnection,
  DeviceError,
  DeviceErrorCode,
  FlashDataError,
  FlashDataSource,
  FlashOptions,
  ProgressCallback,
  ProgressStage,
  assertConnected,
} from "./device.js";
import { Logging, LoggingEvent } from "./logging.js";
import {
  AccelerometerData,
  ButtonData,
  ButtonEventType,
  ButtonState,
  LedMatrix,
  MagnetometerData,
  MicrobitEvent,
  UartData,
} from "./service-events.js";

export {
  ButtonState,
  ConnectionStatus,
  DeviceError,
  FlashDataError,
  assertConnected,
  ProgressStage,
};

export {
  Any,
  V1Source,
  V2Source,
  ButtonValue,
  GestureValue,
  PinValue,
} from "./microbit-events.js";

export type {
  AccelerometerData,
  BackgroundErrorData,
  BoardVersion,
  ButtonData,
  ButtonEventType,
  ConnectOptions,
  ConnectionAvailabilityStatus,
  ConnectionStatusChange,
  DeviceConnection,
  DeviceErrorCode,
  FlashDataSource,
  FlashOptions,
  LedMatrix,
  Logging,
  LoggingEvent,
  MagnetometerData,
  MicrobitEvent,
  ProgressCallback,
  UartData,
};

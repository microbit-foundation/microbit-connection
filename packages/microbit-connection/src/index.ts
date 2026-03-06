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
import { Logging, LoggingEvent } from "./logging.js";
import {
  AccelerometerData,
  ButtonData,
  ButtonEventType,
  ButtonState,
  LedMatrix,
  MagnetometerData,
  ServiceConnectionEventMap,
  UartData,
} from "./service-events.js";

export {
  ButtonState,
  ConnectionStatus,
  DeviceError,
  FlashDataError,
  assertConnected,
  ProgressStage,
  TypedEventTarget,
};

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
  DeviceConnectionEventMap,
  DeviceErrorCode,
  FlashDataSource,
  FlashOptions,
  LedMatrix,
  Logging,
  LoggingEvent,
  MagnetometerData,
  ProgressCallback,
  ServiceConnectionEventMap,
  UartData,
};

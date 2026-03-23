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
  PinValue,
  PinData,
  LedMatrix,
  MagnetometerData,
  TemperatureData,
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
  PinValue,
  PinData,
  LedMatrix,
  Logging,
  LoggingEvent,
  MagnetometerData,
  ProgressCallback,
  TemperatureData,
  UartData,
};

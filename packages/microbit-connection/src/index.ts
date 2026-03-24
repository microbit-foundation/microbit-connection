/**
 * @module @microbit/microbit-connection
 */
import {
  BackgroundErrorData,
  BoardVersion,
  BondMode,
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
  BondMode,
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
  ProgressCallback,
  UartData,
};

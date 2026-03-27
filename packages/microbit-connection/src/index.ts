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
  ButtonActionData,
  ButtonData,
  ButtonActionType,
  ButtonState,
  GestureData,
  MicrobitEventData,
  PinValue,
  PinData,
  LedMatrix,
  MagnetometerData,
  TemperatureData,
  UartData,
} from "./service-events.js";
import { ButtonAction, GestureEvent } from "./microbit-events.js";

export {
  ButtonAction,
  ButtonState,
  ConnectionStatus,
  DeviceError,
  FlashDataError,
  GestureEvent,
  assertConnected,
  ProgressStage,
};

export type {
  AccelerometerData,
  BackgroundErrorData,
  BoardVersion,
  ButtonActionData,
  ButtonData,
  ButtonActionType,
  ConnectOptions,
  ConnectionAvailabilityStatus,
  ConnectionStatusChange,
  DeviceConnection,
  DeviceErrorCode,
  FlashDataSource,
  FlashOptions,
  GestureData,
  MicrobitEventData,
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

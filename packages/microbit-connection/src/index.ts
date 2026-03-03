/**
 * @module @microbit/microbit-connection
 */
import { AccelerometerData } from "./accelerometer.js";
import { BoardId } from "./board-id.js";
import { ButtonData, ButtonEventType, ButtonState } from "./buttons.js";
import { DeviceBondState } from "./device-bond-state.js";
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
import { LedMatrix } from "./led.js";
import { Logging, LoggingEvent } from "./logging.js";
import { MagnetometerData } from "./magnetometer.js";
import {
  SerialConnectionEventMap,
  SerialData,
  SerialErrorData,
} from "./serial-events.js";
import { ServiceConnectionEventMap, UartData } from "./service-events.js";

export {
  BoardId,
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
  ButtonState,
  ConnectOptions,
  ConnectionAvailabilityStatus,
  ConnectionStatusChange,
  DeviceBondState,
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
  SerialConnectionEventMap,
  SerialData,
  SerialErrorData,
  ServiceConnectionEventMap,
  UartData,
};

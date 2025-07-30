import { AccelerometerData, AccelerometerDataEvent } from "./accelerometer.js";
import {
  createWebBluetoothConnection,
  MicrobitWebBluetoothConnection,
  MicrobitWebBluetoothConnectionOptions,
} from "./bluetooth.js";
import { BoardId } from "./board-id.js";
import { ButtonEvent, ButtonEventType, ButtonState } from "./buttons.js";
import {
  AfterRequestDevice,
  BackgroundErrorEvent,
  BeforeRequestDevice,
  BoardVersion,
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceConnection,
  DeviceConnectionEventMap,
  DeviceError,
  DeviceErrorCode,
  FlashDataError,
  FlashDataSource,
  FlashOptions,
} from "./device.js";
import { TypedEventTarget } from "./events.js";
import { createUniversalHexFlashDataSource } from "./hex-flash-data-source.js";
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
import {
  createRadioBridgeConnection,
  MicrobitRadioBridgeConnection,
  MicrobitRadioBridgeConnectionOptions,
} from "./usb-radio-bridge.js";
import {
  createWebUSBConnection,
  DeviceFallbackMode,
  MicrobitWebUSBConnection,
  MicrobitWebUSBConnectionOptions,
} from "./usb.js";

export {
  AfterRequestDevice,
  BackgroundErrorEvent,
  BeforeRequestDevice,
  BoardId,
  ConnectionStatus,
  ConnectionStatusEvent,
  createRadioBridgeConnection,
  createUniversalHexFlashDataSource,
  createWebBluetoothConnection,
  createWebUSBConnection,
  DeviceConnectionEventMap,
  DeviceFallbackMode,
  DeviceError,
  FlashDataError,
  FlashEvent,
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
  ButtonEvent,
  ButtonEventType,
  ButtonState,
  DeviceConnection,
  DeviceErrorCode,
  FlashDataSource,
  FlashOptions,
  LedMatrix,
  Logging,
  LoggingEvent,
  MagnetometerData,
  MagnetometerDataEvent,
  MicrobitRadioBridgeConnection,
  MicrobitRadioBridgeConnectionOptions,
  MicrobitWebBluetoothConnection,
  MicrobitWebBluetoothConnectionOptions,
  MicrobitWebUSBConnection,
  MicrobitWebUSBConnectionOptions,
};

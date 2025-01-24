import { AccelerometerData, AccelerometerDataEvent } from "./accelerometer.js";
import { MicrobitWebBluetoothConnection } from "./bluetooth.js";
import { BoardId } from "./board-id.js";
import { ButtonEvent, ButtonEventType, ButtonState } from "./buttons.js";
import {
  AfterRequestDevice,
  BeforeRequestDevice,
  BoardVersion,
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceConnection,
  DeviceConnectionEventMap,
  DeviceError,
  DeviceErrorCode,
  DeviceRadioBridgeConnection,
  DeviceWebBluetoothConnection,
  DeviceWebUSBConnection,
  FlashDataError,
  FlashDataSource,
  FlashEvent,
  FlashOptions,
  SerialDataEvent,
  SerialErrorEvent,
  SerialResetEvent,
} from "./device.js";
import { TypedEventTarget } from "./events.js";
import { createUniversalHexFlashDataSource } from "./hex-flash-data-source.js";
import { LedMatrix } from "./led.js";
import { MagnetometerData, MagnetometerDataEvent } from "./magnetometer.js";
import { ServiceConnectionEventMap } from "./service-events.js";
import { MicrobitRadioBridgeConnection } from "./usb-radio-bridge.js";
import { MicrobitWebUSBConnection } from "./usb.js";

export {
  AfterRequestDevice,
  BeforeRequestDevice,
  BoardId,
  ConnectionStatus,
  ConnectionStatusEvent,
  createUniversalHexFlashDataSource,
  DeviceConnectionEventMap,
  DeviceError,
  FlashDataError,
  FlashEvent,
  MicrobitRadioBridgeConnection,
  MicrobitWebBluetoothConnection,
  MicrobitWebUSBConnection,
  SerialDataEvent,
  SerialErrorEvent,
  SerialResetEvent,
  ServiceConnectionEventMap,
  TypedEventTarget,
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
  DeviceRadioBridgeConnection,
  DeviceWebBluetoothConnection,
  DeviceWebUSBConnection,
  FlashOptions,
  FlashDataSource,
  LedMatrix,
  MagnetometerData,
  MagnetometerDataEvent,
};

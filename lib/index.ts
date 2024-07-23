import { MicrobitWebUSBConnection } from "./usb.js";
import { MicrobitWebBluetoothConnection } from "./bluetooth.js";
import { MicrobitRadioBridgeConnection } from "./usb-radio-bridge.js";
import { BoardId } from "./board-id.js";
import {
  DeviceConnection,
  AfterRequestDevice,
  BeforeRequestDevice,
  BoardVersion,
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceError,
  DeviceErrorCode,
  DeviceConnectionEventMap,
  FlashDataError,
  FlashDataSource,
  FlashEvent,
  SerialDataEvent,
  SerialErrorEvent,
  SerialResetEvent,
} from "./device.js";
import { createUniversalHexFlashDataSource } from "./hex-flash-data-source.js";
import { AccelerometerDataEvent } from "./accelerometer.js";

export {
  MicrobitWebUSBConnection,
  MicrobitWebBluetoothConnection,
  MicrobitRadioBridgeConnection,
  BoardId,
  createUniversalHexFlashDataSource,
  AfterRequestDevice,
  BeforeRequestDevice,
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceConnectionEventMap,
  DeviceError,
  FlashDataError,
  FlashEvent,
  SerialDataEvent,
  SerialErrorEvent,
  SerialResetEvent,
};

export type {
  AccelerometerDataEvent,
  DeviceConnection,
  BoardVersion,
  DeviceErrorCode,
  FlashDataSource,
};

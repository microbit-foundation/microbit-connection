import { MicrobitWebUSBConnection } from "./usb.js";
import { MicrobitWebBluetoothConnection } from "./bluetooth.js";
import { BoardId } from "./board-id.js";
import {
  DeviceConnection,
  AfterRequestDevice,
  BeforeRequestDevice,
  BoardVersion,
  ConnectOptions,
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

export {
  MicrobitWebUSBConnection,
  MicrobitWebBluetoothConnection,
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
  DeviceConnection,
  BoardVersion,
  ConnectOptions,
  DeviceErrorCode,
  FlashDataSource,
};

import { MicrobitWebUSBConnection } from "./usb";
import { MicrobitWebBluetoothConnection } from "./bluetooth";
import { BoardId } from "./board-id";
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
} from "./device";
import { HexFlashDataSource } from "./hex-flash-data-source";

export {
  MicrobitWebUSBConnection,
  MicrobitWebBluetoothConnection,
  BoardId,
  HexFlashDataSource,
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

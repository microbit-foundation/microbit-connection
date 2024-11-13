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
  FlashDataError,
  FlashDataSource,
  FlashEvent,
  SerialDataEvent,
  SerialErrorEvent,
  SerialResetEvent,
} from "./device.js";
import { TrackingEventTarget } from "./events.js";
import { createUniversalHexFlashDataSource } from "./hex-flash-data-source.js";
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
  TrackingEventTarget,
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
};

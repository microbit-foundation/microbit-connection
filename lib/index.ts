import { AccelerometerData, AccelerometerDataEvent } from "./accelerometer.js";
import {
  MicrobitWebBluetoothConnection,
  MicrobitWebBluetoothConnectionImpl,
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
  FlashEvent,
  FlashOptions,
  SerialDataEvent,
  SerialErrorEvent,
  SerialResetEvent,
} from "./device.js";
import { TypedEventTarget } from "./events.js";
import { createUniversalHexFlashDataSource } from "./hex-flash-data-source.js";
import { LedMatrix } from "./led.js";
import { Logging, LoggingEvent } from "./logging.js";
import { MagnetometerData, MagnetometerDataEvent } from "./magnetometer.js";
import { ServiceConnectionEventMap } from "./service-events.js";
import { UARTDataEvent } from "./uart.js";
import {
  MicrobitRadioBridgeConnection,
  MicrobitRadioBridgeConnectionImpl,
  MicrobitRadioBridgeConnectionOptions,
} from "./usb-radio-bridge.js";
import {
  MicrobitWebUSBConnection,
  MicrobitWebUSBConnectionImpl,
  MicrobitWebUSBConnectionOptions,
} from "./usb.js";

export {
  AfterRequestDevice,
  BackgroundErrorEvent,
  BeforeRequestDevice,
  BoardId,
  ConnectionStatus,
  ConnectionStatusEvent,
  createUniversalHexFlashDataSource,
  DeviceConnectionEventMap,
  DeviceError,
  FlashDataError,
  FlashEvent,
  MicrobitRadioBridgeConnectionImpl,
  MicrobitWebBluetoothConnectionImpl,
  MicrobitWebUSBConnectionImpl,
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

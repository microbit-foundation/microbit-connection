/**
 * @module @microbit/microbit-connection/usb
 */
export {
  createUSBConnection,
  DeviceSelectionMode,
  type MicrobitUSBConnection,
  type MicrobitUSBConnectionOptions,
} from "./connection.js";
export type {
  SerialConnectionEventMap,
  SerialData,
  SerialErrorData,
} from "./serial-events.js";

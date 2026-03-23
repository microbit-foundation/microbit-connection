import { BleClient } from "@capacitor-community/bluetooth-le";
import { Service } from "../device-wrapper.js";
import {
  PinValue,
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "../../service-events.js";
import { profile } from "../profile.js";
import { mapBleError } from "../ble-error.js";

function pinsToBitmask(pins: number[]): number {
  let mask = 0;
  for (const pin of pins) {
    mask |= 1 << pin;
  }
  return mask;
}

function bitmaskToPins(mask: number): number[] {
  const pins: number[] = [];
  for (let i = 0; i < 19; i++) {
    if (mask & (1 << i)) {
      pins.push(i);
    }
  }
  return pins;
}

export class IoPinService implements Service {
  uuid = profile.ioPin.id;

  constructor(
    private deviceId: string,
    private dispatchTypedEvent: TypedServiceEventDispatcher,
  ) {}

  getRelevantEvents(): TypedServiceEvent[] {
    return ["pinchanged"];
  }

  /**
   * Gets which pins are configured as analog.
   * All other pins are digital (the default).
   *
   * @returns array of pin numbers (0-18) configured as analog.
   */
  async getAnalogPins(): Promise<number[]> {
    const dataView = await BleClient.read(
      this.deviceId,
      profile.ioPin.id,
      profile.ioPin.characteristics.pinAdConfiguration.id,
    );
    return bitmaskToPins(dataView.getUint32(0, true));
  }

  /**
   * Sets which pins are configured as analog.
   * All other pins become digital (the default).
   *
   * @param pins array of pin numbers (0-18) to configure as analog.
   */
  async setAnalogPins(pins: number[]): Promise<void> {
    const dataView = new DataView(new ArrayBuffer(4));
    dataView.setUint32(0, pinsToBitmask(pins), true);
    await BleClient.write(
      this.deviceId,
      profile.ioPin.id,
      profile.ioPin.characteristics.pinAdConfiguration.id,
      dataView,
    );
  }

  /**
   * Gets which pins are configured as inputs.
   * Input pins are monitored by the service and their values reported
   * via notifications and reads of the pin data characteristic.
   * All other pins are outputs (the default).
   *
   * @returns array of pin numbers (0-18) configured as inputs.
   */
  async getInputPins(): Promise<number[]> {
    const dataView = await BleClient.read(
      this.deviceId,
      profile.ioPin.id,
      profile.ioPin.characteristics.pinIoConfiguration.id,
    );
    return bitmaskToPins(dataView.getUint32(0, true));
  }

  /**
   * Sets which pins are configured as inputs.
   * Input pins are monitored by the service and their values reported
   * via notifications and reads of the pin data characteristic.
   * All other pins become outputs (the default).
   *
   * @param pins array of pin numbers (0-18) to configure as inputs.
   */
  async setInputPins(pins: number[]): Promise<void> {
    const dataView = new DataView(new ArrayBuffer(4));
    dataView.setUint32(0, pinsToBitmask(pins), true);
    await BleClient.write(
      this.deviceId,
      profile.ioPin.id,
      profile.ioPin.characteristics.pinIoConfiguration.id,
      dataView,
    );
  }

  /**
   * Reads pin data for all active input pins.
   * For digital pins, value is 0 or 1.
   * For analog pins, value is 0-255 (10-bit analog value >> 2).
   */
  async readPins(): Promise<PinValue[]> {
    const dataView = await BleClient.read(
      this.deviceId,
      profile.ioPin.id,
      profile.ioPin.characteristics.pinData.id,
    );
    return this.dataViewToPinData(dataView);
  }

  /**
   * Writes pin data for output pins.
   * Only pins configured as outputs (not active inputs) will be affected.
   * For digital pins, value is 0 or 1.
   * For analog pins, value 0-255 is scaled to 0-1023 on the device.
   */
  async writePins(data: PinValue[]): Promise<void> {
    const dataView = new DataView(new ArrayBuffer(data.length * 2));
    for (let i = 0; i < data.length; i++) {
      dataView.setUint8(i * 2, data[i].pin);
      dataView.setUint8(i * 2 + 1, data[i].value);
    }
    await BleClient.write(
      this.deviceId,
      profile.ioPin.id,
      profile.ioPin.characteristics.pinData.id,
      dataView,
    );
  }

  /**
   * Sets PWM output on a pin.
   *
   * @param pin Pin number (0-18).
   * @param value Analog value (0-1024).
   * @param period Period in microseconds.
   */
  async setPwm(pin: number, value: number, period: number): Promise<void> {
    const dataView = new DataView(new ArrayBuffer(7));
    dataView.setUint8(0, pin);
    dataView.setUint16(1, value, true);
    dataView.setUint32(3, period, true);
    await BleClient.write(
      this.deviceId,
      profile.ioPin.id,
      profile.ioPin.characteristics.pwmControl.id,
      dataView,
    );
  }

  async startNotifications(type: TypedServiceEvent): Promise<void> {
    if (type !== "pinchanged") {
      return;
    }
    try {
      await BleClient.startNotifications(
        this.deviceId,
        profile.ioPin.id,
        profile.ioPin.characteristics.pinData.id,
        (value) => {
          const data = this.dataViewToPinData(value);
          this.dispatchTypedEvent("pinchanged", { data });
        },
      );
    } catch (e) {
      this.dispatchTypedEvent("backgrounderror", {
        error: mapBleError(e),
        event: type,
      });
    }
  }

  async stopNotifications(type: TypedServiceEvent): Promise<void> {
    if (type !== "pinchanged") {
      return;
    }
    try {
      await BleClient.stopNotifications(
        this.deviceId,
        profile.ioPin.id,
        profile.ioPin.characteristics.pinData.id,
      );
    } catch (e) {
      this.dispatchTypedEvent("backgrounderror", {
        error: mapBleError(e),
        event: type,
      });
    }
  }

  private dataViewToPinData(dataView: DataView): PinValue[] {
    const result: PinValue[] = [];
    for (let i = 0; i + 1 < dataView.byteLength; i += 2) {
      result.push({
        pin: dataView.getUint8(i),
        value: dataView.getUint8(i + 1),
      });
    }
    return result;
  }
}

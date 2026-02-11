import { BleClient } from "@capacitor-community/bluetooth-le";
import { Service } from "./bluetooth-device-wrapper.js";
import { profile } from "./bluetooth-profile.js";
import { LedMatrix } from "./led.js";
import { TypedServiceEvent } from "./service-events.js";

const createLedMatrix = (): LedMatrix => {
  return [
    [false, false, false, false, false],
    [false, false, false, false, false],
    [false, false, false, false, false],
    [false, false, false, false, false],
    [false, false, false, false, false],
  ];
};

export class LedService implements Service {
  uuid = profile.led.id;

  constructor(private deviceId: string) {}

  getRelevantEvents(): TypedServiceEvent[] {
    return [];
  }

  async getLedMatrix(): Promise<LedMatrix> {
    const dataView = await BleClient.read(
      this.deviceId,
      profile.led.id,
      profile.led.characteristics.matrixState.id,
    );
    return this.dataViewToLedMatrix(dataView);
  }

  async setLedMatrix(value: LedMatrix): Promise<void> {
    const dataView = this.ledMatrixToDataView(value);
    await BleClient.write(
      this.deviceId,
      profile.led.id,
      profile.led.characteristics.matrixState.id,
      dataView,
    );
  }

  private dataViewToLedMatrix(dataView: DataView): LedMatrix {
    if (dataView.byteLength !== 5) {
      throw new Error("Unexpected LED matrix byte length");
    }
    const matrix = createLedMatrix();
    for (let row = 0; row < 5; ++row) {
      const rowByte = dataView.getUint8(row);
      for (let column = 0; column < 5; ++column) {
        const columnMask = 0x1 << (4 - column);
        matrix[row][column] = (rowByte & columnMask) != 0;
      }
    }
    return matrix;
  }

  private ledMatrixToDataView(matrix: LedMatrix): DataView {
    const dataView = new DataView(new ArrayBuffer(5));
    for (let row = 0; row < 5; ++row) {
      let rowByte = 0;
      for (let column = 0; column < 5; ++column) {
        const columnMask = 0x1 << (4 - column);
        if (matrix[row][column]) {
          rowByte |= columnMask;
        }
      }
      dataView.setUint8(row, rowByte);
    }
    return dataView;
  }

  async setText(text: string) {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > 20) {
      throw new Error("Text must be <= 20 bytes when encoded as UTF-8");
    }
    await BleClient.write(
      this.deviceId,
      profile.led.id,
      profile.led.characteristics.text.id,
      new DataView(bytes.buffer),
    );
  }

  async setScrollingDelay(value: number) {
    const dataView = new DataView(new ArrayBuffer(2));
    dataView.setUint16(0, value, true);
    await BleClient.write(
      this.deviceId,
      profile.led.id,
      profile.led.characteristics.scrollingDelay.id,
      dataView,
    );
  }

  async getScrollingDelay(): Promise<number> {
    const dataView = await BleClient.read(
      this.deviceId,
      profile.led.id,
      profile.led.characteristics.scrollingDelay.id,
    );
    return dataView.getUint16(0, true);
  }

  async startNotifications(type: TypedServiceEvent): Promise<void> {}

  async stopNotifications(type: TypedServiceEvent): Promise<void> {}
}

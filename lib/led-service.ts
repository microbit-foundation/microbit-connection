import { Service } from "./bluetooth-device-wrapper.js";
import { profile } from "./bluetooth-profile.js";
import { BackgroundErrorEvent, DeviceError } from "./device.js";
import { LedMatrix } from "./led.js";
import {
  TypedServiceEvent,
  TypedServiceEventDispatcher,
} from "./service-events.js";

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
  constructor(
    private matrixStateCharacteristic: BluetoothRemoteGATTCharacteristic,
    private scrollingDelayCharacteristic: BluetoothRemoteGATTCharacteristic,
    private textCharactertistic: BluetoothRemoteGATTCharacteristic,
    private queueGattOperation: <R>(action: () => Promise<R>) => Promise<R>,
  ) {}

  static async createService(
    gattServer: BluetoothRemoteGATTServer,
    dispatcher: TypedServiceEventDispatcher,
    queueGattOperation: <R>(action: () => Promise<R>) => Promise<R>,
    listenerInit: boolean,
  ): Promise<LedService | undefined> {
    let ledService: BluetoothRemoteGATTService;
    try {
      ledService = await gattServer.getPrimaryService(profile.led.id);
    } catch (err) {
      if (listenerInit) {
        dispatcher("backgrounderror", new BackgroundErrorEvent(err as string));
        return;
      } else {
        throw new DeviceError({
          code: "service-missing",
          message: err as string,
        });
      }
    }
    const matrixStateCharacteristic = await ledService.getCharacteristic(
      profile.led.characteristics.matrixState.id,
    );
    const scrollingDelayCharacteristic = await ledService.getCharacteristic(
      profile.led.characteristics.scrollingDelay.id,
    );
    const textCharacteristic = await ledService.getCharacteristic(
      profile.led.characteristics.text.id,
    );
    return new LedService(
      matrixStateCharacteristic,
      scrollingDelayCharacteristic,
      textCharacteristic,
      queueGattOperation,
    );
  }

  async getLedMatrix(): Promise<LedMatrix> {
    const dataView = await this.queueGattOperation(() =>
      this.matrixStateCharacteristic.readValue(),
    );
    return this.dataViewToLedMatrix(dataView);
  }

  async setLedMatrix(value: LedMatrix): Promise<void> {
    const dataView = this.ledMatrixToDataView(value);
    return this.queueGattOperation(() =>
      this.matrixStateCharacteristic.writeValue(dataView),
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
    return this.queueGattOperation(() =>
      this.textCharactertistic.writeValue(bytes),
    );
  }

  async setScrollingDelay(value: number) {
    const dataView = new DataView(new ArrayBuffer(2));
    dataView.setUint16(0, value, true);
    return this.queueGattOperation(() =>
      this.scrollingDelayCharacteristic.writeValue(dataView),
    );
  }

  async getScrollingDelay(): Promise<number> {
    const dataView = await this.queueGattOperation(() =>
      this.scrollingDelayCharacteristic.readValue(),
    );
    return dataView.getUint16(0, true);
  }

  async startNotifications(type: TypedServiceEvent): Promise<void> {}

  async stopNotifications(type: TypedServiceEvent): Promise<void> {}
}

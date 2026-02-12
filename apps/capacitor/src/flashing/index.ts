import {
  createUniversalHexFlashDataSource,
  type ProgressCallback,
  MicrobitWebBluetoothConnection,
} from "@microbit/microbit-connection";

export async function flash(
  connection: MicrobitWebBluetoothConnection,
  deviceName: string,
  hexStr: string,
  progress: ProgressCallback,
): Promise<void> {
  try {
    connection.setNameFilter(deviceName);

    const dataSource = createUniversalHexFlashDataSource(hexStr);

    await connection.flash(dataSource, {
      progress,
      partial: true,
    });
  } finally {
    connection.dispose();
  }
}

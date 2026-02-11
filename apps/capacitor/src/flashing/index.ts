import {
  createWebBluetoothConnection,
  createUniversalHexFlashDataSource,
  type ProgressCallback,
} from "@microbit/microbit-connection";

export async function flash(
  deviceName: string,
  hexStr: string,
  progress: ProgressCallback,
): Promise<void> {
  const connection = createWebBluetoothConnection();

  try {
    await connection.initialize();
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

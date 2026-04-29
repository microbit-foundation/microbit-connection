import { type ProgressCallback } from "@microbit/microbit-connection";
import { createUniversalHexFlashDataSource } from "@microbit/microbit-connection/universal-hex";
import type { AnyConnection } from "../hooks/use-connection.ts";

export async function flash(
  connection: AnyConnection,
  deviceName: string | null,
  hexStr: string,
  progress: ProgressCallback,
): Promise<void> {
  const dataSource = createUniversalHexFlashDataSource(hexStr);

  if (connection.type === "usb") {
    await connection.flash(dataSource, {
      progress,
      partial: true,
    });
  } else if (connection.type === "bluetooth") {
    if (deviceName) {
      connection.setNameFilter(deviceName);
    }
    await connection.flash(dataSource, {
      progress,
      partial: true,
    });
  }
}

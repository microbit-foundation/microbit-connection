import MemoryMap from "nrf-intel-hex";
import {
  BoardVersion,
  DeviceError,
  FlashDataError,
  ProgressCallback,
  ProgressStage,
} from "../../device.js";
import { DfuService, NORDIC_DFU_SERVICE } from "../services/dfu-service.js";
import { refreshServicesForV1IfDesiredServiceMissing } from "./flashing-v1.js";
import { flashDfu } from "./nordic-dfu.js";
import { BluetoothDeviceWrapper } from "../device-wrapper.js";
import { delay } from "../../async-util.js";

/**
 * Perform a full flash via Nordic's DFU service.
 *
 * The connection is closed before handing off to Nordic's service which will
 * connect again.
 *
 * The device is assumed to be bonded.
 *
 * @throws {DeviceError} On flash failure.
 */
export async function fullFlash(
  connection: BluetoothDeviceWrapper,
  boardVersion: BoardVersion,
  memoryMap: MemoryMap,
  progress: ProgressCallback,
): Promise<void> {
  connection.log("Full flash");
  progress(ProgressStage.FullFlashing);
  const { deviceId } = connection.bleDevice;

  try {
    if (boardVersion === "V1") {
      connection.log("Rebooting V1 to bootloader");

      const dfuService = new DfuService(deviceId);
      try {
        await dfuService.requestRebootToBootloader();
      } catch (e) {
        connection.error("Failed to request reboot to bootloader", e);
        throw new DeviceError({
          code: "connection-error",
          message:
            e instanceof Error ? e.message : "Failed to reboot to bootloader",
          cause: e,
        });
      }

      // Wait for device to automatically disconnect as it reboots into bootloader
      connection.log("Waiting for device to reboot and disconnect");
      try {
        await connection.waitForDisconnect(3000);
      } catch {
        connection.log(
          "Device did not disconnect automatically, disconnecting manually",
        );
        await connection.disconnect();
      }

      // Give device time to disconnect and reboot into bootloader mode
      await delay(2500);

      // Reconnect to device now in bootloader mode
      progress(ProgressStage.Connecting);
      await connection.connect();
      await refreshServicesForV1IfDesiredServiceMissing(
        deviceId,
        NORDIC_DFU_SERVICE,
      );
    }
  } finally {
    // The Nordic code opens its own connection.
    await connection.disconnect();

    // If we've previously been connected, maybe this helps???
    await delay(3000);
  }

  const appBin = createAppBin(memoryMap, boardVersion);
  if (appBin === null) {
    connection.log("Invalid hex (app bin case)");
    throw new FlashDataError("Invalid hex data: could not extract app binary");
  }
  connection.log(`Extracted app bin: ${appBin.length} bytes`);
  await flashDfu(connection, boardVersion, appBin, progress);
}

const createAppBin = (
  memoryMap: MemoryMap,
  boardVersion: BoardVersion,
): Uint8Array | null => {
  const appRegionBoundaries = {
    V1: { start: 0x18000, end: 0x3c000 },
    V2: { start: 0x1c000, end: 0x77000 },
  }[boardVersion];

  // Calculate data size within the app region
  let maxAddress = appRegionBoundaries.start;
  for (const [blockAddr, block] of memoryMap) {
    const blockEnd = blockAddr + block.length;
    if (
      blockEnd > appRegionBoundaries.start &&
      blockAddr < appRegionBoundaries.end
    ) {
      maxAddress = Math.max(
        maxAddress,
        Math.min(blockEnd, appRegionBoundaries.end),
      );
    }
  }

  let size = maxAddress - appRegionBoundaries.start;
  // 4-byte alignment required by DFU
  size = Math.ceil(size / 4) * 4;

  return memoryMap.slicePad(appRegionBoundaries.start, size);
};

import MemoryMap from "nrf-intel-hex";
import { BluetoothDeviceWrapper } from "../bluetooth-device-wrapper.js";
import {
  PacketState,
  PartialFlashingService,
  RegionId,
} from "../partial-flashing-service.js";
import { findMakeCodeRegionInMemoryMap } from "./flashing-makecode.js";
import { DisconnectError } from "../async-util.js";
import { DeviceError, ProgressCallback, ProgressStage } from "../device.js";

export enum PartialFlashResult {
  Success = "Success",
  AttemptFullFlash = "AttemptFullFlash",
}

const partialFlash = async (
  connection: BluetoothDeviceWrapper,
  memoryMap: MemoryMap,
  progress: ProgressCallback,
): Promise<PartialFlashResult> => {
  const pf = new PartialFlashingService(connection);
  await pf.startNotifications();
  let result;

  try {
    result = await connection.raceDisconnectAndTimeout(
      partialFlashInternal(connection, pf, memoryMap, progress),
      { timeout: 30_000, actionName: "partial flash" },
    );
  } catch (e) {
    connection.error("Partial flash failed", e);
    if (e instanceof DeviceError) {
      throw e;
    }
    throw new DeviceError({
      code: "flash-partial-failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    await pf.stopNotifications();
  } catch (e) {
    // V1 disconnects quickly after a partial flash.
    if (!(e instanceof DisconnectError)) {
      connection.error("Error stopping notifications", e);
    }
  }

  return result;
};

const partialFlashInternal = async (
  connection: BluetoothDeviceWrapper,
  pf: PartialFlashingService,
  memoryMap: MemoryMap,
  progress: ProgressCallback,
): Promise<PartialFlashResult> => {
  connection.log("Partial flash");
  progress(ProgressStage.PartialFlashing);
  const deviceCodeRegion = await pf.getRegionInfo(RegionId.MakeCode);
  if (deviceCodeRegion === null) {
    connection.log("Could not read code region");
    return PartialFlashResult.AttemptFullFlash;
  }

  const deviceDalRegion = await pf.getRegionInfo(RegionId.Dal);
  if (deviceDalRegion === null) {
    connection.log("Could not read DAL region");
    return PartialFlashResult.AttemptFullFlash;
  }

  progress(ProgressStage.PartialFlashing);

  const fileCodeRegion = findMakeCodeRegionInMemoryMap(
    memoryMap,
    deviceCodeRegion,
  );
  if (fileCodeRegion === null) {
    connection.log("No partial flash data");
    return PartialFlashResult.AttemptFullFlash;
  }

  if (fileCodeRegion.hash !== deviceDalRegion.hash) {
    connection.log(
      `DAL hash comparison failed. Hex: ${fileCodeRegion.hash} vs device: ${deviceDalRegion.hash}`,
    );
    return PartialFlashResult.AttemptFullFlash;
  }
  if (deviceCodeRegion.start !== fileCodeRegion.start) {
    connection.log("Code start address doesn't match");
    return PartialFlashResult.AttemptFullFlash;
  }

  let nextPacketNumber = 0;
  outer: for (
    let offset = fileCodeRegion.start;
    offset < fileCodeRegion.end;

  ) {
    const batchStartAddress = offset;

    for (let packetInBatch = 0; packetInBatch < 4; ++packetInBatch) {
      const packetNumber = nextPacketNumber++;
      const packetDataOffset = offset + packetInBatch * 16;

      if (packetInBatch < 3) {
        await pf.writeFlash(
          memoryMap,
          batchStartAddress,
          packetDataOffset,
          packetNumber,
          packetInBatch,
        );
      } else {
        const result = await pf.writeFlashForNotification(
          memoryMap,
          batchStartAddress,
          packetDataOffset,
          packetNumber,
          packetInBatch,
        );
        if (result === PacketState.Retransmit) {
          // Retry the whole 64 bytes.
          connection.log(`Retransmit requested at offset ${offset}`);
          continue outer;
        } else {
          progress(
            ProgressStage.PartialFlashing,
            (offset - fileCodeRegion.start) /
              (fileCodeRegion.end - fileCodeRegion.start),
          );
        }
      }
    }
    offset += 64;
  }
  await pf.writeEndOfFlashPacket();
  progress(ProgressStage.PartialFlashing, 1);
  return PartialFlashResult.Success;
};

export default partialFlash;

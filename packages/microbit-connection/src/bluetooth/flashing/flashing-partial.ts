import MemoryMap from "nrf-intel-hex";
import {
  BluetoothDeviceWrapper,
  isCharacteristicNotFoundError,
} from "../device-wrapper.js";
import {
  MicroBitMode,
  PacketState,
  PartialFlashingService,
  RegionId,
} from "../services/partial-flashing-service.js";
import { findMakeCodeRegionInMemoryMap } from "./flashing-makecode.js";
import { DisconnectError } from "../../async-util.js";
import {
  BoardVersion,
  DeviceError,
  ProgressCallback,
  ProgressStage,
} from "../../device.js";

const FLASH_PAGE_SIZE: Record<BoardVersion, number> = {
  V1: 0x400,
  V2: 0x1000,
};

export enum PartialFlashResult {
  Success = "Success",
  AlreadyUpToDate = "AlreadyUpToDate",
  AttemptFullFlash = "AttemptFullFlash",
}

const partialFlash = async (
  connection: BluetoothDeviceWrapper,
  boardVersion: BoardVersion,
  memoryMap: MemoryMap,
  progress: ProgressCallback,
): Promise<PartialFlashResult> => {
  const pf = new PartialFlashingService(connection);
  let result;

  try {
    // For iOS, starting notifications can throw error if user does not choose
    // "Pair" in the pairing dialog. We cannot rely on connect to catch this
    // because user can forget micro:bit before cancelling the pairing dialog.
    await pf.startNotifications();

    result = await connection.raceDisconnectAndTimeout(
      partialFlashInternal(connection, pf, boardVersion, memoryMap, progress),
      { timeout: 30_000, actionName: "partial flash" },
    );
  } catch (e) {
    connection.error("Partial flash failed", e);
    if (isCharacteristicNotFoundError(e)) {
      return PartialFlashResult.AttemptFullFlash;
    }
    if (
      // Error thrown in iOS only for when user cancels the pairing dialog.
      e instanceof Error &&
      e.message === "Encryption is insufficient."
    ) {
      connection.setBonded(false);
    }
    if (e instanceof DeviceError) {
      throw e;
    }
    throw new DeviceError({
      code: "connection-error",
      message: e instanceof Error ? e.message : String(e),
      cause: e,
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
  boardVersion: BoardVersion,
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

  if (/^0+$/.test(deviceDalRegion.hash) || /^0+$/.test(deviceCodeRegion.hash)) {
    connection.log("Device reported zero hash, skipping partial flash");
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

  if (fileCodeRegion.appHash === deviceCodeRegion.hash) {
    connection.log("Application hash matches, already up to date");
    await pf.resetToMode(MicroBitMode.Application);
    return PartialFlashResult.AlreadyUpToDate;
  }

  // The device-side partial flash service erases each flash page when it
  // receives a write at a page-aligned address. After erase, every byte
  // in the page is 0xFF, so writing 0xFF within an already-erased page
  // is redundant. We skip interior 0xFF blocks but always send at page
  // boundaries to trigger the erase.
  //
  // See the page-erase logic:
  //   V1: https://github.com/lancaster-university/microbit-dal/blob/master/source/bluetooth/MicroBitPartialFlashingService.cpp
  //   V2: https://github.com/lancaster-university/codal-microbit-v2/blob/master/source/bluetooth/MicroBitPartialFlashingService.cpp
  const flashPageSize = FLASH_PAGE_SIZE[boardVersion];

  let nextPacketNumber = 0;
  outer: for (
    let offset = fileCodeRegion.start;
    offset < fileCodeRegion.end;

  ) {
    // Skip 64-byte blocks that are entirely 0xFF, unless at a page boundary.
    // At page boundaries we must always send data so the device erases the
    // page (setting all bytes to 0xFF). Interior 0xFF blocks can be skipped
    // because the page has already been erased by the boundary write.
    if (offset % flashPageSize !== 0) {
      if (memoryMap.slicePad(offset, 64).every((b) => b === 0xff)) {
        offset += 64;
        continue;
      }
    }

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

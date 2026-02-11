import { BoardId } from "./board-id.js";
import {
  FlashDataError as FlashDataError,
  BoardVersion,
  FlashDataSource,
} from "./device.js";
import {
  isUniversalHex,
  separateUniversalHex,
} from "@microbit/microbit-universal-hex";

// MakeCode hex files may contain embedded source in custom record types
// (type 0x0E) after the EOF record, and older files may have trailing blank
// lines. The nrf-intel-hex parser rejects any data after EOF, so we truncate.
export const truncateHexAfterEof = (hex: string): string => {
  // The EOF record is :00000001FF (case-insensitive per the Intel HEX spec).
  const eofIdx = hex.search(/:00000001FF/i);
  if (eofIdx < 0) return hex;
  return hex.slice(0, eofIdx + ":00000001FF".length) + "\n";
};

/**
 * A flash data source that converts universal hex files as needed.
 *
 * @param universalHex A hex file, potentially universal.
 */
export const createUniversalHexFlashDataSource = (
  universalHex: string,
): FlashDataSource => {
  return (boardVersion: BoardVersion) => {
    if (isUniversalHex(universalHex)) {
      const parts = separateUniversalHex(universalHex);
      const matching = parts.find(
        (p) => p.boardId == BoardId.forVersion(boardVersion).id,
      );
      if (!matching) {
        throw new FlashDataError("No matching part");
      }
      return Promise.resolve(matching.hex);
    }
    return Promise.resolve(universalHex);
  };
};

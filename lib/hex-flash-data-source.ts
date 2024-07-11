import { BoardId } from "./board-id";
import { FlashDataSource, HexGenerationError } from "./device";
import {
  isUniversalHex,
  separateUniversalHex,
} from "@microbit/microbit-universal-hex";

// I think we'd end up with two independently bundled copies of this for clients who also depend on microbit-fs.
import MemoryMap from "nrf-intel-hex";

export class HexFlashDataSource implements FlashDataSource {
  constructor(private hex: string) {}

  partialFlashData(boardId: BoardId): Promise<Uint8Array> {
    // Perhaps this would make more sense if we actually worked with a MemoryMap?
    // That's what microbit-fs is using internally.
    // Then the partial flashing code could be given everything including UICR without
    // passing a very large Uint8Array.
    const part = this.matchingPart(boardId);
    const hex = MemoryMap.fromHex(part);
    const keys = Array.from(hex.keys()).filter((k) => k < 0x10000000);
    const lastKey = keys[keys.length - 1];
    if (lastKey === undefined) {
      throw new HexGenerationError("Empty hex");
    }
    const lastPart = hex.get(lastKey);
    if (!lastPart) {
      throw new HexGenerationError("Empty hex");
    }
    const length = lastKey + lastPart.length;
    const data = hex.slicePad(0, length, 0);
    return Promise.resolve(data);
  }

  fullFlashData(boardId: BoardId): Promise<string> {
    const part = this.matchingPart(boardId);
    return Promise.resolve(part);
  }

  private matchingPart(boardId: BoardId): string {
    if (isUniversalHex(this.hex)) {
      const parts = separateUniversalHex(this.hex);
      const matching = parts.find((p) => p.boardId == boardId.normalize().id);
      if (!matching) {
        throw new HexGenerationError("No matching part");
      }
      return matching.hex;
    }
    return this.hex;
  }
}

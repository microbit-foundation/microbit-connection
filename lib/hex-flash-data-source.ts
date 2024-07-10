import { BoardId } from "./board-id";
import { FlashDataSource } from "./device";
import {
  isUniversalHex,
  separateUniversalHex,
} from "@microbit/microbit-universal-hex";
import MemoryMap from "nrf-intel-hex";

export class HexFlashDataSource implements FlashDataSource {
  constructor(private hex: string) {
    console.log("Universal");
    console.log(hex);
  }

  partialFlashData(boardId: BoardId): Promise<Uint8Array> {
    const part = this.matchingPart(boardId);
    const hex = MemoryMap.fromHex(part);
    const keys = Array.from(hex.keys());
    const lastKey = keys[keys.length - 1];
    if (lastKey === undefined) {
      throw new Error("Empty hex");
    }
    const lastPart = hex.get(lastKey);
    if (!lastPart) {
      throw new Error("Empty hex");
    }
    const length = lastKey + lastPart.length;
    const data = hex.slicePad(0, length, 0);
    console.log(data);
    return Promise.resolve(data);
  }

  fullFlashData(boardId: BoardId): Promise<string> {
    const part = this.matchingPart(boardId);
    console.log(part);
    return Promise.resolve(part);
  }

  private matchingPart(boardId: BoardId): string {
    if (isUniversalHex(this.hex)) {
      const parts = separateUniversalHex(this.hex);
      const matching = parts.find((p) => p.boardId == boardId.normalize().id);
      if (!matching) {
        throw new Error("No matching part");
      }
      return matching.hex;
    }
    return this.hex;
  }
}

import { BoardId } from "./board-id";
import { FlashDataSource } from "./device";
import {
  isUniversalHex,
  separateUniversalHex,
} from "@microbit/microbit-universal-hex";

class HexFlashDataSource implements FlashDataSource {
  constructor(private hex: string) {
    if (isUniversalHex(hex)) {
      const parts = separateUniversalHex(hex);
      // Ho hum, what do we do with this?
      parts[0].hex;
    }
  }

  partialFlashData(boardId: BoardId): Promise<Uint8Array> {
    throw new Error("Method not implemented.");
  }
  fullFlashData(boardId: BoardId): Promise<Uint8Array> {
    throw new Error("Method not implemented.");
  }
}

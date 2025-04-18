/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { BoardId } from "./board-id.js";

export class BoardSerialInfo {
  constructor(
    public id: BoardId,
    public familyId: string,
    public hic: string,
  ) {}
  static parse(device: USBDevice, log: (msg: string) => void) {
    const serial = device.serialNumber;
    if (!serial) {
      throw new Error("Could not detected ID from connected board.");
    }
    if (serial.length !== 48) {
      log(`USB serial number unexpected length: ${serial.length}`);
    }
    const id = serial.substring(0, 4);
    const familyId = serial.substring(4, 8);
    const hic = serial.slice(-8);
    return new BoardSerialInfo(BoardId.parse(id), familyId, hic);
  }

  eq(other: BoardSerialInfo) {
    return (
      other.id === this.id &&
      other.familyId === this.familyId &&
      other.hic === this.hic
    );
  }
}

/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */

import { BoardVersion } from "./device.js";

/**
 * Validates micro:bit board IDs.
 */
export class BoardId {
  private static v1Normalized = new BoardId(0x9900);
  private static v2Normalized = new BoardId(0x9903);

  constructor(public id: number) {
    if (!this.isV1() && !this.isV2()) {
      throw new Error(`Could not recognise the Board ID ${id.toString(16)}`);
    }
  }

  toBoardVersion(): BoardVersion {
    return this.isV1() ? "V1" : "V2";
  }

  isV1(): boolean {
    return this.id === 0x9900 || this.id === 0x9901;
  }

  isV2(): boolean {
    return (
      this.id === 0x9903 ||
      this.id === 0x9904 ||
      this.id === 0x9905 ||
      this.id === 0x9906
    );
  }

  /**
   * Return the board ID using the default ID for the board type.
   * Used to integrate with MicropythonFsHex.
   */
  normalize() {
    return this.isV1() ? BoardId.v1Normalized : BoardId.v2Normalized;
  }

  /**
   * toString matches the input to parse.
   *
   * @returns the ID as a string.
   */
  toString() {
    return this.id.toString(16);
  }

  /**
   * @param value The ID as a hex string with no 0x prefix (e.g. 9900).
   * @returns the valid board ID
   * @throws if the ID isn't known.
   */
  static parse(value: string): BoardId {
    return new BoardId(parseInt(value, 16));
  }

  static forVersion(boardVersion: BoardVersion): BoardId {
    switch (boardVersion) {
      case "V1":
        return this.v1Normalized;
      case "V2":
        return this.v2Normalized;
    }
  }
}

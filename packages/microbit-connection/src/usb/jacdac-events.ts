/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
export interface JacdacFrameData {
  frame: Uint8Array;
}

export interface JacdacConnectionEventMap {
  /**
   * Fired for each Jacdac frame received from the micro:bit.
   * micro:bit V2 only.
   *
   * Adding the first listener starts the Jacdac exchange pump; removing
   * the last listener stops it and rejects in-flight
   * {@link MicrobitUSBConnection.sendJacdacFrame} promises.
   */
  jacdacframe: JacdacFrameData;
}

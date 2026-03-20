/**
 * Well-known micro:bit message bus event source IDs and values.
 *
 * Only sources whose events are self-contained (meaningful without a
 * data payload) are included. Sources like Accelerometer, Compass, and
 * Thermometer fire "update available" signals that require a separate
 * BLE service to read the actual data, so they are omitted here.
 *
 * Source IDs differ between V1 (DAL) and V2 (CODAL). Event values are
 * identical across versions (V2 adds TwoG to gesture values).
 *
 * Pin events require explicit configuration in the micro:bit program.
 * In MakeCode: `pins.setEvents(DigitalPin.P0, PinEventType.Edge)` for
 * rise/fall events, or `PinEventType.Pulse` for pulse duration events.
 * Without this, the pin will not fire any events.
 *
 * @see https://lancaster-university.github.io/microbit-docs/
 */

/** Wildcard: matches any source or any value. */
export const Any = 0;

/**
 * Event source IDs for micro:bit V1 (DAL / nRF51).
 */
export const V1Source = {
  ButtonA: 1,
  ButtonB: 2,
  Pin0: 7,
  Pin1: 8,
  Pin2: 9,
  Pin3: 10,
  Pin4: 11,
  Pin5: 12,
  Pin6: 13,
  Pin7: 14,
  Pin8: 15,
  Pin9: 16,
  Pin10: 17,
  Pin11: 18,
  Pin12: 19,
  Pin13: 20,
  Pin14: 21,
  Pin15: 22,
  Pin16: 23,
  Pin19: 24,
  Pin20: 25,
  ButtonAB: 26,
  Gesture: 27,
} as const;

/**
 * Event source IDs for micro:bit V2 (CODAL / nRF52833).
 */
export const V2Source = {
  ButtonA: 1,
  ButtonB: 2,
  ButtonAB: 3,
  Gesture: 13,
  Pin0: 100,
  Pin1: 101,
  Pin2: 102,
  Pin3: 103,
  Pin4: 104,
  Pin5: 105,
  Pin6: 106,
  Pin7: 107,
  Pin8: 108,
  Pin9: 109,
  Pin10: 110,
  Pin11: 111,
  Pin12: 112,
  Pin13: 113,
  Pin14: 114,
  Pin15: 115,
  Pin16: 116,
  Pin19: 119,
  Pin20: 120,
  Logo: 121,
} as const;

// -- Event values (consistent across V1/V2) --

export const ButtonValue = {
  Down: 1,
  Up: 2,
  Click: 3,
  LongClick: 4,
  Hold: 5,
  DoubleClick: 6,
} as const;

export const GestureValue = {
  TiltUp: 1,
  TiltDown: 2,
  TiltLeft: 3,
  TiltRight: 4,
  FaceUp: 5,
  FaceDown: 6,
  Freefall: 7,
  ThreeG: 8,
  SixG: 9,
  EightG: 10,
  Shake: 11,
  /** V2 only. */
  TwoG: 12,
} as const;

export const PinValue = {
  Rise: 2,
  Fall: 3,
  PulseHigh: 4,
  PulseLow: 5,
} as const;

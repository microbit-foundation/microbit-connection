/**
 * Well-known micro:bit message bus event source IDs and values.
 *
 * Source IDs differ between V1 (DAL) and V2 (CODAL). Event values are
 * identical across versions (V2 adds TwoG to gesture values).
 *
 * @see https://lancaster-university.github.io/microbit-docs/
 */

/**
 * Event source IDs for micro:bit V1 (DAL).
 */
export const V1Source = {
  ButtonA: 1,
  ButtonB: 2,
  ButtonAB: 26,
  Gesture: 27,
} as const;

/**
 * Event source IDs for micro:bit V2 (CODAL).
 */
export const V2Source = {
  ButtonA: 1,
  ButtonB: 2,
  ButtonAB: 3,
  Gesture: 13,
  Logo: 121,
} as const;

export const EventSource = { v1: V1Source, v2: V2Source } as const;

export const GestureEvent = {
  TiltUp: 1,
  TiltDown: 2,
  TiltLeft: 3,
  TiltRight: 4,
  FaceUp: 5,
  FaceDown: 6,
  Freefall: 7,
  Acceleration3g: 8,
  Acceleration6g: 9,
  Acceleration8g: 10,
  Shake: 11,
  /** V2 only. */
  Acceleration2g: 12,
} as const;
export type GestureEvent = (typeof GestureEvent)[keyof typeof GestureEvent];

export const ButtonAction = {
  Down: 1,
  Up: 2,
  Click: 3,
  LongClick: 4,
  Hold: 5,
  DoubleClick: 6,
} as const;
export type ButtonAction = (typeof ButtonAction)[keyof typeof ButtonAction];

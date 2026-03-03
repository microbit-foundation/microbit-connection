export enum ButtonState {
  NotPressed = 0,
  ShortPress = 1,
  LongPress = 2,
}

export type ButtonEventType = "buttonachanged" | "buttonbchanged";

export interface ButtonData {
  button: "A" | "B";
  state: ButtonState;
}

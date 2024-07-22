export enum ButtonState {
  NotPressed = 0,
  ShortPress = 1,
  LongPress = 2,
}

export type ButtonEventType = "buttonachanged" | "buttonbchanged";

export class ButtonEvent extends Event {
  constructor(
    public readonly type: ButtonEventType,
    public readonly state: ButtonState,
  ) {
    super(type);
  }
}

export interface SerialData {
  data: string;
}

export interface SerialErrorData {
  error: unknown;
}

export interface SerialConnectionEventMap {
  /** Fired when serial data is received from the micro:bit. */
  serialdata: SerialData;
  /**
   * Fired when the serial session ends, indicating that subsequent serial
   * output may be from a different program (e.g. after flashing or a full
   * disconnect). Consumers typically use this to clear the terminal.
   *
   * Not fired when the connection is paused (tab hidden) because the same
   * program continues running and serial resumes when the tab becomes visible.
   */
  serialreset: void;
  /** Fired when a serial read error occurs. */
  serialerror: SerialErrorData;
}

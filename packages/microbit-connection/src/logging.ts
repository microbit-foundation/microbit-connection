/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
export interface LoggingEvent {
  type: string;
  message?: string;
  value?: number;
  // Deliberately any rather than unknown: consumers read this in their logging
  // backends and narrowing adds ceremony without safety for log payloads.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail?: any;
}

export interface Logging {
  event(event: LoggingEvent): void;
  error(message: string, e: unknown): void;
  log(e: unknown): void;
}

export class ConsoleLogging implements Logging {
  event(_event: LoggingEvent): void {
    console.log(_event);
  }
  error(_m: string, _e: unknown): void {
    console.error(_m, _e);
  }
  log(_e: unknown): void {
    console.log(_e);
  }
}

/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
export interface LoggingEvent {
  type: string;
  message?: string;
  value?: number;
  detail?: any;
}

export interface Logging {
  event(event: LoggingEvent): void;
  error(message: string, e: unknown): void;
  log(e: any): void;
}

export class NullLogging implements Logging {
  event(_event: LoggingEvent): void {
    console.log(_event);
  }
  error(_m: string, _e: unknown): void {
    console.error(_m, _e);
  }
  log(_e: any): void {
    console.log(_e);
  }
}

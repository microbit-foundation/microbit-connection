/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
export interface Event {
  type: string;
  message?: string;
  value?: number;
  detail?: any;
}

export interface Logging {
  event(event: Event): void;
  error(e: any): void;
  log(e: any): void;
}

export class NullLogging implements Logging {
  event(_event: Event): void {
  }
  error(_e: any): void {
  }
  log(_e: any): void {
  }
}

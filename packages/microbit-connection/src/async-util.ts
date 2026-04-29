/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { DeviceError } from "./device.js";

export class TimeoutError extends DeviceError {
  constructor(message: string = "Timeout") {
    super({ code: "timeout", message });
  }
}

export class DisconnectError extends Error {
  constructor(message: string = "Disconnect") {
    super(message);
  }
}

/**
 * Utility to time out an action after a delay.
 *
 * The action cannot be cancelled; it may still proceed after the timeout.
 */
export async function withTimeout<T>(
  actionPromise: Promise<T>,
  timeout: number,
): Promise<T> {
  return Promise.race([
    actionPromise,
    timeoutErrorAfter(timeout),
  ]) as Promise<T>;
}

export async function delay(millis: number) {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

export async function timeoutErrorAfter<T>(
  millis: number,
  message: string = "Timeout",
): Promise<T> {
  await delay(millis);
  throw new TimeoutError(message);
}

export function disconnectErrorCallback<T>(message: string = "Disconnect") {
  let callback: () => void | undefined;
  const promise = new Promise<T>((_, reject) => {
    callback = () => reject(new DisconnectError(message));
  });
  return { promise, callback: callback! };
}

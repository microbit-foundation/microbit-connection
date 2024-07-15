import { GattOperationCallback } from "./bluetooth-device-wrapper";

export const createGattOperationPromise = (): {
  callback: GattOperationCallback;
  gattOperationPromise: Promise<DataView | void>;
} => {
  let resolve: (result: DataView | void) => void;
  let reject: () => void;
  const gattOperationPromise = new Promise<DataView | void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const callback = {
    resolve: resolve!,
    reject: reject!,
  };
  return { callback, gattOperationPromise };
};

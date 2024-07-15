import { GattOperation } from "./bluetooth-device-wrapper";

export const createGattOperationPromise = (
  fn: () => Promise<DataView>,
): {
  gattOperation: GattOperation;
  gattOperationPromise: Promise<DataView>;
} => {
  let resolve: (value: DataView) => void;
  const gattOperationPromise = new Promise<DataView>((res) => {
    resolve = res;
  });
  const gattOperation: GattOperation = async () => resolve(await fn());
  return { gattOperation, gattOperationPromise };
};

import {
  BleClient,
  numbersToDataView,
} from "@capacitor-community/bluetooth-le";
import { profile } from "../profile.js";

// This is the service that should be available on V1 after the reboot.
// We don't use it directly (the Nordic DFU library does) but we check it's there.
export const NORDIC_DFU_SERVICE = "00001530-1212-EFDE-1523-785FEABCD123";

export class DfuService {
  constructor(private deviceId: string) {}

  /**
   * We do this for V1 only.
   */
  async requestRebootToBootloader() {
    await BleClient.write(
      this.deviceId,
      profile.dfuControl.id,
      profile.dfuControl.characteristics.control.id,
      numbersToDataView([0x01]),
    );
  }
}

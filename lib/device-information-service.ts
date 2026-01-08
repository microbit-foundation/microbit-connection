import { BleClient } from "@capacitor-community/bluetooth-le";
import { BoardVersion } from "./device.js";
import { profile } from "./bluetooth-profile.js";

export class DeviceInformationService {
  constructor(private deviceId: string) {}

  async getBoardVersion(): Promise<BoardVersion> {
    const serviceMeta = profile.deviceInformation;
    try {
      const modelNumberBytes = await BleClient.read(
        this.deviceId,
        serviceMeta.id,
        serviceMeta.characteristics.modelNumber.id,
      );
      const modelNumber = new TextDecoder().decode(modelNumberBytes);
      if (modelNumber.toLowerCase() === "BBC micro:bit".toLowerCase()) {
        return "V1";
      }
      if (
        modelNumber.toLowerCase().includes("BBC micro:bit v2".toLowerCase())
      ) {
        return "V2";
      }
      throw new Error(`Unexpected model number ${modelNumber}`);
    } catch (e) {
      throw new Error(
        `Could not read model number: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}

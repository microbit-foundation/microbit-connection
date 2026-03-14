import { Preferences } from "@capacitor/preferences";

const DEVICE_NAME_KEY = "microbit_device_name";

export const deviceStorage = {
  async saveDeviceName(deviceName: string): Promise<void> {
    await Preferences.set({
      key: DEVICE_NAME_KEY,
      value: deviceName,
    });
  },

  async getDeviceName(): Promise<string | null> {
    const { value } = await Preferences.get({ key: DEVICE_NAME_KEY });
    return value;
  },

  async clearDeviceName(): Promise<void> {
    await Preferences.remove({ key: DEVICE_NAME_KEY });
  },
};

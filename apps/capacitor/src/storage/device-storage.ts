import { Preferences } from "@capacitor/preferences";

const DEVICE_NAME_KEY = "microbit_device_name";

export const deviceStorage = {
  /**
   * Save the micro:bit device name pattern (5-character code)
   */
  async saveDeviceName(deviceName: string): Promise<void> {
    await Preferences.set({
      key: DEVICE_NAME_KEY,
      value: deviceName,
    });
  },

  /**
   * Get the previously saved micro:bit device name pattern
   * @returns The saved device name or null if none exists
   */
  async getDeviceName(): Promise<string | null> {
    const { value } = await Preferences.get({ key: DEVICE_NAME_KEY });
    return value;
  },

  /**
   * Clear the saved device name
   */
  async clearDeviceName(): Promise<void> {
    await Preferences.remove({ key: DEVICE_NAME_KEY });
  },
};

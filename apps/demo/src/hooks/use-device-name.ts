import { useEffect, useState } from "react";
import { deviceStorage } from "../storage/device-storage.ts";

export function useDeviceName() {
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadDeviceName = async () => {
      try {
        const saved = await deviceStorage.getDeviceName();
        if (mounted) {
          setDeviceName(saved);
          setIsLoading(false);
        }
      } catch {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadDeviceName();

    return () => {
      mounted = false;
    };
  }, []);

  const saveDeviceName = async (name: string) => {
    await deviceStorage.saveDeviceName(name);
    setDeviceName(name);
  };

  const clearDeviceName = async () => {
    await deviceStorage.clearDeviceName();
    setDeviceName(null);
  };

  return {
    deviceName,
    isLoading,
    saveDeviceName,
    clearDeviceName,
  };
}

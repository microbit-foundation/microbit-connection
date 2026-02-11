import { useEffect, useState } from "react";
import { deviceStorage } from "../storage/device-storage";

/**
 * Hook to load and manage the saved device name
 * Provides a synchronous interface to async storage
 */
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
      } catch (error) {
        console.error("Failed to load device name:", error);
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

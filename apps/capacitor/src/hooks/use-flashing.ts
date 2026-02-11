import { useCallback, useState } from "react";
import { flash } from "../flashing";
import { ProgressCallback, ProgressStage } from "@microbit/microbit-connection";
import { useDeviceName } from "./use-device-name";

export type Step =
  | {
      name: "initial" | "pair-mode" | "enter-pattern" | "success";
    }
  | {
      name: "flashing";
      message: string;
      progress?: number;
    }
  | {
      name: "flash-error";
      children: string;
    };

export const useFlashing = () => {
  const { deviceName, saveDeviceName: setDeviceName } = useDeviceName();
  const [open, setOpen] = useState<boolean>(false);
  const [step, setStep] = useState<Step>({ name: "initial" });
  const [hex, setHex] = useState<null | { name: string; hex: string }>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    setStep({ name: "initial" });
  }, []);

  const updateStep: ProgressCallback = useCallback(
    (progressStage: ProgressStage, progress?: number) => {
      const messages: Record<ProgressStage, string> = {
        [ProgressStage.Initializing]: "Checking permissions",
        [ProgressStage.FindingDevice]: "Finding device",
        [ProgressStage.CheckingBond]: "Checking bond",
        [ProgressStage.ResettingDevice]: "Resetting device",
        [ProgressStage.Connecting]: "Connecting",
        [ProgressStage.PartialFlashing]: "Sending code",
        [ProgressStage.FullFlashing]:
          "Sending code. This can take a while the first time but it will be quicker after that.",
      };
      setStep({ name: "flashing", progress, message: messages[progressStage] });
    },
    [],
  );

  const handleFlash = useCallback(async () => {
    if (!hex) {
      throw new Error("No hex file to flash!");
    }
    if (!deviceName) {
      throw new Error("Device name not set!");
    }

    try {
      await flash(deviceName, hex.hex, updateStep);
      setStep({ name: "success" });
    } catch (error) {
      setStep({ name: "flash-error", children: (error as Error).message });
    }
  }, [deviceName, hex, updateStep]);

  const startFlashing = useCallback(
    (download: { name: string; hex: string }) => {
      setOpen(true);
      setHex(download);
    },
    [],
  );

  return {
    step,
    setStep,
    startFlashing,
    handleClose,
    handleFlash,
    open,
    deviceName,
    setDeviceName,
  };
};

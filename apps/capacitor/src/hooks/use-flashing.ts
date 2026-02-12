import { useCallback, useRef, useState } from "react";
import { flash } from "../flashing";
import { ProgressCallback, ProgressStage } from "@microbit/microbit-connection";
import { useDeviceName } from "./use-device-name";
import { useConnection } from "./use-connection";

export interface StageTiming {
  stage: string;
  startMs: number;
  durationMs: number;
}

export type Step =
  | {
      name: "initial" | "pair-mode" | "enter-pattern";
    }
  | {
      name: "success";
      timings: StageTiming[];
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

const stageLabels: Record<ProgressStage, string> = {
  [ProgressStage.Initializing]: "Checking permissions",
  [ProgressStage.FindingDevice]: "Finding device",
  [ProgressStage.CheckingBond]: "Checking bond",
  [ProgressStage.ResettingDevice]: "Resetting device",
  [ProgressStage.Connecting]: "Connecting",
  [ProgressStage.PartialFlashing]: "Partial flashing",
  [ProgressStage.FullFlashing]: "Full flashing",
};

export const useFlashing = () => {
  const { deviceName, saveDeviceName: setDeviceName } = useDeviceName();
  const [open, setOpen] = useState<boolean>(false);
  const [step, setStep] = useState<Step>({ name: "initial" });
  const [hex, setHex] = useState<null | { name: string; hex: string }>(null);
  const timingsRef = useRef<{ stage: string; timestamp: number }[]>([]);
  const { connection } = useConnection();

  const handleClose = useCallback(() => {
    setOpen(false);
    setStep({ name: "initial" });
  }, []);

  const updateStep: ProgressCallback = useCallback(
    (progressStage: ProgressStage, progress?: number) => {
      const now = performance.now();
      const timings = timingsRef.current;
      if (
        timings.length === 0 ||
        timings[timings.length - 1].stage !== progressStage
      ) {
        timings.push({ stage: progressStage, timestamp: now });
      }

      const messages: Record<ProgressStage, string> = {
        ...stageLabels,
        [ProgressStage.PartialFlashing]: "Sending code",
        [ProgressStage.FullFlashing]:
          "Sending code. This can take a while the first time but it will be quicker after that.",
      };
      setStep({ name: "flashing", progress, message: messages[progressStage] });
    },
    [],
  );

  const buildTimings = useCallback((): StageTiming[] => {
    const entries = timingsRef.current;
    if (entries.length === 0) return [];
    const now = performance.now();
    const start = entries[0].timestamp;
    return entries.map((entry, i) => {
      const next = entries[i + 1]?.timestamp ?? now;
      return {
        stage: stageLabels[entry.stage as ProgressStage] ?? entry.stage,
        startMs: Math.round(entry.timestamp - start),
        durationMs: Math.round(next - entry.timestamp),
      };
    });
  }, []);

  const handleFlash = useCallback(async () => {
    if (!hex) {
      throw new Error("No hex file to flash!");
    }
    if (!deviceName) {
      throw new Error("Device name not set!");
    }

    timingsRef.current = [];
    try {
      await flash(connection, deviceName, hex.hex, updateStep);
      setStep({ name: "success", timings: buildTimings() });
    } catch (error) {
      setStep({ name: "flash-error", children: (error as Error).message });
    }
  }, [hex, deviceName, connection, updateStep, buildTimings]);

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

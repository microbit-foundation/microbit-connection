import { useCallback } from "react";
import { MakeCodeFrame, MakeCodeProject } from "@microbit/makecode-embed";
import { useFlashing } from "../hooks/use-flashing.ts";
import FlashOverlay from "./FlashOverlay.tsx";

const starterProject = {
  text: {
    "main.blocks":
      '<xml xmlns="https://developers.google.com/blockly/xml"><variables></variables><block type="pxt-on-start" x="20" y="20"><statement name="HANDLER"><block type="basic_show_icon"><field name="i">IconNames.Heart</field></block></statement></block></xml>',
    "main.ts": "basic.showIcon(IconNames.Heart)\n",
    "README.md": " ",
    "pxt.json": JSON.stringify({
      name: "Untitled",
      dependencies: {
        core: "*",
        radio: "*",
      },
      description: "",
      files: ["main.blocks", "main.ts", "README.md"],
      preferredEditor: "blocksprj",
    }),
  },
} as MakeCodeProject;

interface MakeCodeOverlayProps {
  onClose: () => void;
}

const MakeCodeOverlay = ({ onClose }: MakeCodeOverlayProps) => {
  const {
    step,
    setStep,
    startFlashing,
    open,
    handleClose,
    handleFlash,
    deviceName,
    setDeviceName,
  } = useFlashing();

  const initialProject = useCallback(async () => [starterProject], []);

  const handleDownload = useCallback(
    async (download: { name: string; hex: string }) => {
      startFlashing(download);
    },
    [startFlashing],
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 300,
        background: "#fff",
      }}
    >
      <MakeCodeFrame
        style={{ height: "100%", width: "100%" }}
        controller={2}
        loading="eager"
        initialProjects={initialProject}
        onDownload={handleDownload}
        onBack={onClose}
      />
      {open && (
        <FlashOverlay
          step={step}
          setStep={setStep}
          handleClose={handleClose}
          handleFlash={handleFlash}
          deviceName={deviceName}
          setDeviceName={setDeviceName}
        />
      )}
    </div>
  );
};

export default MakeCodeOverlay;

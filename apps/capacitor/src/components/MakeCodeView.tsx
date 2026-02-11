import { Capacitor } from "@capacitor/core";
import { MakeCodeFrame, MakeCodeProject } from "@microbit/makecode-embed";
import { useCallback } from "react";
import "../App.css";
import { useNavigate } from "react-router-dom";
import { useFlashing } from "../hooks/use-flashing";
import Content from "../components/Content";

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

const MakeCodeView = () => {
  const platform = Capacitor.getPlatform();
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
  const navigate = useNavigate();

  const initialProject = useCallback(async () => [starterProject], []);

  const handleDownload = useCallback(
    async (download: { name: string; hex: string }) => {
      startFlashing(download);
    },
    [startFlashing],
  );

  const handleBack = useCallback(() => {
    navigate("/");
  }, [navigate]);

  if (platform === "web") {
    return (
      <div style={{ textAlign: "left", padding: "2rem" }}>
        <h1 style={{ fontSize: 20 }}>Cannot preview app on the web</h1>
        <div>
          <p>
            You are currently viewing this app on the web. Please preview the
            app on mobile instead.
          </p>
          <p>
            We have only implemented bluetooth flashing of the micro:bit via a
            mobile device.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      <MakeCodeFrame
        style={{ height: "100%", width: "100%" }}
        controller={2}
        loading="eager"
        initialProjects={initialProject}
        onDownload={handleDownload}
        onBack={handleBack}
      />
      {open && (
        <Content
          step={step}
          setStep={setStep}
          handleClose={handleClose}
          handleFlash={handleFlash}
          deviceName={deviceName}
          setDeviceName={setDeviceName}
          platform={platform}
        />
      )}
    </div>
  );
};

export default MakeCodeView;

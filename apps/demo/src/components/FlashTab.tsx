import { useState, useRef } from "react";
import { useFlashing } from "../hooks/use-flashing.ts";
import FlashOverlay from "./FlashOverlay.tsx";
import MakeCodeOverlay from "./MakeCodeOverlay.tsx";

interface CannedHexFile {
  name: string;
  path: string;
  label: string;
}

const cannedHexFiles: CannedHexFile[] = [
  { name: "bluetooth-v1-no-magnetometer.hex", path: "/hex-files/bluetooth-v1-no-magnetometer.hex", label: "Bluetooth V1 (No Magnetometer)" },
  { name: "bluetooth-v2.hex", path: "/hex-files/bluetooth-v2.hex", label: "Bluetooth V2" },
  { name: "data-collection-program.hex", path: "/hex-files/data-collection-program.hex", label: "Data Collection Program" },
  { name: "serial-counter-makecode.hex", path: "/hex-files/serial-counter-makecode.hex", label: "Serial Counter (MakeCode)" },
  { name: "serial-counter-python.hex", path: "/hex-files/serial-counter-python.hex", label: "Serial Counter (Python)" },
  { name: "microbit-data-collection-just-works-universal.hex", path: "/hex-files/microbit-data-collection-just-works-universal.hex", label: "Data Collection (new, just works)" },
  { name: "microbit-data-collection-no-pairing-universal.hex", path: "/hex-files/microbit-data-collection-no-pairing-universal.hex", label: "Data Collection (new, no pairing)" },
  { name: "createai-project.hex", path: "/hex-files/createai-project.hex", label: "CreateAI project" },
  { name: "meet-the-microbit.hex", path: "/hex-files/meet-the-microbit.hex", label: "Meet the micro:bit" },
  { name: "microbit-beating-heart.hex", path: "/hex-files/microbit-beating-heart.hex", label: "Beating Heart" },
  { name: "microbit-micropython-v1.hex", path: "/hex-files/microbit-micropython-v1.hex", label: "MicroPython V1" },
  { name: "microbit-micropython-v2.hex", path: "/hex-files/microbit-micropython-v2.hex", label: "MicroPython V2" },
  { name: "microbit-v1-battery-level.hex", path: "/hex-files/microbit-v1-battery-level.hex", label: "V1 Battery Level" },
  { name: "microbit-v2-battery-voltage-v1.0.0.hex", path: "/hex-files/microbit-v2-battery-voltage-v1.0.0.hex", label: "V2 Battery Voltage" },
  { name: "python-editor-default.hex", path: "/hex-files/python-editor-default.hex", label: "Python Editor Default" },
];

const FlashTab = () => {
  const [showMakeCode, setShowMakeCode] = useState(false);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedHex, setSelectedHex] = useState<{
    name: string;
    hex?: string;
    path?: string;
  } | null>(null);

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const hex = e.target?.result as string;
        setSelectedHex({ name: file.name, hex });
      };
      reader.readAsText(file);
    }
  };

  const handleHexSelectionChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const selectedValue = event.target.value;
    if (selectedValue === "browse") {
      setSelectedHex(null);
      fileInputRef.current?.click();
    } else {
      const hexFile = cannedHexFiles.find((f) => f.path === selectedValue);
      if (hexFile) {
        setSelectedHex(hexFile);
      }
    }
  };

  const handleFlashButtonClick = async () => {
    if (!selectedHex) {
      fileInputRef.current?.click();
      return;
    }

    if (selectedHex.hex) {
      startFlashing({ name: selectedHex.name, hex: selectedHex.hex });
    } else if (selectedHex.path) {
      const response = await fetch(selectedHex.path);
      if (!response.ok) {
        return;
      }
      const hex = await response.text();
      startFlashing({ name: selectedHex.name, hex });
    }
  };

  return (
    <div className="tab-page">
      <div className="section">
        <h2>Flash</h2>
        <div className="control-row">
          <select
            onChange={handleHexSelectionChange}
            value={selectedHex?.path ?? "browse"}
            className="select"
          >
            <option value="browse">Browse for file...</option>
            {cannedHexFiles.map((file) => (
              <option key={file.path} value={file.path}>
                {file.label}
              </option>
            ))}
          </select>
          <button onClick={handleFlashButtonClick} className="btn btn-primary">
            Flash
          </button>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          accept=".hex"
          onChange={handleFileSelected}
        />
      </div>

      <div className="section">
        <h2>MakeCode</h2>
        <button onClick={() => setShowMakeCode(true)} className="btn">
          Open MakeCode
        </button>
        <p style={{ fontSize: 13, color: "#737373", margin: "8px 0 0" }}>
          Create a program in MakeCode and flash it directly.
        </p>
      </div>

      {showMakeCode && (
        <MakeCodeOverlay onClose={() => setShowMakeCode(false)} />
      )}
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

export default FlashTab;

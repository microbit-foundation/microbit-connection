import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useFlashing } from "../hooks/use-flashing";
import Content from "./Content";
import { Capacitor } from "@capacitor/core";

interface CannedHexFile {
  name: string;
  path: string;
  label: string;
}

const cannedHexFiles: CannedHexFile[] = [
  {
    name: "bluetooth-v1-no-magnetometer.hex",
    path: "/hex-files/bluetooth-v1-no-magnetometer.hex",
    label: "Bluetooth V1 (No Magnetometer)",
  },
  {
    name: "bluetooth-v2.hex",
    path: "/hex-files/bluetooth-v2.hex",
    label: "Bluetooth V2",
  },
  {
    name: "data-collection-program.hex",
    path: "/hex-files/data-collection-program.hex",
    label: "Data Collection Program",
  },
  {
    name: "microbit-data-collection-just-works-universal.hex",
    path: "/hex-files/microbit-data-collection-just-works-universal.hex",
    label: "Data Collection (new, just works)",
  },
  {
    name: "microbit-data-collection-no-pairing-universal.hex",
    path: "/hex-files/microbit-data-collection-no-pairing-universal.hex",
    label: "Data Collection (new, no pairing)",
  },
  {
    name: "meet-the-microbit.hex",
    path: "/hex-files/meet-the-microbit.hex",
    label: "Meet the micro:bit",
  },
  {
    name: "microbit-beating-heart.hex",
    path: "/hex-files/microbit-beating-heart.hex",
    label: "Beating Heart",
  },
  {
    name: "microbit-micropython-v1.hex",
    path: "/hex-files/microbit-micropython-v1.hex",
    label: "MicroPython V1",
  },
  {
    name: "microbit-micropython-v2.hex",
    path: "/hex-files/microbit-micropython-v2.hex",
    label: "MicroPython V2",
  },
  {
    name: "microbit-v1-battery-level.hex",
    path: "/hex-files/microbit-v1-battery-level.hex",
    label: "V1 Battery Level",
  },
  {
    name: "microbit-v2-battery-voltage-v1.0.0.hex",
    path: "/hex-files/microbit-v2-battery-voltage-v1.0.0.hex",
    label: "V2 Battery Voltage",
  },
  {
    name: "python-editor-default.hex",
    path: "/hex-files/python-editor-default.hex",
    label: "Python Editor Default",
  },
];

const browseForFileSelectOption = "browse";

interface HexData {
  /**
   * UI name.
   */
  name: string;
  /**
   * The content if generated from an embedded app.
   */
  hex?: string;
  /**
   * The path to load.
   */
  path?: string;
}

const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
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
  const platform = Capacitor.getPlatform();
  const [selectedHex, setSelectedHex] = useState<HexData | null>(null);

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
    if (selectedValue === browseForFileSelectOption) {
      setSelectedHex(null); // Reset selection
      fileInputRef.current?.click();
    } else {
      const hexFile = cannedHexFiles.find(
        (file) => file.path === selectedValue,
      );
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
      // It's a file from MakeCode with hex content
      startFlashing({ name: selectedHex.name, hex: selectedHex.hex });
    } else if (selectedHex.path) {
      // It's a canned file, fetch it first
      try {
        const response = await fetch(selectedHex.path);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch ${selectedHex.name}: ${response.statusText}`,
          );
        }
        const hex = await response.text();
        startFlashing({ name: selectedHex.name, hex });
      } catch (error) {
        console.error("Error flashing canned hex file:", error);
        alert(
          `Failed to flash ${selectedHex.name}. Check console for details.`,
        );
      }
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        height: "100%",
        width: "100%",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
          padding: "20px",
          maxWidth: "600px",
          alignItems: "start",
        }}
      >
        <h1>micro:bit test app</h1>
        <h2 style={{ marginTop: "30px", marginBottom: "10px" }}>Open apps</h2>
        <button
          onClick={() => navigate("/makecode")}
          style={{
            backgroundColor: "black",
            color: "white",
            padding: "10px 20px",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: "16px",
            width: "300px",
          }}
        >
          MakeCode
        </button>
        <h2 style={{ marginTop: "30px", marginBottom: "10px" }}>Flash a hex</h2>
        <div style={{ display: "flex", gap: "10px" }}>
          <select
            onChange={handleHexSelectionChange}
            value={selectedHex?.path || browseForFileSelectOption}
            style={{
              padding: "10px 20px",
              border: "1px solid #ccc",
              borderRadius: "5px",
              fontSize: "16px",
              backgroundColor: "white",
              cursor: "pointer",
              color: "black",
              textAlignLast: "center",
            }}
          >
            <option value={browseForFileSelectOption}>Browse for file</option>
            {cannedHexFiles.map((file) => (
              <option key={file.path} value={file.path}>
                {file.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleFlashButtonClick}
            style={{
              backgroundColor: "black",
              color: "white",
              padding: "10px 20px",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              fontSize: "16px",
            }}
          >
            Flash .hex file
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

export default HomeScreen;

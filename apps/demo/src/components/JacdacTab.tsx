import { useEffect, useRef, useState } from "react";
import type { JacdacFrameData } from "@microbit/microbit-connection/usb";
import { useConnection } from "../hooks/use-connection.ts";
import { useLog } from "../hooks/use-log.ts";

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" ");

// CRC-16-CCITT (poly 0x1021, init 0xffff) over the frame after the CRC
// field, per https://microsoft.github.io/jacdac-docs/reference/protocol/
const crc16 = (data: Uint8Array): number => {
  let crc = 0xffff;
  for (const byte of data) {
    let x = (crc >> 8) ^ byte;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xffff;
  }
  return crc;
};

/**
 * Single-packet Jacdac command frame with an empty payload:
 * u16 crc, u8 size, u8 flags, u64 device_id,
 * u8 service_size, u8 service_index, u16 service_command.
 */
const createCommandFrame = (
  deviceId: Uint8Array,
  serviceIndex: number,
  serviceCommand: number,
): Uint8Array => {
  const frame = new Uint8Array(16);
  frame[2] = 4; // size of the packets section
  frame[3] = 0x01; // JD_FRAME_FLAG_COMMAND
  frame.set(deviceId, 4);
  frame[12] = 0; // payload size
  frame[13] = serviceIndex;
  frame[14] = serviceCommand & 0xff;
  frame[15] = serviceCommand >> 8;
  const crc = crc16(frame.subarray(2));
  frame[0] = crc & 0xff;
  frame[1] = crc >> 8;
  return frame;
};

// Control service identify: blinks the status LED four times.
// https://microsoft.github.io/jacdac-docs/services/control/#cmd:identify
const CONTROL_SERVICE_INDEX = 0;
const CONTROL_CMD_IDENTIFY = 0x81;

/**
 * A control service announce: a report (no COMMAND flag) whose first
 * packet is service 0, command 0x0000. Devices broadcast these ~every
 * 500ms; we take the sender's id as the identify target.
 */
const isAnnounce = (frame: Uint8Array) =>
  frame.length >= 16 &&
  (frame[3] & 0x01) === 0 &&
  frame[13] === 0 &&
  frame[14] === 0 &&
  frame[15] === 0;

interface FrameRow {
  time: string;
  hex: string;
  deviceId: string;
}

const JacdacTab = () => {
  const { connection } = useConnection();
  const { log } = useLog();

  const [listening, setListening] = useState(false);
  const [frames, setFrames] = useState<FrameRow[]>([]);
  const [frameCount, setFrameCount] = useState(0);
  const [sendResult, setSendResult] = useState<string | undefined>();
  const [deviceIdHex, setDeviceIdHex] = useState<string | undefined>();
  const deviceIdRef = useRef<Uint8Array | undefined>(undefined);

  useEffect(() => {
    if (connection.type !== "usb" || !listening) return;

    const frameListener = (data: JacdacFrameData) => {
      if (isAnnounce(data.frame)) {
        deviceIdRef.current = data.frame.slice(4, 12);
        setDeviceIdHex(toHex(deviceIdRef.current).replace(/ /g, ""));
      }
      setFrameCount((n) => n + 1);
      setFrames((prev) => {
        const next = [
          ...prev,
          {
            time: new Date().toLocaleTimeString(),
            hex: toHex(data.frame),
            deviceId: toHex(data.frame.subarray(4, 12)).replace(/ /g, ""),
          },
        ];
        return next.length > 50 ? next.slice(-50) : next;
      });
    };

    connection.addEventListener("jacdacframe", frameListener);
    return () => {
      connection.removeEventListener("jacdacframe", frameListener);
    };
  }, [connection, listening]);

  const identify = async () => {
    const deviceId = deviceIdRef.current;
    if (connection.type !== "usb" || !deviceId) return;
    setSendResult("Sending identify...");
    try {
      const frame = createCommandFrame(
        deviceId,
        CONTROL_SERVICE_INDEX,
        CONTROL_CMD_IDENTIFY,
      );
      await connection.sendJacdacFrame(frame);
      setSendResult(
        "Identify sent - the micro:bit's status LED should blink four times",
      );
      log("jacdac", "Sent identify command");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setSendResult(`Send failed: ${message}`);
      log("jacdac", `Send failed: ${message}`, "error");
    }
  };

  return (
    <div className="tab-page">
      <div className="section">
        <h2>Jacdac</h2>
        <p>
          Requires a micro:bit V2 running a program built with Jacdac support
          &mdash; use &ldquo;Jacdac (MakeCode, V2 only)&rdquo; on the Flash tab.
          Announce frames should appear roughly every 500ms.
        </p>
        <div className="control-row" style={{ marginBottom: 8 }}>
          <button
            onClick={() => setListening(!listening)}
            className={`btn${listening ? " btn-toggle active" : ""}`}
          >
            {listening ? "Stop" : "Listen"}
          </button>
          <button
            onClick={() => {
              setFrames([]);
              setFrameCount(0);
            }}
            className="btn"
          >
            Clear
          </button>
          <button
            onClick={identify}
            className="btn"
            disabled={!listening || !deviceIdHex}
            title="Send a control service identify command; the micro:bit blinks its status LED"
          >
            Identify{deviceIdHex ? ` ${deviceIdHex}` : ""}
          </button>
        </div>
        {sendResult && <p>{sendResult}</p>}
        <p>Frames received: {frameCount}</p>
        {frames.length > 0 ? (
          <div className="data-box">
            {frames.map((frame, i) => (
              <div key={i}>
                {frame.time} device={frame.deviceId} {frame.hex}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">
            {listening
              ? "Waiting for Jacdac frames..."
              : "Press Listen to start the Jacdac exchange pump."}
          </p>
        )}
      </div>
    </div>
  );
};

export default JacdacTab;

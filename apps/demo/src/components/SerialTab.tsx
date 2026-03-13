import { useEffect, useState, useRef } from "react";
import type { SerialData } from "@microbit/microbit-connection/usb";
import { useConnection } from "../hooks/use-connection.ts";
import { useLog } from "../hooks/use-log.ts";

const SerialTab = () => {
  const { typed } = useConnection();
  const { log } = useLog();
  const isUsb = typed.type === "usb";

  const [serialLines, setSerialLines] = useState<string[]>([]);
  const [serialListening, setSerialListening] = useState(false);
  const serialBufferRef = useRef("");
  const serialEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isUsb || !serialListening) return;

    const resetListener = () => {
      serialBufferRef.current = "";
      log("serial", "Serial reset");
    };
    const dataListener = (event: SerialData) => {
      for (const char of event.data) {
        if (char === "\n") {
          const line = serialBufferRef.current;
          serialBufferRef.current = "";
          setSerialLines((prev) => {
            const next = [...prev, line];
            return next.length > 200 ? next.slice(-200) : next;
          });
          log("serial", line, "data");
        } else if (char !== "\r") {
          serialBufferRef.current += char;
        }
      }
    };

    if (typed.type !== "usb") return;
    typed.connection.addEventListener("serialreset", resetListener);
    typed.connection.addEventListener("serialdata", dataListener);
    return () => {
      typed.connection.removeEventListener("serialreset", resetListener);
      typed.connection.removeEventListener("serialdata", dataListener);
    };
  }, [typed, isUsb, serialListening, log]);

  useEffect(() => {
    serialEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [serialLines.length]);

  return (
    <div className="tab-page">
      <div className="section">
        <h2>Serial</h2>
        <div className="control-row" style={{ marginBottom: 8 }}>
          <button
            onClick={() => setSerialListening(!serialListening)}
            className={`btn${serialListening ? " btn-toggle active" : ""}`}
          >
            {serialListening ? "Stop" : "Listen"}
          </button>
          <button onClick={() => setSerialLines([])} className="btn">
            Clear
          </button>
        </div>
        {serialLines.length > 0 ? (
          <div className="data-box">
            {serialLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            <div ref={serialEndRef} />
          </div>
        ) : (
          <p className="empty-state">
            {serialListening ? "Waiting for serial data..." : "Press Listen to start receiving serial data."}
          </p>
        )}
      </div>
    </div>
  );
};

export default SerialTab;

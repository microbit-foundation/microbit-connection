import { useEffect, useState, useCallback, useRef } from "react";
import type { UartData } from "@microbit/microbit-connection";
import { useConnection } from "../hooks/use-connection.ts";
import { useLog } from "../hooks/use-log.ts";
import { useErrorDialog } from "../hooks/use-error-dialog.ts";

const UartTab = () => {
  const { typed } = useConnection();
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const isBluetooth = typed.type === "bluetooth";

  const [uartLines, setUartLines] = useState<string[]>([]);
  const [uartListening, setUartListening] = useState(false);
  const [uartWriteText, setUartWriteText] = useState("");
  const uartEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isBluetooth || !uartListening) return;

    const listener = (event: UartData) => {
      const value = new TextDecoder().decode(event.value);
      setUartLines((prev) => {
        const next = [...prev, value];
        return next.length > 200 ? next.slice(-200) : next;
      });
      log("uart", value, "data");
    };
    if (typed.type !== "bluetooth") return;
    typed.connection.addEventListener("uartdata", listener);
    return () => {
      typed.connection.removeEventListener("uartdata", listener);
    };
  }, [typed, isBluetooth, uartListening, log]);

  useEffect(() => {
    uartEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [uartLines.length]);

  const handleUartWrite = useCallback(async () => {
    try {
      if (isBluetooth) {
        const encoded = new TextEncoder().encode(uartWriteText);
        await typed.connection.uartWrite(encoded);
        log("uart", `Sent: ${uartWriteText}`);
      }
    } catch (e) { showError(e); }
  }, [typed, isBluetooth, uartWriteText, log, showError]);

  return (
    <div className="tab-page">
      <div className="section">
        <h2>Receive</h2>
        <div className="control-row" style={{ marginBottom: 8 }}>
          <button
            onClick={() => setUartListening(!uartListening)}
            className={`btn${uartListening ? " btn-toggle active" : ""}`}
          >
            {uartListening ? "Stop" : "Listen"}
          </button>
          <button onClick={() => setUartLines([])} className="btn">
            Clear
          </button>
        </div>
        {uartLines.length > 0 ? (
          <div className="data-box">
            {uartLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            <div ref={uartEndRef} />
          </div>
        ) : (
          <p className="empty-state">
            {uartListening ? "Waiting for UART data..." : "Press Listen to start receiving UART data."}
          </p>
        )}
      </div>

      <div className="section">
        <h2>Write</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "start" }}>
          <textarea
            value={uartWriteText}
            onChange={(e) => setUartWriteText(e.target.value)}
            rows={3}
            className="input"
            style={{
              fontFamily: "monospace",
              fontSize: 13,
              flex: 1,
              maxWidth: 400,
              resize: "vertical",
            }}
          />
          <button onClick={handleUartWrite} className="btn btn-primary">
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default UartTab;

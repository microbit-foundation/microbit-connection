import { useEffect, useState, useCallback, useRef } from "react";
import type { UartData } from "@microbit/microbit-connection";
import type { MicrobitBluetoothConnection } from "@microbit/microbit-connection/bluetooth";
import { useConnection } from "../hooks/use-connection.ts";
import { useLog } from "../hooks/use-log.ts";
import { useErrorDialog } from "../hooks/use-error-dialog.ts";

const ReceiveSection = ({ connection }: { connection: MicrobitBluetoothConnection }) => {
  const { log } = useLog();
  const [lines, setLines] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listening) return;
    const listener = (event: UartData) => {
      const value = new TextDecoder().decode(event.value);
      setLines((prev) => {
        const next = [...prev, value];
        return next.length > 200 ? next.slice(-200) : next;
      });
      log("uart", value, "data");
    };
    connection.addEventListener("uartdata", listener);
    return () => {
      connection.removeEventListener("uartdata", listener);
    };
  }, [connection, listening, log]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <div className="section">
      <h2>Receive</h2>
      <div className="control-row" style={{ marginBottom: 8 }}>
        <button
          onClick={() => setListening(!listening)}
          className={`btn${listening ? " btn-toggle active" : ""}`}
        >
          {listening ? "Stop" : "Listen"}
        </button>
        <button onClick={() => setLines([])} className="btn">
          Clear
        </button>
      </div>
      {lines.length > 0 ? (
        <div className="data-box">
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          <div ref={endRef} />
        </div>
      ) : (
        <p className="empty-state">
          {listening ? "Waiting for UART data..." : "Press Listen to start receiving UART data."}
        </p>
      )}
    </div>
  );
};

const WriteSection = ({ connection }: { connection: MicrobitBluetoothConnection }) => {
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const [text, setText] = useState("");

  const handleWrite = useCallback(async () => {
    try {
      const encoded = new TextEncoder().encode(text);
      await connection.uartWrite(encoded);
      log("uart", `Sent: ${text}`);
    } catch (e) { showError(e); }
  }, [connection, text, log, showError]);

  return (
    <div className="section">
      <h2>Write</h2>
      <div style={{ display: "flex", gap: 8, alignItems: "start" }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
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
        <button onClick={handleWrite} className="btn btn-primary">
          Send
        </button>
      </div>
    </div>
  );
};

const UartTab = () => {
  const { connection } = useConnection();

  if (connection.type !== "bluetooth") return null;

  return (
    <div className="tab-page">
      <ReceiveSection connection={connection} />
      <WriteSection connection={connection} />
    </div>
  );
};

export default UartTab;

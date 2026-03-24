import { useState, useCallback } from "react";
import type { MicrobitBluetoothConnection } from "@microbit/microbit-connection/bluetooth";
import { useConnection } from "../hooks/use-connection.ts";
import { useLog } from "../hooks/use-log.ts";
import { useErrorDialog } from "../hooks/use-error-dialog.ts";
import LedGrid from "./LedGrid.tsx";

const emptyMatrix = (): boolean[][] =>
  Array.from({ length: 5 }, () => Array(5).fill(false));

const TextSection = ({ connection }: { connection: MicrobitBluetoothConnection }) => {
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const [text, setText] = useState("");

  const sendText = useCallback(async () => {
    try {
      await connection.setLedText(text);
      log("led", `Text set: "${text}"`);
    } catch (e) { showError(e); }
  }, [connection, text, log, showError]);

  return (
    <div className="section">
      <h2>Text</h2>
      <div className="control-row">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Text to display"
          className="input"
          style={{ width: 200 }}
        />
        <button onClick={sendText} className="btn btn-primary">Write</button>
      </div>
    </div>
  );
};

const ScrollingDelaySection = ({ connection }: { connection: MicrobitBluetoothConnection }) => {
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const [delay, setDelay] = useState("");

  const getDelay = useCallback(async () => {
    try {
      const d = await connection.getLedScrollingDelay();
      if (d !== undefined) {
        setDelay(String(d));
      }
    } catch (e) { showError(e); }
  }, [connection, showError]);

  const setDelayValue = useCallback(async () => {
    try {
      await connection.setLedScrollingDelay(parseInt(delay, 10));
      log("led", `Scrolling delay set to ${delay}ms`);
    } catch (e) { showError(e); }
  }, [connection, delay, log, showError]);

  return (
    <div className="section">
      <h2>Scrolling Delay</h2>
      <div className="control-row">
        <input
          type="number"
          value={delay}
          onChange={(e) => setDelay(e.target.value)}
          placeholder="ms"
          className="input"
          style={{ width: 100 }}
        />
        <button onClick={getDelay} className="btn">Read</button>
        <button onClick={setDelayValue} className="btn">Write</button>
      </div>
    </div>
  );
};

const MatrixSection = ({ connection }: { connection: MicrobitBluetoothConnection }) => {
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const [matrix, setMatrix] = useState<boolean[][]>(emptyMatrix);

  const getMatrix = useCallback(async () => {
    try {
      const m = await connection.getLedMatrix();
      setMatrix(m);
    } catch (e) { showError(e); }
  }, [connection, showError]);

  const sendMatrix = useCallback(async () => {
    try {
      await connection.setLedMatrix(matrix);
      log("led", "Matrix updated");
    } catch (e) { showError(e); }
  }, [connection, matrix, log, showError]);

  const handleToggle = useCallback((row: number, col: number) => {
    setMatrix((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = !next[row][col];
      return next;
    });
  }, []);

  return (
    <div className="section">
      <h2>Matrix</h2>
      <LedGrid
        grid={matrix}
        onToggle={handleToggle}
        cellSize={32}
        gap={3}
      />
      <div className="control-row" style={{ marginTop: 8 }}>
        <button onClick={getMatrix} className="btn">Read</button>
        <button onClick={sendMatrix} className="btn">Write</button>
        <button onClick={() => setMatrix(emptyMatrix())} className="btn">Reset grid</button>
      </div>
    </div>
  );
};

const LedsTab = () => {
  const { connection } = useConnection();

  if (connection.type !== "bluetooth") {
    return (
      <div className="tab-page">
        <div className="section">
          <p className="empty-state">LEDs require a Bluetooth connection.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-page">
      <p className="service-note">Requires: LED Service</p>
      <TextSection connection={connection} />
      <ScrollingDelaySection connection={connection} />
      <MatrixSection connection={connection} />
    </div>
  );
};

export default LedsTab;

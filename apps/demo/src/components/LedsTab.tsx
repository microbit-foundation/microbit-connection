import { useState, useCallback } from "react";
import { useConnection } from "../hooks/use-connection.ts";
import { useLog } from "../hooks/use-log.ts";
import { useErrorDialog } from "../hooks/use-error-dialog.ts";
import LedGrid from "./LedGrid.tsx";

const emptyMatrix = (): boolean[][] =>
  Array.from({ length: 5 }, () => Array(5).fill(false));

const LedsTab = () => {
  const { typed } = useConnection();
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const isBluetooth = typed.type === "bluetooth";

  const [ledText, setLedText] = useState("");
  const [scrollDelay, setScrollDelay] = useState("");
  const [matrix, setMatrix] = useState<boolean[][]>(emptyMatrix);

  const sendText = useCallback(async () => {
    try {
      if (isBluetooth) {
        await typed.connection.setLedText(ledText);
        log("led", `Text set: "${ledText}"`);
      }
    } catch (e) { showError(e); }
  }, [typed, isBluetooth, ledText, log, showError]);

  const getScrollDelay = useCallback(async () => {
    try {
      if (isBluetooth) {
        const delay = await typed.connection.getLedScrollingDelay();
        if (delay !== undefined) {
          setScrollDelay(String(delay));
        }
      }
    } catch (e) { showError(e); }
  }, [typed, isBluetooth, showError]);

  const setScrollDelayValue = useCallback(async () => {
    try {
      if (isBluetooth) {
        await typed.connection.setLedScrollingDelay(parseInt(scrollDelay, 10));
        log("led", `Scrolling delay set to ${scrollDelay}ms`);
      }
    } catch (e) { showError(e); }
  }, [typed, isBluetooth, scrollDelay, log, showError]);

  const getMatrix = useCallback(async () => {
    try {
      if (isBluetooth) {
        const m = await typed.connection.getLedMatrix();
        setMatrix(m);
      }
    } catch (e) { showError(e); }
  }, [typed, isBluetooth, showError]);

  const sendMatrix = useCallback(async () => {
    try {
      if (isBluetooth) {
        await typed.connection.setLedMatrix(matrix as Parameters<typeof typed.connection.setLedMatrix>[0]);
        log("led", "Matrix updated");
      }
    } catch (e) { showError(e); }
  }, [typed, isBluetooth, matrix, log, showError]);

  const handleToggle = useCallback((row: number, col: number) => {
    setMatrix((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = !next[row][col];
      return next;
    });
  }, []);

  if (!isBluetooth) {
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
      <div className="section">
        <h2>Text</h2>
        <div className="control-row">
          <input
            type="text"
            value={ledText}
            onChange={(e) => setLedText(e.target.value)}
            placeholder="Text to display"
            className="input"
            style={{ width: 200 }}
          />
          <button onClick={sendText} className="btn btn-primary">Set text</button>
        </div>
      </div>

      <div className="section">
        <h2>Scrolling Delay</h2>
        <div className="control-row">
          <input
            type="number"
            value={scrollDelay}
            onChange={(e) => setScrollDelay(e.target.value)}
            placeholder="ms"
            className="input"
            style={{ width: 100 }}
          />
          <button onClick={getScrollDelay} className="btn">Get</button>
          <button onClick={setScrollDelayValue} className="btn">Set</button>
        </div>
      </div>

      <div className="section">
        <h2>Matrix</h2>
        <LedGrid
          grid={matrix}
          onToggle={handleToggle}
          cellSize={32}
          gap={3}
        />
        <div className="control-row" style={{ marginTop: 8 }}>
          <button onClick={getMatrix} className="btn">Get matrix</button>
          <button onClick={sendMatrix} className="btn">Set matrix</button>
          <button onClick={() => setMatrix(emptyMatrix())} className="btn">Clear</button>
        </div>
      </div>
    </div>
  );
};

export default LedsTab;

import { useEffect, useState, useCallback } from "react";
import type { PinData } from "@microbit/microbit-connection";
import type { MicrobitBluetoothConnection } from "@microbit/microbit-connection/bluetooth";
import { useConnection } from "../hooks/use-connection.ts";
import { useLog } from "../hooks/use-log.ts";
import { useErrorDialog } from "../hooks/use-error-dialog.ts";

const PINS = [0, 1, 2];

const PinConfigSection = ({
  connection,
}: {
  connection: MicrobitBluetoothConnection;
}) => {
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const [analogPins, setAnalogPins] = useState<Set<number>>(new Set());
  const [inputPins, setInputPins] = useState<Set<number>>(new Set());

  const readConfig = useCallback(async () => {
    try {
      const [analog, input] = await Promise.all([
        connection.getAnalogPins(),
        connection.getInputPins(),
      ]);
      setAnalogPins(new Set(analog.filter((p) => PINS.includes(p))));
      setInputPins(new Set(input.filter((p) => PINS.includes(p))));
      log("pins", `Analog: [${analog}], Input: [${input}]`);
    } catch (e) {
      showError(e);
    }
  }, [connection, log, showError]);

  const writeConfig = useCallback(async () => {
    try {
      await connection.setAnalogPins([...analogPins]);
      await connection.setInputPins([...inputPins]);
      log(
        "pins",
        `Config written — analog: [${[...analogPins]}], input: [${[...inputPins]}]`,
      );
    } catch (e) {
      showError(e);
    }
  }, [connection, analogPins, inputPins, log, showError]);

  const toggleAnalog = (pin: number) => {
    setAnalogPins((prev) => {
      const next = new Set(prev);
      next.has(pin) ? next.delete(pin) : next.add(pin);
      return next;
    });
  };

  const toggleInput = (pin: number) => {
    setInputPins((prev) => {
      const next = new Set(prev);
      next.has(pin) ? next.delete(pin) : next.add(pin);
      return next;
    });
  };

  return (
    <div className="section">
      <h2>Pin Configuration</h2>
      <table
        style={{ fontSize: 13, borderCollapse: "collapse", marginBottom: 8 }}
      >
        <thead>
          <tr>
            <th style={{ padding: "4px 12px 4px 0", textAlign: "left" }}>
              Pin
            </th>
            <th style={{ padding: "4px 12px" }}>Analog</th>
            <th style={{ padding: "4px 12px" }}>Input</th>
          </tr>
        </thead>
        <tbody>
          {PINS.map((pin) => (
            <tr key={pin}>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 600 }}>
                P{pin}
              </td>
              <td style={{ padding: "4px 12px", textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={analogPins.has(pin)}
                  onChange={() => toggleAnalog(pin)}
                />
              </td>
              <td style={{ padding: "4px 12px", textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={inputPins.has(pin)}
                  onChange={() => toggleInput(pin)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="control-row">
        <button onClick={readConfig} className="btn">
          Read
        </button>
        <button onClick={writeConfig} className="btn">
          Write
        </button>
      </div>
    </div>
  );
};

const PinDataSection = ({
  connection,
}: {
  connection: MicrobitBluetoothConnection;
}) => {
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const [pinValues, setPinValues] = useState<Map<number, number>>(new Map());
  const [listening, setListening] = useState(false);
  const [writePin, setWritePin] = useState(0);
  const [writeValue, setWriteValue] = useState("");

  useEffect(() => {
    if (!listening) return;
    const listener = (d: PinData) => {
      setPinValues((prev) => {
        const next = new Map(prev);
        for (const pv of d.data) {
          next.set(pv.pin, pv.value);
        }
        return next;
      });
    };
    connection.addEventListener("pinchanged", listener);
    return () => {
      connection.removeEventListener("pinchanged", listener);
    };
  }, [connection, listening]);

  const readAll = useCallback(async () => {
    try {
      const data = await connection.readPins();
      const next = new Map<number, number>();
      for (const pv of data) {
        next.set(pv.pin, pv.value);
      }
      setPinValues(next);
      log(
        "pins",
        `Read: ${data.map((d) => `P${d.pin}=${d.value}`).join(", ") || "(none)"}`,
      );
    } catch (e) {
      showError(e);
    }
  }, [connection, log, showError]);

  const writePin_ = useCallback(async () => {
    try {
      const value = parseInt(writeValue, 10);
      await connection.writePins([{ pin: writePin, value }]);
      log("pins", `Wrote P${writePin}=${value}`);
    } catch (e) {
      showError(e);
    }
  }, [connection, writePin, writeValue, log, showError]);

  const displayPins = PINS.filter((p) => pinValues.has(p));

  return (
    <div className="section">
      <h2>Pin Data</h2>
      <div className="control-row">
        <button
          onClick={() => setListening(!listening)}
          className={`btn${listening ? " btn-toggle active" : ""}`}
        >
          {listening ? "Stop" : "Listen"}
        </button>
        <button onClick={readAll} className="btn">
          Read
        </button>
      </div>
      {displayPins.length > 0 ? (
        <div className="sensor-readout">
          {displayPins.map((pin) => (
            <span key={pin} className="axis">
              <span className="axis-label">P{pin}:</span>
              <span className="axis-value" style={{ minWidth: 32 }}>
                {pinValues.get(pin)}
              </span>
            </span>
          ))}
        </div>
      ) : (
        <p className="empty-state">
          {listening
            ? "Waiting for pin changes..."
            : "Configure pins as inputs above, then Listen or Read."}
        </p>
      )}
      <h3>Write output pin</h3>
      <div className="control-row">
        <select
          className="select"
          value={writePin}
          onChange={(e) => setWritePin(parseInt(e.target.value, 10))}
        >
          {PINS.map((p) => (
            <option key={p} value={p}>
              P{p}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={writeValue}
          onChange={(e) => setWriteValue(e.target.value)}
          placeholder="Value"
          className="input"
          style={{ width: 60 }}
        />
        <button onClick={writePin_} className="btn">
          Write
        </button>
      </div>
    </div>
  );
};

const PwmSection = ({
  connection,
}: {
  connection: MicrobitBluetoothConnection;
}) => {
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const [pin, setPin] = useState(0);
  const [value, setValue] = useState("");
  const [period, setPeriod] = useState("");

  const writePwm = useCallback(async () => {
    try {
      const v = parseInt(value, 10);
      const p = parseInt(period, 10);
      await connection.writePinPwm(pin, { value: v, period: p });
      log("pins", `PWM P${pin}: value=${v}, period=${p}us`);
    } catch (e) {
      showError(e);
    }
  }, [connection, pin, value, period, log, showError]);

  return (
    <div className="section">
      <h2>PWM</h2>
      <div className="control-row">
        <select
          className="select"
          value={pin}
          onChange={(e) => setPin(parseInt(e.target.value, 10))}
        >
          {PINS.map((p) => (
            <option key={p} value={p}>
              P{p}
            </option>
          ))}
        </select>
        <label
          style={{
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Value:
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="input"
            style={{ width: 60 }}
            placeholder="0-1024"
          />
        </label>
        <label
          style={{
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Period (us):
          <input
            type="number"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="input"
            style={{ width: 80 }}
          />
        </label>
        <button onClick={writePwm} className="btn">
          Write
        </button>
      </div>
    </div>
  );
};

const PinsTab = () => {
  const { connection } = useConnection();

  if (connection.type !== "bluetooth") {
    return (
      <div className="tab-page">
        <div className="section">
          <p className="empty-state">Pins require a Bluetooth connection.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-page">
      <p className="service-note">Requires: IO Pin Service</p>
      <PinConfigSection connection={connection} />
      <PinDataSection connection={connection} />
      <PwmSection connection={connection} />
    </div>
  );
};

export default PinsTab;

import { useEffect, useState, useCallback } from "react";
import type {
  AccelerometerData,
  MagnetometerData,
  ButtonData,
} from "@microbit/microbit-connection";
import { useConnection } from "../hooks/use-connection.ts";
import { useLog } from "../hooks/use-log.ts";
import { useErrorDialog } from "../hooks/use-error-dialog.ts";

const SensorsTab = () => {
  const { typed } = useConnection();
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const isBluetooth = typed.type === "bluetooth";
  // Narrow to connection types that support service events (not USB)
  const serviceConn =
    typed.type !== "usb" ? typed.connection : undefined;

  // Accelerometer
  const [accelData, setAccelData] = useState<AccelerometerData | null>(null);
  const [accelListening, setAccelListening] = useState(false);
  const [accelPeriod, setAccelPeriod] = useState("");

  useEffect(() => {
    if (!accelListening || !serviceConn) return;
    const listener = (data: AccelerometerData) => setAccelData(data);
    serviceConn.addEventListener("accelerometerdatachanged", listener);
    return () => {
      serviceConn.removeEventListener("accelerometerdatachanged", listener);
    };
  }, [serviceConn, accelListening]);

  // Magnetometer
  const [magData, setMagData] = useState<MagnetometerData | null>(null);
  const [magListening, setMagListening] = useState(false);
  const [magPeriod, setMagPeriod] = useState("");
  const [bearing, setBearing] = useState<number | null>(null);

  useEffect(() => {
    if (!magListening || !serviceConn) return;
    const listener = (data: MagnetometerData) => setMagData(data);
    serviceConn.addEventListener("magnetometerdatachanged", listener);
    return () => {
      serviceConn.removeEventListener("magnetometerdatachanged", listener);
    };
  }, [serviceConn, magListening]);

  // Buttons
  const [buttonA, setButtonA] = useState<string>("-");
  const [buttonB, setButtonB] = useState<string>("-");
  const [buttonsListening, setButtonsListening] = useState(false);

  useEffect(() => {
    if (!buttonsListening || !serviceConn) return;
    const listenerA = (data: ButtonData) => {
      setButtonA(String(data.state));
      log("button", `A: ${data.state}`);
    };
    const listenerB = (data: ButtonData) => {
      setButtonB(String(data.state));
      log("button", `B: ${data.state}`);
    };
    serviceConn.addEventListener("buttonachanged", listenerA);
    serviceConn.addEventListener("buttonbchanged", listenerB);
    return () => {
      serviceConn.removeEventListener("buttonachanged", listenerA);
      serviceConn.removeEventListener("buttonbchanged", listenerB);
    };
  }, [serviceConn, buttonsListening, log]);

  const getAccelPeriod = useCallback(async () => {
    try {
      if (isBluetooth) {
        const p = await typed.connection.getAccelerometerPeriod();
        setAccelPeriod(String(p));
      }
    } catch (e) { showError(e); }
  }, [typed, isBluetooth, showError]);

  const setAccelPeriodValue = useCallback(async () => {
    try {
      if (isBluetooth) {
        await typed.connection.setAccelerometerPeriod(parseInt(accelPeriod, 10));
        log("accel", `Period set to ${accelPeriod}ms`);
      }
    } catch (e) { showError(e); }
  }, [typed, isBluetooth, accelPeriod, log, showError]);

  const getMagPeriod = useCallback(async () => {
    try {
      if (isBluetooth) {
        const p = await typed.connection.getMagnetometerPeriod();
        setMagPeriod(String(p));
      }
    } catch (e) { showError(e); }
  }, [typed, isBluetooth, showError]);

  const setMagPeriodValue = useCallback(async () => {
    try {
      if (isBluetooth) {
        await typed.connection.setMagnetometerPeriod(parseInt(magPeriod, 10));
        log("mag", `Period set to ${magPeriod}ms`);
      }
    } catch (e) { showError(e); }
  }, [typed, isBluetooth, magPeriod, log, showError]);

  const getBearing = useCallback(async () => {
    try {
      if (isBluetooth) {
        const b = await typed.connection.getMagnetometerBearing();
        setBearing(b);
        log("mag", `Bearing: ${b} degrees`);
      }
    } catch (e) { showError(e); }
  }, [typed, isBluetooth, log, showError]);

  const triggerCalibration = useCallback(async () => {
    try {
      if (isBluetooth) {
        log("mag", "Triggering calibration...");
        await typed.connection.triggerMagnetometerCalibration();
      }
    } catch (e) { showError(e); }
  }, [typed, isBluetooth, log, showError]);

  const renderAxisData = (data: { x: number; y: number; z: number } | null) => {
    if (!data) return null;
    return (
      <div className="sensor-readout">
        <span className="axis">
          <span className="axis-label">x:</span>
          <span className="axis-value">{data.x.toFixed(3)}</span>
        </span>
        <span className="axis">
          <span className="axis-label">y:</span>
          <span className="axis-value">{data.y.toFixed(3)}</span>
        </span>
        <span className="axis">
          <span className="axis-label">z:</span>
          <span className="axis-value">{data.z.toFixed(3)}</span>
        </span>
      </div>
    );
  };

  return (
    <div className="tab-page">
      {/* Accelerometer */}
      <div className="section">
        <h2>Accelerometer</h2>
        <div className="control-row">
          <button
            onClick={() => setAccelListening(!accelListening)}
            className={`btn${accelListening ? " btn-toggle active" : ""}`}

          >
            {accelListening ? "Stop" : "Listen"}
          </button>
        </div>
        {accelData ? renderAxisData(accelData) : (
          <p className="empty-state">
            {accelListening ? "Waiting for data..." : "Press Listen to start receiving accelerometer data."}
          </p>
        )}
        {isBluetooth && (
          <div className="control-row" style={{ marginTop: 8 }}>
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
              Period (ms):
              <input
                type="number"
                value={accelPeriod}
                onChange={(e) => setAccelPeriod(e.target.value)}
                className="input"
                style={{ width: 80 }}
              />
            </label>
            <button onClick={getAccelPeriod} className="btn">Get</button>
            <button onClick={setAccelPeriodValue} className="btn">Set</button>
          </div>
        )}
      </div>

      {/* Magnetometer */}
      <div className="section">
        <h2>Magnetometer</h2>
        <div className="control-row">
          <button
            onClick={() => setMagListening(!magListening)}
            className={`btn${magListening ? " btn-toggle active" : ""}`}

          >
            {magListening ? "Stop" : "Listen"}
          </button>
        </div>
        {magData ? renderAxisData(magData) : (
          <p className="empty-state">
            {magListening ? "Waiting for data..." : "Press Listen to start receiving magnetometer data."}
          </p>
        )}
        {isBluetooth && (
          <>
            <div className="control-row" style={{ marginTop: 8 }}>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                Period (ms):
                <input
                  type="number"
                  value={magPeriod}
                  onChange={(e) => setMagPeriod(e.target.value)}
                  className="input"
                  style={{ width: 80 }}
                />
              </label>
              <button onClick={getMagPeriod} className="btn">Get</button>
              <button onClick={setMagPeriodValue} className="btn">Set</button>
            </div>
            <div className="control-row" style={{ marginTop: 8 }}>
              <button onClick={triggerCalibration} className="btn">
                Calibrate
              </button>
              <button onClick={getBearing} className="btn">
                Get bearing
              </button>
            </div>
            {bearing !== null && (
              <p style={{ fontSize: 13, margin: "8px 0 0" }}>Bearing: {bearing} degrees</p>
            )}
          </>
        )}
      </div>

      {/* Buttons */}
      <div className="section">
        <h2>Buttons</h2>
        <div className="control-row">
          <button
            onClick={() => setButtonsListening(!buttonsListening)}
            className={`btn${buttonsListening ? " btn-toggle active" : ""}`}

          >
            {buttonsListening ? "Stop" : "Listen"}
          </button>
        </div>
        <div className="sensor-readout" style={{ marginTop: 8 }}>
          <span className="axis">
            <span className="axis-label">A:</span>
            <span className="axis-value" style={{ minWidth: 32 }}>{buttonA}</span>
          </span>
          <span className="axis">
            <span className="axis-label">B:</span>
            <span className="axis-value" style={{ minWidth: 32 }}>{buttonB}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default SensorsTab;

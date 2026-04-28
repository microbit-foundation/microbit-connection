import { useEffect, useState, useCallback } from "react";
import type {
  AccelerometerData,
  MagnetometerData,
  ButtonData,
  TemperatureData,
} from "@microbit/microbit-connection";
import type { MicrobitBluetoothConnection } from "@microbit/microbit-connection/bluetooth";
import type { MicrobitRadioBridgeConnection } from "@microbit/microbit-connection/radio-bridge";
import { useConnection } from "../hooks/use-connection.ts";
import { useLog } from "../hooks/use-log.ts";
import { useErrorDialog } from "../hooks/use-error-dialog.ts";

type ServiceConnection =
  | MicrobitBluetoothConnection
  | MicrobitRadioBridgeConnection;

const AxisReadout = ({
  data,
}: {
  data: { x: number; y: number; z: number };
}) => (
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

const AccelerometerSection = ({
  connection,
}: {
  connection: ServiceConnection;
}) => {
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const [data, setData] = useState<AccelerometerData | null>(null);
  const [listening, setListening] = useState(false);
  const [period, setPeriod] = useState("");

  useEffect(() => {
    if (!listening) return;
    const listener = (d: AccelerometerData) => setData(d);
    connection.addEventListener("accelerometerdatachanged", listener);
    return () => {
      connection.removeEventListener("accelerometerdatachanged", listener);
    };
  }, [connection, listening]);

  const getPeriod = useCallback(async () => {
    try {
      if (connection.type === "bluetooth") {
        const p = await connection.getAccelerometerPeriod();
        setPeriod(String(p));
      }
    } catch (e) {
      showError(e);
    }
  }, [connection, showError]);

  const setPeriodValue = useCallback(async () => {
    try {
      if (connection.type === "bluetooth") {
        await connection.setAccelerometerPeriod(parseInt(period, 10));
        log("accel", `Period set to ${period}ms`);
      }
    } catch (e) {
      showError(e);
    }
  }, [connection, period, log, showError]);

  return (
    <div className="section">
      <h2>Accelerometer Service</h2>
      <div className="control-row">
        <button
          onClick={() => setListening(!listening)}
          className={`btn${listening ? " btn-toggle active" : ""}`}
        >
          {listening ? "Stop" : "Listen"}
        </button>
      </div>
      {data ? (
        <AxisReadout data={data} />
      ) : (
        <p className="empty-state">
          {listening
            ? "Waiting for data..."
            : "Press Listen to start receiving accelerometer data."}
        </p>
      )}
      {connection.type === "bluetooth" && (
        <div className="control-row" style={{ marginTop: 8 }}>
          <label
            style={{
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Period (ms):
            <input
              type="number"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="input"
              style={{ width: 80 }}
            />
          </label>
          <button onClick={getPeriod} className="btn">
            Read
          </button>
          <button onClick={setPeriodValue} className="btn">
            Write
          </button>
        </div>
      )}
    </div>
  );
};

const MagnetometerSection = ({
  connection,
}: {
  connection: MicrobitBluetoothConnection;
}) => {
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const [data, setData] = useState<MagnetometerData | null>(null);
  const [listening, setListening] = useState(false);
  const [period, setPeriod] = useState("");
  const [bearing, setBearing] = useState<number | null>(null);

  useEffect(() => {
    if (!listening) return;
    const listener = (d: MagnetometerData) => setData(d);
    connection.addEventListener("magnetometerdatachanged", listener);
    return () => {
      connection.removeEventListener("magnetometerdatachanged", listener);
    };
  }, [connection, listening]);

  const getPeriod = useCallback(async () => {
    try {
      const p = await connection.getMagnetometerPeriod();
      setPeriod(String(p));
    } catch (e) {
      showError(e);
    }
  }, [connection, showError]);

  const setPeriodValue = useCallback(async () => {
    try {
      await connection.setMagnetometerPeriod(parseInt(period, 10));
      log("mag", `Period set to ${period}ms`);
    } catch (e) {
      showError(e);
    }
  }, [connection, period, log, showError]);

  const handleGetBearing = useCallback(async () => {
    try {
      const b = await connection.getMagnetometerBearing();
      setBearing(b);
      log("mag", `Bearing: ${b} degrees`);
    } catch (e) {
      showError(e);
    }
  }, [connection, log, showError]);

  const handleCalibrate = useCallback(async () => {
    try {
      log("mag", "Triggering calibration...");
      await connection.triggerMagnetometerCalibration();
    } catch (e) {
      showError(e);
    }
  }, [connection, log, showError]);

  return (
    <div className="section">
      <h2>Magnetometer Service</h2>
      <div className="control-row">
        <button
          onClick={() => setListening(!listening)}
          className={`btn${listening ? " btn-toggle active" : ""}`}
        >
          {listening ? "Stop" : "Listen"}
        </button>
      </div>
      {data ? (
        <AxisReadout data={data} />
      ) : (
        <p className="empty-state">
          {listening
            ? "Waiting for data..."
            : "Press Listen to start receiving magnetometer data."}
        </p>
      )}
      <div className="control-row" style={{ marginTop: 8 }}>
        <label
          style={{
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Period (ms):
          <input
            type="number"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="input"
            style={{ width: 80 }}
          />
        </label>
        <button onClick={getPeriod} className="btn">
          Read
        </button>
        <button onClick={setPeriodValue} className="btn">
          Write
        </button>
      </div>
      <div className="control-row" style={{ marginTop: 8 }}>
        <button onClick={handleCalibrate} className="btn">
          Calibrate
        </button>
        <button onClick={handleGetBearing} className="btn">
          Read bearing
        </button>
      </div>
      {bearing !== null && (
        <p style={{ fontSize: 13, margin: "8px 0 0" }}>
          Bearing: {bearing} degrees
        </p>
      )}
    </div>
  );
};

const TemperatureSection = ({
  connection,
}: {
  connection: MicrobitBluetoothConnection;
}) => {
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const [celsius, setCelsius] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [period, setPeriod] = useState("");

  useEffect(() => {
    if (!listening) return;
    const listener = (d: TemperatureData) => setCelsius(d.celsius);
    connection.addEventListener("temperaturechanged", listener);
    return () => {
      connection.removeEventListener("temperaturechanged", listener);
    };
  }, [connection, listening]);

  const readTemperature = useCallback(async () => {
    try {
      const t = await connection.getTemperature();
      setCelsius(t);
      log("temp", `Temperature: ${t} °C`);
    } catch (e) {
      showError(e);
    }
  }, [connection, log, showError]);

  const getPeriod = useCallback(async () => {
    try {
      const p = await connection.getTemperaturePeriod();
      setPeriod(String(p));
    } catch (e) {
      showError(e);
    }
  }, [connection, showError]);

  const setPeriodValue = useCallback(async () => {
    try {
      await connection.setTemperaturePeriod(parseInt(period, 10));
      log("temp", `Period set to ${period}ms`);
    } catch (e) {
      showError(e);
    }
  }, [connection, period, log, showError]);

  return (
    <div className="section">
      <h2>Temperature Service</h2>
      <div className="control-row">
        <button
          onClick={() => setListening(!listening)}
          className={`btn${listening ? " btn-toggle active" : ""}`}
        >
          {listening ? "Stop" : "Listen"}
        </button>
        <button onClick={readTemperature} className="btn">
          Read
        </button>
      </div>
      {celsius !== null ? (
        <div className="sensor-readout">
          <span className="axis">
            <span className="axis-value" style={{ minWidth: 40 }}>
              {celsius} °C
            </span>
          </span>
        </div>
      ) : (
        <p className="empty-state">
          {listening
            ? "Waiting for data..."
            : "Press Listen or Read to get temperature."}
        </p>
      )}
      <div className="control-row" style={{ marginTop: 8 }}>
        <label
          style={{
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Period (ms):
          <input
            type="number"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="input"
            style={{ width: 80 }}
          />
        </label>
        <button onClick={getPeriod} className="btn">
          Read
        </button>
        <button onClick={setPeriodValue} className="btn">
          Write
        </button>
      </div>
    </div>
  );
};

const ButtonsSection = ({ connection }: { connection: ServiceConnection }) => {
  const { log } = useLog();
  const [buttonA, setButtonA] = useState<string>("-");
  const [buttonB, setButtonB] = useState<string>("-");
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const listenerA = (data: ButtonData) => {
      setButtonA(String(data.state));
      log("button", `A: ${data.state}`);
    };
    const listenerB = (data: ButtonData) => {
      setButtonB(String(data.state));
      log("button", `B: ${data.state}`);
    };
    connection.addEventListener("buttonachanged", listenerA);
    connection.addEventListener("buttonbchanged", listenerB);
    return () => {
      connection.removeEventListener("buttonachanged", listenerA);
      connection.removeEventListener("buttonbchanged", listenerB);
    };
  }, [connection, listening, log]);

  return (
    <div className="section">
      <h2>Button Service</h2>
      <div className="control-row">
        <button
          onClick={() => setListening(!listening)}
          className={`btn${listening ? " btn-toggle active" : ""}`}
        >
          {listening ? "Stop" : "Listen"}
        </button>
      </div>
      <div className="sensor-readout" style={{ marginTop: 8 }}>
        <span className="axis">
          <span className="axis-label">A:</span>
          <span className="axis-value" style={{ minWidth: 32 }}>
            {buttonA}
          </span>
        </span>
        <span className="axis">
          <span className="axis-label">B:</span>
          <span className="axis-value" style={{ minWidth: 32 }}>
            {buttonB}
          </span>
        </span>
      </div>
    </div>
  );
};

const SensorsTab = () => {
  const { connection } = useConnection();

  if (connection.type === "usb") return null;

  return (
    <div className="tab-page">
      <AccelerometerSection connection={connection} />
      {connection.type === "bluetooth" && (
        <>
          <MagnetometerSection connection={connection} />
          <TemperatureSection connection={connection} />
        </>
      )}
      <ButtonsSection connection={connection} />
    </div>
  );
};

export default SensorsTab;

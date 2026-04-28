import { useEffect, useState, useCallback, useRef } from "react";
import type {
  GestureData,
  ButtonActionData,
  MicrobitEventData,
} from "@microbit/microbit-connection";
import { GestureEvent, ButtonAction } from "@microbit/microbit-connection";
import type { MicrobitBluetoothConnection } from "@microbit/microbit-connection/bluetooth";
import { useConnection } from "../hooks/use-connection.ts";
import { useLog } from "../hooks/use-log.ts";
import { useErrorDialog } from "../hooks/use-error-dialog.ts";

const gestureNames: Record<number, string> = {
  [GestureEvent.TiltUp]: "Tilt up",
  [GestureEvent.TiltDown]: "Tilt down",
  [GestureEvent.TiltLeft]: "Tilt left",
  [GestureEvent.TiltRight]: "Tilt right",
  [GestureEvent.FaceUp]: "Face up",
  [GestureEvent.FaceDown]: "Face down",
  [GestureEvent.Freefall]: "Freefall",
  [GestureEvent.Acceleration3g]: "3g",
  [GestureEvent.Acceleration6g]: "6g",
  [GestureEvent.Acceleration8g]: "8g",
  [GestureEvent.Shake]: "Shake",
  [GestureEvent.Acceleration2g]: "2g",
};

const buttonActionNames: Record<number, string> = {
  [ButtonAction.Down]: "Down",
  [ButtonAction.Up]: "Up",
  [ButtonAction.Click]: "Click",
  [ButtonAction.LongClick]: "Long click",
  [ButtonAction.Hold]: "Hold",
  [ButtonAction.DoubleClick]: "Double click",
};

const GestureSection = ({
  connection,
}: {
  connection: MicrobitBluetoothConnection;
}) => {
  const [gesture, setGesture] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const listener = (d: GestureData) => {
      setGesture(gestureNames[d.gesture] ?? `Unknown (${d.gesture})`);
    };
    connection.addEventListener("gesturechanged", listener);
    return () => {
      connection.removeEventListener("gesturechanged", listener);
    };
  }, [connection, listening]);

  return (
    <div className="section">
      <h2>Gestures</h2>
      <div className="control-row">
        <button
          onClick={() => setListening(!listening)}
          className={`btn${listening ? " btn-toggle active" : ""}`}
        >
          {listening ? "Stop" : "Listen"}
        </button>
      </div>
      {gesture !== null ? (
        <div className="sensor-readout">
          <span className="axis">
            <span className="axis-value" style={{ minWidth: 80 }}>
              {gesture}
            </span>
          </span>
        </div>
      ) : (
        <p className="empty-state">
          {listening
            ? "Shake or tilt the micro:bit..."
            : "Press Listen to start receiving gesture events."}
        </p>
      )}
    </div>
  );
};

const ButtonClicksSection = ({
  connection,
}: {
  connection: MicrobitBluetoothConnection;
}) => {
  const [lastA, setLastA] = useState("-");
  const [lastB, setLastB] = useState("-");
  const [lastAB, setLastAB] = useState("-");
  const [lastLogo, setLastLogo] = useState("-");
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const onA = (d: ButtonActionData) => {
      setLastA(buttonActionNames[d.action] ?? String(d.action));
    };
    const onB = (d: ButtonActionData) => {
      setLastB(buttonActionNames[d.action] ?? String(d.action));
    };
    const onAB = (d: ButtonActionData) => {
      setLastAB(buttonActionNames[d.action] ?? String(d.action));
    };
    const onLogo = (d: ButtonActionData) => {
      setLastLogo(buttonActionNames[d.action] ?? String(d.action));
    };
    connection.addEventListener("buttonaaction", onA);
    connection.addEventListener("buttonbaction", onB);
    connection.addEventListener("buttonabaction", onAB);
    connection.addEventListener("logoaction", onLogo);
    return () => {
      connection.removeEventListener("buttonaaction", onA);
      connection.removeEventListener("buttonbaction", onB);
      connection.removeEventListener("buttonabaction", onAB);
      connection.removeEventListener("logoaction", onLogo);
    };
  }, [connection, listening]);

  return (
    <div className="section">
      <h2>Button Events</h2>
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
          <span className="axis-value" style={{ minWidth: 80 }}>
            {lastA}
          </span>
        </span>
        <span className="axis">
          <span className="axis-label">B:</span>
          <span className="axis-value" style={{ minWidth: 80 }}>
            {lastB}
          </span>
        </span>
        <span className="axis">
          <span className="axis-label">A+B:</span>
          <span className="axis-value" style={{ minWidth: 80 }}>
            {lastAB}
          </span>
        </span>
        <span className="axis">
          <span className="axis-label">Logo:</span>
          <span className="axis-value" style={{ minWidth: 80 }}>
            {lastLogo}
          </span>
        </span>
      </div>
    </div>
  );
};

const RawEventsSection = ({
  connection,
}: {
  connection: MicrobitBluetoothConnection;
}) => {
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const [listening, setListening] = useState(false);
  const [source, setSource] = useState("0");
  const [value, setValue] = useState("0");
  const [entries, setEntries] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listening) return;
    const listener = (d: MicrobitEventData) => {
      setEntries((prev) => {
        const next = [...prev, `source=${d.source} value=${d.value}`];
        return next.length > 100 ? next.slice(-100) : next;
      });
    };
    connection.addEventListener("microbitevent", listener);
    return () => {
      connection.removeEventListener("microbitevent", listener);
    };
  }, [connection, listening]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [entries]);

  const subscribe = useCallback(async () => {
    try {
      const s = parseInt(source, 10);
      const v = parseInt(value, 10);
      await connection.subscribeToEvent(s, v);
      log("event", `Subscribed to source=${s} value=${v}`);
    } catch (e) {
      showError(e);
    }
  }, [connection, source, value, log, showError]);

  return (
    <div className="section">
      <h2>Raw Events</h2>
      <div className="control-row">
        <button
          onClick={() => setListening(!listening)}
          className={`btn${listening ? " btn-toggle active" : ""}`}
        >
          {listening ? "Stop" : "Listen"}
        </button>
      </div>
      <div className="control-row" style={{ marginTop: 8 }}>
        <label
          style={{
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Source:
          <input
            type="number"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="input"
            style={{ width: 60 }}
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
          Value:
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="input"
            style={{ width: 60 }}
            placeholder="0 = any"
          />
        </label>
        <button onClick={subscribe} className="btn">
          Subscribe
        </button>
        <button onClick={() => setEntries([])} className="btn">
          Clear
        </button>
      </div>
      <div ref={logRef} className="data-box">
        {entries.length > 0
          ? entries.join("\n")
          : listening
            ? "Waiting for events..."
            : "Listen and subscribe to see raw events."}
      </div>
    </div>
  );
};

const SendEventSection = ({
  connection,
}: {
  connection: MicrobitBluetoothConnection;
}) => {
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const [source, setSource] = useState("");
  const [value, setValue] = useState("");

  const send = useCallback(async () => {
    try {
      const s = parseInt(source, 10);
      const v = parseInt(value, 10);
      await connection.sendEvent(s, v);
      log("event", `Sent source=${s} value=${v}`);
    } catch (e) {
      showError(e);
    }
  }, [connection, source, value, log, showError]);

  return (
    <div className="section">
      <h2>Send Event</h2>
      <div className="control-row">
        <label
          style={{
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Source:
          <input
            type="number"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="input"
            style={{ width: 60 }}
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
          Value:
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="input"
            style={{ width: 60 }}
          />
        </label>
        <button onClick={send} className="btn">
          Send
        </button>
      </div>
    </div>
  );
};

const EventsTab = () => {
  const { connection } = useConnection();

  if (connection.type !== "bluetooth") {
    return (
      <div className="tab-page">
        <div className="section">
          <p className="empty-state">Events require a Bluetooth connection.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-page">
      <p className="service-note">Requires: Event Service</p>
      <GestureSection connection={connection} />
      <ButtonClicksSection connection={connection} />
      <RawEventsSection connection={connection} />
      <SendEventSection connection={connection} />
    </div>
  );
};

export default EventsTab;

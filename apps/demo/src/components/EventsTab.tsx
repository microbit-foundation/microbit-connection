import type {
  BoardVersion,
  MicrobitEvent,
} from "@microbit/microbit-connection";
import {
  Any,
  ButtonValue,
  GestureValue,
  V1Source,
  V2Source,
} from "@microbit/microbit-connection";
import type { MicrobitBluetoothConnection } from "@microbit/microbit-connection/bluetooth";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection } from "../hooks/use-connection.ts";
import { useErrorDialog } from "../hooks/use-error-dialog.ts";
import { useLog } from "../hooks/use-log.ts";

interface EventFilter {
  source: number;
  value: number;
  label?: string;
}

const sourceForVersion = (version: BoardVersion | undefined) =>
  version === "V1" ? V1Source : V2Source;

type SourceMap = typeof V1Source | typeof V2Source;

const presets = (s: SourceMap): EventFilter[] => [
  { source: s.ButtonA, value: Any, label: "Button A" },
  { source: s.ButtonB, value: Any, label: "Button B" },
  { source: s.ButtonAB, value: Any, label: "Button A+B" },
  { source: s.Gesture, value: Any, label: "Gestures" },
  { source: s.Pin0, value: Any, label: "Pin 0" },
  { source: s.Pin1, value: Any, label: "Pin 1" },
  { source: s.Pin2, value: Any, label: "Pin 2" },
  ...("Logo" in s
    ? [{ source: (s as typeof V2Source).Logo, value: Any, label: "Logo" }]
    : []),
];

/** Reverse-lookup a human-readable name for a source ID. */
const sourceName = (s: SourceMap, id: number): string | undefined => {
  for (const [name, val] of Object.entries(s)) {
    if (val === id) return name;
  }
  return undefined;
};

const valueName = (
  sourceId: number,
  s: SourceMap,
  val: number,
): string | undefined => {
  // Determine which value enum applies based on the source
  const buttonIds = new Set([
    s.ButtonA,
    s.ButtonB,
    "ButtonAB" in s ? (s as typeof V2Source).ButtonAB ?? -1 : -1,
  ]);
  if (buttonIds.has(sourceId)) {
    for (const [name, v] of Object.entries(ButtonValue)) {
      if (v === val) return name;
    }
  }
  if (sourceId === s.Gesture) {
    for (const [name, v] of Object.entries(GestureValue)) {
      if (v === val) return name;
    }
  }
  return undefined;
};

const formatEvent = (event: MicrobitEvent, s: SourceMap): string => {
  const src = sourceName(s, event.source);
  const val = valueName(event.source, s, event.value);
  const srcStr = src ? `${src} (${event.source})` : String(event.source);
  const valStr = val ? `${val} (${event.value})` : String(event.value);
  return `${srcStr} → ${valStr}`;
};

const ReceiveSection = ({
  connection,
  boardVersion,
}: {
  connection: MicrobitBluetoothConnection;
  boardVersion: BoardVersion | undefined;
}) => {
  const { log } = useLog();
  const [events, setEvents] = useState<MicrobitEvent[]>([]);
  const [filters, setFilters] = useState<EventFilter[]>([]);
  const [sourceInput, setSourceInput] = useState("0");
  const [valueInput, setValueInput] = useState("0");
  const endRef = useRef<HTMLDivElement>(null);

  const s = sourceForVersion(boardVersion);

  // Stable listener ref so we can add/remove individual filters without
  // tearing down all listeners on every change.
  const logRef = useRef(log);
  logRef.current = log;
  const sRef = useRef(s);
  sRef.current = s;

  const listenerRef = useRef<(event: MicrobitEvent) => void>();
  if (!listenerRef.current) {
    listenerRef.current = (event: MicrobitEvent) => {
      setEvents((prev) => {
        const next = [...prev, event];
        return next.length > 200 ? next.slice(-200) : next;
      });
      logRef.current("event", formatEvent(event, sRef.current), "data");
    };
  }

  const addFilter = useCallback(
    (filter: EventFilter) => {
      setFilters((prev) => {
        if (
          prev.some(
            (f) => f.source === filter.source && f.value === filter.value,
          )
        )
          return prev;
        connection.addEventListener(
          filter.source,
          filter.value,
          listenerRef.current!,
        );
        return [...prev, filter];
      });
    },
    [connection],
  );

  const addCustomFilter = useCallback(() => {
    const source = parseInt(sourceInput, 10);
    const value = parseInt(valueInput, 10);
    if (isNaN(source) || isNaN(value)) return;
    addFilter({ source, value });
  }, [sourceInput, valueInput, addFilter]);

  const removeFilter = useCallback(
    (index: number) => {
      setFilters((prev) => {
        const f = prev[index];
        if (f) {
          connection.removeEventListener(
            f.source,
            f.value,
            listenerRef.current!,
          );
        }
        return prev.filter((_, i) => i !== index);
      });
    },
    [connection],
  );

  // Keep a ref to the current filters for cleanup on unmount
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Clean up all listeners on unmount
  useEffect(() => {
    return () => {
      for (const f of filtersRef.current) {
        connection.removeEventListener(f.source, f.value, listenerRef.current!);
      }
    };
  }, [connection]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  const filterLabel = (f: EventFilter) =>
    f.label ?? `${sourceName(s, f.source) ?? f.source}:${f.value}`;

  return (
    <div className="section">
      <h2>Receive</h2>
      <div
        style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}
      >
        {presets(s).map((p, i) => (
          <button
            key={i}
            className="btn"
            onClick={() => addFilter(p)}
            disabled={filters.some(
              (f) => f.source === p.source && f.value === p.value,
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "end",
          marginBottom: 8,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 12 }}>Source</span>
          <input
            type="number"
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            className="input"
            style={{ width: 80 }}
            min={0}
            max={65535}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 12 }}>Value</span>
          <input
            type="number"
            value={valueInput}
            onChange={(e) => setValueInput(e.target.value)}
            className="input"
            style={{ width: 80 }}
            min={0}
            max={65535}
          />
        </label>
        <button onClick={addCustomFilter} className="btn btn-primary">
          Listen
        </button>
      </div>
      {filters.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          {filters.map((f, i) => (
            <span
              key={i}
              className="filter-tag"
              onClick={() => removeFilter(i)}
              title="Click to remove"
            >
              {filterLabel(f)} &times;
            </span>
          ))}
        </div>
      )}
      <div className="control-row" style={{ marginBottom: 8 }}>
        <button onClick={() => setEvents([])} className="btn">
          Clear
        </button>
      </div>
      {events.length > 0 ? (
        <div className="data-box">
          {events.map((event, i) => (
            <div key={i} style={{ fontFamily: "monospace", fontSize: 12 }}>
              {formatEvent(event, s)}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      ) : (
        <p className="empty-state">
          {filters.length > 0
            ? "Waiting for events..."
            : "Pick a preset or enter source/value to start listening."}
        </p>
      )}
    </div>
  );
};

const SendSection = ({
  connection,
  boardVersion,
}: {
  connection: MicrobitBluetoothConnection;
  boardVersion: BoardVersion | undefined;
}) => {
  const { log } = useLog();
  const { showError } = useErrorDialog();
  const [sourceInput, setSourceInput] = useState("9000");
  const [valueInput, setValueInput] = useState("1");

  const s = sourceForVersion(boardVersion);

  const handleSend = useCallback(async () => {
    try {
      const source = parseInt(sourceInput, 10);
      const value = parseInt(valueInput, 10);
      if (isNaN(source) || isNaN(value)) return;
      await connection.sendMicrobitEvents([{ source, value }]);
      log("event", `Sent: ${formatEvent({ source, value }, s)}`);
    } catch (e) {
      showError(e);
    }
  }, [connection, sourceInput, valueInput, log, showError, s]);

  return (
    <div className="section">
      <h2>Send</h2>
      <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 12 }}>Source</span>
          <input
            type="number"
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            className="input"
            style={{ width: 80 }}
            min={0}
            max={65535}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 12 }}>Value</span>
          <input
            type="number"
            value={valueInput}
            onChange={(e) => setValueInput(e.target.value)}
            className="input"
            style={{ width: 80 }}
            min={0}
            max={65535}
          />
        </label>
        <button onClick={handleSend} className="btn btn-primary">
          Send
        </button>
      </div>
    </div>
  );
};

const EventsTab = () => {
  const { connection, boardVersion } = useConnection();

  if (connection.type !== "bluetooth") return null;

  return (
    <div className="tab-page">
      <ReceiveSection connection={connection} boardVersion={boardVersion} />
      <SendSection connection={connection} boardVersion={boardVersion} />
    </div>
  );
};

export default EventsTab;

import { useEffect, useRef } from "react";
import { useLog } from "../hooks/use-log.ts";

const levelColors: Record<string, string> = {
  info: "#666",
  warn: "#b45309",
  error: "#dc2626",
  data: "#2563eb",
};

const LogPanel = () => {
  const { entries, isOpen, setIsOpen, clear } = useLog();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <div className={`log-panel${isOpen ? " open" : ""}`}>
      <div className="log-panel-tab">
        <button
          className="log-panel-toggle"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls="log-panel-content"
        >
          <span>Log {entries.length > 0 && `(${entries.length})`}</span>
          <span className="log-panel-chevron" aria-hidden="true">
            {isOpen ? "\u25BC" : "\u25B2"}
          </span>
        </button>
        {isOpen && (
          <button
            onClick={clear}
            className="btn"
            style={{ padding: "2px 8px", fontSize: 11 }}
          >
            Clear
          </button>
        )}
      </div>
      {isOpen && (
        <div
          id="log-panel-content"
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
          }}
        >
          <div
            role="log"
            aria-live="polite"
            aria-label="Application log"
            style={{ overflow: "auto", flex: 1, padding: "4px 8px" }}
          >
            {entries.map((entry) => {
              const time = new Date(entry.timestamp);
              const ts =
                time.toTimeString().slice(0, 8) +
                "." +
                String(time.getMilliseconds()).padStart(3, "0");
              return (
                <div
                  key={entry.id}
                  style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}
                >
                  <span style={{ color: "#737373" }}>{ts}</span>{" "}
                  <span style={{ color: levelColors[entry.level] ?? "#666" }}>
                    [{entry.source}]
                  </span>{" "}
                  {entry.message}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </div>
  );
};

export default LogPanel;

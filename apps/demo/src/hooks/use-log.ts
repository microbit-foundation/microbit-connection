import { createContext, useCallback, useContext, useState } from "react";
import type { Logging, LoggingEvent } from "@microbit/microbit-connection";

export interface LogEntry {
  id: number;
  timestamp: number;
  level: "info" | "warn" | "error" | "data";
  source: string;
  message: string;
}

interface LogContextValue {
  entries: LogEntry[];
  log: (source: string, message: string, level?: LogEntry["level"]) => void;
  clear: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const LogContext = createContext<LogContextValue | undefined>(undefined);

let nextId = 0;
const MAX_ENTRIES = 500;

export const useLogState = (): LogContextValue => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const log = useCallback(
    (source: string, message: string, level: LogEntry["level"] = "info") => {
      setEntries((prev) => {
        const entry: LogEntry = {
          id: nextId++,
          timestamp: Date.now(),
          level,
          source,
          message,
        };
        const next = [...prev, entry];
        return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
      });
    },
    [],
  );

  const clear = useCallback(() => setEntries([]), []);

  return { entries, log, clear, isOpen, setIsOpen };
};

export const useLog = (): LogContextValue => {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error("Missing LogContext.Provider");
  return ctx;
};

/**
 * Creates a Logging implementation that bridges library internal logs
 * to our LogContext.
 */
export const createLoggingAdapter = (log: LogContextValue["log"]): Logging => ({
  event(event: LoggingEvent) {
    const parts = [event.type];
    if (event.message) parts.push(event.message);
    if (event.value !== undefined) parts.push(String(event.value));
    log("lib", parts.join(": "));
  },
  error(message: string, e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    log("lib", `${message}: ${detail}`, "error");
  },
  log(e: unknown) {
    log("lib", typeof e === "string" ? e : JSON.stringify(e));
  },
});

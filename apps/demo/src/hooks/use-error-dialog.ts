import { createContext, useCallback, useContext, useState } from "react";
import { DeviceError } from "@microbit/microbit-connection";

/** Error codes that represent user cancellation — no dialog needed. */
const silentCodes = new Set(["no-device-selected", "aborted"]);

interface ErrorDialogState {
  code: string | undefined;
  message: string;
}

interface ErrorDialogContextValue {
  error: ErrorDialogState | null;
  showError: (error: unknown) => void;
  clearError: () => void;
}

export const ErrorDialogContext = createContext<
  ErrorDialogContextValue | undefined
>(undefined);

export const useErrorDialogState = (): ErrorDialogContextValue => {
  const [error, setError] = useState<ErrorDialogState | null>(null);

  const showError = useCallback((err: unknown) => {
    if (err instanceof DeviceError && silentCodes.has(err.code)) {
      return;
    }
    const code = err instanceof DeviceError ? err.code : undefined;
    const message =
      err instanceof Error ? err.message : String(err);
    setError({ code, message });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { error, showError, clearError };
};

export const useErrorDialog = (): ErrorDialogContextValue => {
  const ctx = useContext(ErrorDialogContext);
  if (!ctx) throw new Error("Missing ErrorDialogContext.Provider");
  return ctx;
};

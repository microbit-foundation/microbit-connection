import { useErrorDialog } from "../hooks/use-error-dialog.ts";
import Dialog from "./Dialog.tsx";

const ErrorDialog = () => {
  const { error, clearError } = useErrorDialog();
  if (!error) return null;

  return (
    <Dialog
      title="Error"
      titleId="error-dialog-title"
      titleStyle={{ color: "#dc2626" }}
    >
      {error.code && (
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 13,
            color: "#666",
            margin: "0 0 8px",
          }}
        >
          {error.code}
        </p>
      )}
      <p>{error.message}</p>
      <div className="dialog-actions">
        <button onClick={clearError} className="btn-dialog-primary">
          OK
        </button>
      </div>
    </Dialog>
  );
};

export default ErrorDialog;

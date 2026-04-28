import { Step } from "../hooks/use-flashing.ts";
import BluetoothPatternInput from "./BluetoothPatternInput.tsx";
import Dialog from "./Dialog.tsx";

interface FlashOverlayProps {
  step: Step;
  setStep: (step: Step) => void;
  handleClose: () => void;
  handleFlash: () => void;
  setDeviceName: (name: string) => void;
  deviceName: string | null;
}

const FlashOverlay = ({
  step,
  setStep,
  handleClose,
  handleFlash,
  setDeviceName,
  deviceName,
}: FlashOverlayProps) => {
  switch (step.name) {
    case "initial":
      return (
        <Dialog title="Send to micro:bit" titleId="flash-dialog-title">
          <p>Do you want to send this program to your micro:bit?</p>
          <div className="dialog-actions">
            <button
              onClick={() => setStep({ name: "pair-mode" })}
              className="btn-dialog-primary"
            >
              Send
            </button>
            <button onClick={handleClose} className="btn-dialog-secondary">
              Cancel
            </button>
          </div>
        </Dialog>
      );

    case "pair-mode":
      return (
        <Dialog title="Ready to pair" titleId="flash-dialog-title">
          <p>Press reset on the micro:bit three times.</p>
          <p>
            If your micro:bit has not been updated in a while, hold button A and
            B and press reset.
          </p>
          <div className="dialog-actions">
            <button
              onClick={() => setStep({ name: "enter-pattern" })}
              className="btn-dialog-primary"
            >
              My micro:bit shows a pattern
            </button>
            <button onClick={handleClose} className="btn-dialog-secondary">
              Cancel
            </button>
          </div>
        </Dialog>
      );

    case "enter-pattern":
      return (
        <Dialog title="Draw your pattern" titleId="flash-dialog-title">
          <BluetoothPatternInput
            onDeviceNameChange={setDeviceName}
            initialValue={deviceName ?? undefined}
          />
          <div className="dialog-actions">
            <button
              onClick={handleFlash}
              disabled={deviceName?.length !== 5}
              className="btn-dialog-primary"
            >
              Flash
            </button>
            <button onClick={handleClose} className="btn-dialog-secondary">
              Cancel
            </button>
          </div>
        </Dialog>
      );

    case "flashing": {
      const progressPercent =
        step.progress !== undefined
          ? Math.round(step.progress * 100)
          : undefined;
      return (
        <Dialog title="Flashing..." titleId="flash-dialog-title">
          {progressPercent !== undefined && (
            <div
              className="flash-progress-track"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Flash progress"
            >
              <div
                className="flash-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
          <p>{step.message}</p>
        </Dialog>
      );
    }

    case "success": {
      const total = step.timings.reduce((s, t) => s + t.durationMs, 0);
      return (
        <Dialog title="Complete" titleId="flash-dialog-title">
          {step.timings.length > 0 && (
            <table className="flash-timings">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th style={{ textAlign: "right" }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {step.timings.map((t, i) => (
                  <tr key={i}>
                    <td>{t.stage}</td>
                    <td className="timing-value">
                      {(t.durationMs / 1000).toFixed(1)}s
                    </td>
                  </tr>
                ))}
                <tr className="timing-total">
                  <td>Total</td>
                  <td className="timing-value">{(total / 1000).toFixed(1)}s</td>
                </tr>
              </tbody>
            </table>
          )}
          <div className="dialog-actions">
            <button onClick={handleClose} className="btn-dialog-primary">
              Done
            </button>
          </div>
        </Dialog>
      );
    }

    case "flash-error":
      return (
        <Dialog
          title="Flash failed"
          titleId="flash-dialog-title"
          titleStyle={{ color: "#dc2626" }}
        >
          <p>{step.children}</p>
          <div className="dialog-actions">
            <button
              onClick={() => setStep({ name: "pair-mode" })}
              className="btn-dialog-primary"
            >
              Try again
            </button>
            <button onClick={handleClose} className="btn-dialog-secondary">
              Close
            </button>
          </div>
        </Dialog>
      );

    default:
      return null;
  }
};

export default FlashOverlay;

import { Step } from "../hooks/use-flashing";
import BluetoothPatternInput from "./BluetoothPatternInput";

interface ContentProps {
  step: Step;
  setStep: (step: Step) => void;
  handleClose: () => void;
  handleFlash: () => void;
  setDeviceName: (name: string) => void;
  deviceName: string | null;
  platform: string;
}

const Content = ({
  step,
  setStep,
  handleClose,
  handleFlash,
  setDeviceName,
  deviceName,
}: ContentProps) => {
  switch (step.name) {
    case "initial":
      return (
        <div
          role="dialog"
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%",
            position: "absolute",
            top: 0,
            left: 0,
            background: "white",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              height: "100%",
              position: "relative",
              padding: "2rem",
              color: "black",
            }}
          >
            <h1 style={{ fontSize: 20 }}>Send to micro:bit</h1>
            <div>
              <p>Do you want to send this program to your micro:bit?</p>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <button
                onClick={() => setStep({ name: "pair-mode" })}
                style={{
                  display: "flex",
                  gap: "10px",
                  width: "100%",
                  justifyContent: "center",
                  backgroundColor: "black",
                  color: "white",
                }}
              >
                Send
              </button>
              <button
                onClick={handleClose}
                style={{
                  display: "flex",
                  gap: "10px",
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    case "pair-mode":
      return (
        <div
          role="dialog"
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%",
            position: "absolute",
            top: 0,
            left: 0,
            background: "white",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              height: "100%",
              position: "relative",
              padding: "2rem",
              color: "black",
            }}
          >
            <h1 style={{ fontSize: 20 }}>Ready to pair</h1>
            <div>
              <p>Press reset on the micro:bit three times.</p>
              <p>
                If your micro:bit has not been updated in a while, hold button A
                and B and press reset.
              </p>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <button
                onClick={() => setStep({ name: "enter-pattern" })}
                style={{
                  display: "flex",
                  gap: "10px",
                  width: "100%",
                  justifyContent: "center",
                  backgroundColor: "black",
                  color: "white",
                }}
              >
                My micro:bit shows a pattern
              </button>
              <button
                onClick={handleClose}
                style={{
                  display: "flex",
                  gap: "10px",
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    case "enter-pattern":
      return (
        <div
          role="dialog"
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%",
            position: "absolute",
            top: 0,
            left: 0,
            background: "white",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              height: "100%",
              position: "relative",
              padding: "2rem",
              color: "black",
            }}
          >
            <h1 style={{ fontSize: 20 }}>Draw your pattern</h1>
            <div>
              <BluetoothPatternInput
                onDeviceNameChange={setDeviceName}
                initialValue={deviceName ?? undefined}
              />
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <button
                onClick={handleFlash}
                disabled={deviceName?.length !== 5}
                style={{
                  display: "flex",
                  gap: "10px",
                  width: "100%",
                  justifyContent: "center",
                  backgroundColor: "black",
                  color: "white",
                  opacity: deviceName?.length !== 5 ? 0.2 : 1,
                }}
              >
                Next
              </button>
              <button
                onClick={handleClose}
                style={{
                  display: "flex",
                  gap: "10px",
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    case "flashing":
      return (
        <div
          role="dialog"
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%",
            position: "absolute",
            top: 0,
            left: 0,
            background: "white",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              height: "100%",
              position: "relative",
              padding: "2rem",
              color: "black",
            }}
          >
            <h1 style={{ fontSize: 20 }}>Downloading</h1>
            <div>
              {step.progress !== undefined && (
                <p>Progress: {Math.round(step.progress * 100)} %</p>
              )}
              <p>{step.message}</p>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <button
                onClick={handleClose}
                disabled={true}
                style={{
                  display: "flex",
                  gap: "10px",
                  width: "100%",
                  justifyContent: "center",
                  backgroundColor: "black",
                  color: "white",
                  opacity: 0.2,
                }}
              >
                Finished
              </button>
            </div>
          </div>
        </div>
      );
    case "success":
      return (
        <div
          role="dialog"
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%",
            position: "absolute",
            top: 0,
            left: 0,
            background: "white",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              height: "100%",
              position: "relative",
              padding: "2rem",
              color: "black",
            }}
          >
            <h1 style={{ fontSize: 20 }}>Completed</h1>
            <div>
              <p>Successfully downloaded</p>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <button
                onClick={handleClose}
                style={{
                  display: "flex",
                  gap: "10px",
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                Finished
              </button>
            </div>
          </div>
        </div>
      );
    case "flash-error":
      return (
        <div
          role="dialog"
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%",
            position: "absolute",
            top: 0,
            left: 0,
            background: "white",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              height: "100%",
              position: "relative",
              padding: "2rem",
              color: "black",
            }}
          >
            <h1 style={{ fontSize: 20 }}>Sending your program failed</h1>
            <div>
              <p>{step.children}</p>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <button
                onClick={() => setStep({ name: "pair-mode" })}
                style={{
                  display: "flex",
                  gap: "10px",
                  width: "100%",
                  justifyContent: "center",
                  backgroundColor: "black",
                  color: "white",
                }}
              >
                Try again
              </button>
              <button
                onClick={handleClose}
                style={{
                  display: "flex",
                  gap: "10px",
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
};

export default Content;

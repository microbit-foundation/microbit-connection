import { useEffect, useRef } from "react";

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 200,
};

const dialogStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: "24px",
  maxWidth: 420,
  width: "90%",
  maxHeight: "80vh",
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

/**
 * Modal dialog with focus trapping, aria-modal, and aria-labelledby.
 */
const Dialog = ({
  title,
  titleId,
  titleStyle,
  children,
}: {
  title: string;
  titleId: string;
  titleStyle?: React.CSSProperties;
  children: React.ReactNode;
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => dialog.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div style={overlayStyle}>
      <div
        ref={dialogRef}
        style={dialogStyle}
        className="flash-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} style={titleStyle}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
};

export default Dialog;

import { useState } from "react";
import { LogContext, useLog, useLogState } from "./hooks/use-log.ts";
import {
  ConnectionContext,
  useConnectionState,
} from "./hooks/use-connection.ts";
import {
  ErrorDialogContext,
  useErrorDialogState,
} from "./hooks/use-error-dialog.ts";
import ConnectionHeader from "./components/ConnectionHeader.tsx";
import LogPanel from "./components/LogPanel.tsx";
import ErrorDialog from "./components/ErrorDialog.tsx";
import FlashTab from "./components/FlashTab.tsx";
import SensorsTab from "./components/SensorsTab.tsx";
import LedsTab from "./components/LedsTab.tsx";
import SerialTab from "./components/SerialTab.tsx";
import UartTab from "./components/UartTab.tsx";
import "./App.css";

type Tab = "flash" | "sensors" | "io" | "serial" | "uart";

const tabDefs: { id: Tab; label: string; availableFor: string[] }[] = [
  { id: "flash", label: "Flash", availableFor: ["usb", "bluetooth"] },
  { id: "sensors", label: "Sensors", availableFor: ["bluetooth", "radio-bridge"] },
  { id: "io", label: "LEDs", availableFor: ["bluetooth"] },
  { id: "serial", label: "Serial", availableFor: ["usb"] },
  { id: "uart", label: "UART", availableFor: ["bluetooth"] },
];

const tabComponents: Record<Tab, React.ComponentType> = {
  flash: FlashTab,
  sensors: SensorsTab,
  io: LedsTab,
  serial: SerialTab,
  uart: UartTab,
};

const AppContent = () => {
  const connState = useConnectionState();
  const [activeTab, setActiveTab] = useState<Tab>("flash");
  const { isOpen } = useLog();

  if (!connState) {
    return <div style={{ padding: 20 }}>Initializing...</div>;
  }

  const visibleTabs = tabDefs.filter((t) =>
    t.availableFor.includes(connState.connection.type),
  );

  // If current tab isn't visible for this connection type, switch to first available
  const currentTab = visibleTabs.find((t) => t.id === activeTab)
    ? activeTab
    : visibleTabs[0]?.id ?? "flash";

  return (
    <ConnectionContext.Provider value={connState}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          width: "100%",
        }}
      >
        <ConnectionHeader />

        <div className="tab-bar" role="tablist" aria-label="Feature tabs">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={currentTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-btn${currentTab === tab.id ? " active" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={`tab-content${isOpen ? " log-open" : ""}`}>
          {visibleTabs.map((tab) => {
            const Component = tabComponents[tab.id];
            const isActive = currentTab === tab.id;
            return (
              <div
                key={tab.id}
                id={`tabpanel-${tab.id}`}
                role="tabpanel"
                aria-labelledby={`tab-${tab.id}`}
                hidden={!isActive}
              >
                <Component />
              </div>
            );
          })}
        </div>

        <LogPanel />
      </div>
    </ConnectionContext.Provider>
  );
};

const App = () => {
  const logState = useLogState();
  const errorDialogState = useErrorDialogState();

  return (
    <LogContext.Provider value={logState}>
      <ErrorDialogContext.Provider value={errorDialogState}>
        <AppContent />
        <ErrorDialog />
      </ErrorDialogContext.Provider>
    </LogContext.Provider>
  );
};

export default App;

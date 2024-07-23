/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import crelt from "crelt";
import { MicrobitWebBluetoothConnection } from "../lib/bluetooth";
import { ButtonEvent } from "../lib/buttons";
import {
  BackgroundErrorEvent,
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceConnection,
  SerialDataEvent,
} from "../lib/device";
import { createUniversalHexFlashDataSource } from "../lib/hex-flash-data-source";
import { MicrobitWebUSBConnection } from "../lib/usb";
import { MicrobitRadioBridgeConnection } from "../lib/usb-radio-bridge";
import "./demo.css";
import {
  AccelerometerData,
  AccelerometerDataEvent,
} from "../lib/accelerometer";

type ConnectionType = "usb" | "bluetooth" | "radio";

const createConnection = (type: "usb" | "bluetooth" | "radio") => {
  switch (type) {
    case "bluetooth":
      return new MicrobitWebBluetoothConnection();
    case "usb":
      return new MicrobitWebUSBConnection();
    case "radio":
      // This only works with the local-sensor hex.
      // To use with a remote micro:bit we need a UI flow that grabs and sets the remote id.
      return new MicrobitRadioBridgeConnection(new MicrobitWebUSBConnection());
  }
};

interface Section {
  dom?: Element;
  cleanup?: () => void;
}
let connection: DeviceConnection = createConnection("usb");
let uiCleanup: Array<() => void> = [];

const recreateUi = async (type: ConnectionType) => {
  uiCleanup.forEach((f) => f());
  uiCleanup.length = 0;
  while (document.body.firstChild) {
    document.body.firstChild.remove();
  }

  await connection.disconnect();
  connection.dispose();
  connection = createConnection(type);
  await connection.initialize();

  [
    createConnectSection(type),
    createFlashSection(),
    createSerialSection(),
    createButtonSection("A", "buttonachanged"),
    createButtonSection("B", "buttonbchanged"),
    createAccelerometerSection(),
  ].forEach(({ dom, cleanup }) => {
    if (dom) {
      document.body.appendChild(dom);
    }
    if (cleanup) {
      uiCleanup.push(cleanup);
    }
  });
};

recreateUi("usb");

const createConnectSection = (type: ConnectionType): Section => {
  const statusParagraph = crelt("p");
  let name = "";
  const dom = crelt(
    "section",
    crelt("h2", "Connect"),
    crelt(
      "label",
      "Connection type",
      crelt(
        "select",
        {
          onchange: (e: Event) => {
            recreateUi((e.currentTarget as HTMLInputElement).value as any);
          },
        },
        crelt("option", { value: "usb", selected: type === "usb" }, "WebUSB"),
        crelt(
          "option",
          { value: "bluetooth", selected: type === "bluetooth" },
          "Web Bluetooth",
        ),
        crelt(
          "option",
          { value: "radio", selected: type === "radio" },
          "WebUSB with serial radio bridge",
        ),
      ),
    ),
    crelt(
      "label",
      "Name",
      crelt("input", {
        type: "text",
        onchange: (e: Event) => {
          name = (e.currentTarget as HTMLInputElement).value;
        },
      }),
    ),
    crelt(
      "button",
      {
        onclick: () => {
          void connection.connect();
        },
      },
      "Connect",
    ),
    crelt(
      "button",
      {
        onclick: () => {
          void connection.disconnect();
        },
      },
      "Disconnect",
    ),
    statusParagraph,
  );

  const displayStatus = (status: ConnectionStatus) => {
    statusParagraph.textContent = status.toString();
  };
  const handleDisplayStatusChange = (event: ConnectionStatusEvent) => {
    displayStatus(event.status);
  };
  const backgroundErrorListener = (event: BackgroundErrorEvent) => {
    console.error("Handled error:", event.errorMessage);
  };
  connection.addEventListener("status", handleDisplayStatusChange);
  connection.addEventListener("backgrounderror", backgroundErrorListener);
  return {
    dom,
    cleanup: () => {
      connection.removeEventListener("status", handleDisplayStatusChange);
      connection.removeEventListener(
        "backgrounderror",
        backgroundErrorListener,
      );
    },
  };
};

const createFlashSection = (): Section => {
  if (!connection.flash) {
    return {};
  }
  const dom = crelt(
    "section",
    crelt("h2", "Flash"),
    crelt(
      "label",
      "File to flash",
      crelt("input", {
        type: "file",
        onchange: async (e: Event) => {
          const file = (e.currentTarget as HTMLInputElement).files?.item(0);
          if (file) {
            const text = await file.text();
            if (connection.flash) {
              await connection.flash(createUniversalHexFlashDataSource(text), {
                partial: true,
                progress: (percentage: number | undefined) => {
                  console.log(percentage);
                },
              });
            }
          }
        },
      }),
    ),
  );
  return { dom };
};

const createSerialSection = (): Section => {
  if (!(connection instanceof MicrobitWebUSBConnection)) {
    return {};
  }

  let data = "";
  const serialDataListener = (event: SerialDataEvent) => {
    for (const char of event.data) {
      if (char === "\n") {
        console.log(data);
        data = "";
      } else {
        data += char;
      }
    }
  };

  const dom = crelt(
    "section",
    crelt("h2", "Serial"),
    crelt(
      "button",
      {
        onclick: () => {
          connection.addEventListener("serialdata", serialDataListener);
        },
      },
      "Listen to serial",
    ),
    crelt(
      "button",
      {
        onclick: () => {
          connection.removeEventListener("serialdata", serialDataListener);
        },
      },
      "Stop listening to serial",
    ),
  );

  return {
    dom,
    cleanup: () => {
      connection.removeEventListener("serialdata", serialDataListener);
    },
  };
};

const createAccelerometerSection = (): Section => {
  if (
    !(
      connection instanceof MicrobitRadioBridgeConnection ||
      connection instanceof MicrobitWebBluetoothConnection
    )
  ) {
    return {};
  }
  const accelerometerConnection = connection;
  const bluetoothConnection =
    connection instanceof MicrobitWebBluetoothConnection
      ? connection
      : undefined;
  const statusParagraph = crelt("p");
  const listener = (e: AccelerometerDataEvent) => {
    statusParagraph.innerText = JSON.stringify(e.data);
  };
  let period = "";
  const periodInput = crelt("input", {
    type: "number",
    onchange: (e: Event) => {
      period = (e.currentTarget as HTMLInputElement).value;
    },
  }) as HTMLInputElement;
  const dom = crelt(
    "section",
    crelt("h2", "Accelerometer"),
    crelt("h3", "Events"),
    crelt(
      "button",
      {
        onclick: () => {
          accelerometerConnection.addEventListener(
            "accelerometerdatachanged",
            listener,
          );
        },
      },
      "Listen",
    ),
    crelt(
      "button",
      {
        onclick: () => {
          accelerometerConnection.removeEventListener(
            "accelerometerdatachanged",
            listener,
          );
        },
      },
      "Stop listening",
    ),
    statusParagraph,
    bluetoothConnection
      ? [
          crelt("h3", "Period"),
          crelt("label", "Value", periodInput),
          crelt(
            "button",
            {
              onclick: async () => {
                period =
                  (
                    await bluetoothConnection.getAccelerometerPeriod()
                  )?.toString() ?? "";
                periodInput.value = period;
              },
            },
            "Get period",
          ),
          crelt(
            "button",
            {
              onclick: async () => {
                await bluetoothConnection.setAccelerometerPeriod(
                  parseInt(period, 10),
                );
              },
            },
            "Set period",
          ),
        ]
      : [],
  );
  return {
    dom,
    cleanup: () => {
      accelerometerConnection.removeEventListener(
        "accelerometerdatachanged",
        listener,
      );
    },
  };
};

const createButtonSection = (
  label: string,
  type: "buttonachanged" | "buttonbchanged",
): Section => {
  if (
    !(
      connection instanceof MicrobitRadioBridgeConnection ||
      connection instanceof MicrobitWebBluetoothConnection
    )
  ) {
    return {};
  }
  const buttonConnection = connection;
  const statusParagraph = crelt("p");
  const buttonStateListener = (e: ButtonEvent) => {
    statusParagraph.innerText = e.state.toString();
  };
  const dom = crelt(
    "section",
    crelt("h2", "Button " + label),
    crelt(
      "button",
      {
        onclick: () => {
          buttonConnection.addEventListener(type, buttonStateListener);
        },
      },
      "Listen",
    ),
    crelt(
      "button",
      {
        onclick: () => {
          buttonConnection.removeEventListener(type, buttonStateListener);
        },
      },
      "Stop listening",
    ),
    statusParagraph,
  );
  return {
    dom,
    cleanup: () => {
      buttonConnection.removeEventListener(type, buttonStateListener);
    },
  };
};

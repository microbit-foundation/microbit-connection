/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import crelt from "crelt";
import { AccelerometerDataEvent } from "../lib/accelerometer";
import {
  createWebBluetoothConnection,
  MicrobitWebBluetoothConnection,
} from "../lib/bluetooth";
import { ButtonEvent } from "../lib/buttons";
import {
  BackgroundErrorEvent,
  ConnectionStatus,
  ConnectionStatusEvent,
} from "../lib/device";
import { createUniversalHexFlashDataSource } from "../lib/hex-flash-data-source";
import { MagnetometerDataEvent } from "../lib/magnetometer";
import { SerialDataEvent } from "../lib/serial-events";
import { UARTDataEvent } from "../lib/uart";
import {
  createWebUSBConnection,
  DeviceFallbackMode,
  MicrobitWebUSBConnection,
} from "../lib/usb";
import {
  createRadioBridgeConnection,
  MicrobitRadioBridgeConnection,
} from "../lib/usb-radio-bridge";
import "./demo.css";

type ConnectionType = "usb" | "bluetooth" | "radio";

type TypedConnection =
  | { type: "radio"; connection: MicrobitRadioBridgeConnection }
  | { type: "bluetooth"; connection: MicrobitWebBluetoothConnection }
  | { type: "usb"; connection: MicrobitWebUSBConnection };

const createConnections = (
  type: "usb" | "bluetooth" | "radio",
): TypedConnection => {
  switch (type) {
    case "bluetooth":
      return { type, connection: createWebBluetoothConnection() };
    case "usb":
      return {
        type,
        connection: createWebUSBConnection({
          deviceConnectMode: DeviceFallbackMode.AllowedOrSelect,
        }),
      };
    case "radio":
      // This only works with the local-sensor hex.
      // To use with a remote micro:bit we need a UI flow that grabs and sets the remote id.
      const connection = createRadioBridgeConnection(
        createWebUSBConnection({
          deviceConnectMode: DeviceFallbackMode.AllowedOrSelect,
        }),
      );
      connection.setRemoteDeviceId(0);
      return { type, connection };
  }
};

interface Section {
  dom?: Element;
  cleanup?: () => void;
}
let typedConnection = createConnections("usb");
let uiCleanup: Array<() => void> = [];

const recreateUi = async (type: ConnectionType) => {
  uiCleanup.forEach((f) => f());
  uiCleanup.length = 0;
  while (document.body.firstChild) {
    document.body.firstChild.remove();
  }

  await typedConnection.connection.disconnect();
  typedConnection.connection.dispose();
  typedConnection = createConnections(type);
  await typedConnection.connection.initialize();

  [
    createConnectSection(),
    createFlashSection(),
    createSerialSection(),
    createUARTSection(),
    createButtonSection("A", "buttonachanged"),
    createButtonSection("B", "buttonbchanged"),
    createAccelerometerSection(),
    createMagnetometerSection(),
    createLedSection(),
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

const createConnectSection = (): Section => {
  const { type, connection } = typedConnection;
  const statusParagraph = crelt("p");
  let name = "";
  let exclusionFilters = JSON.stringify([{ serialNumber: "XXXX" }]);
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
    type === "usb"
      ? crelt(
          "label",
          "Exclusion filters",
          crelt("input", {
            type: "text",
            value: exclusionFilters,
            onchange: (e: Event) => {
              exclusionFilters = (e.currentTarget as HTMLInputElement).value;
            },
          }),
        )
      : undefined,
    crelt(
      "button",
      {
        onclick: () => {
          if (type === "usb") {
            let parsedExclusionFilters;
            try {
              if (exclusionFilters) {
                parsedExclusionFilters = JSON.parse(exclusionFilters);
              }
            } catch (err) {
              console.error("Invalid exclusion filters");
            }
            connection.setRequestDeviceExclusionFilters(parsedExclusionFilters);
          } else if (type === "bluetooth") {
            connection.setNameFilter(name);
          }
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
  (connection as any).addEventListener("status", handleDisplayStatusChange);
  (connection as any).addEventListener(
    "backgrounderror",
    backgroundErrorListener,
  );
  return {
    dom,
    cleanup: () => {
      (connection as any).removeEventListener(
        "status",
        handleDisplayStatusChange,
      );
      (connection as any).removeEventListener(
        "backgrounderror",
        backgroundErrorListener,
      );
    },
  };
};

const createFlashSection = (): Section => {
  const { type, connection } = typedConnection;
  if (type !== "usb") {
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
            console.time("flash");
            await connection.flash(createUniversalHexFlashDataSource(text), {
              partial: true,
              progress: (percentage: number | undefined) => {
                console.log(percentage);
              },
            });
            console.timeEnd("flash");
          }
        },
      }),
    ),
  );
  return { dom };
};

const createSerialSection = (): Section => {
  const { type, connection: serialConnection } = typedConnection;
  if (type !== "usb") {
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
          serialConnection.addEventListener("serialdata", serialDataListener);
        },
      },
      "Listen to serial",
    ),
    crelt(
      "button",
      {
        onclick: () => {
          serialConnection.removeEventListener(
            "serialdata",
            serialDataListener,
          );
        },
      },
      "Stop listening to serial",
    ),
  );

  return {
    dom,
    cleanup: () => {
      serialConnection.removeEventListener("serialdata", serialDataListener);
    },
  };
};

const createUARTSection = (): Section => {
  const { type, connection } = typedConnection;
  if (type !== "bluetooth") {
    return {};
  }

  const uartDataListener = (event: UARTDataEvent) => {
    const value = new TextDecoder().decode(event.value);
    console.log(value);
  };

  const bluetoothConnection = type === "bluetooth" ? connection : undefined;

  let dataToWrite = "";
  const dataToWriteFieldId = "dataToWrite";
  const dom = crelt(
    "section",
    crelt("h2", "UART"),
    crelt("h3", "Receive"),
    crelt(
      "button",
      {
        onclick: () => {
          bluetoothConnection?.addEventListener("uartdata", uartDataListener);
        },
      },
      "Listen to UART",
    ),
    crelt(
      "button",
      {
        onclick: () => {
          bluetoothConnection?.removeEventListener(
            "uartdata",
            uartDataListener,
          );
        },
      },
      "Stop listening to UART",
    ),
    crelt("h3", "Write"),
    crelt("label", { name: "Data", for: dataToWriteFieldId }),
    crelt("textarea", {
      id: dataToWriteFieldId,
      type: "text",
      onchange: (e: Event) => {
        dataToWrite = (e.currentTarget as HTMLInputElement).value;
      },
    }),
    crelt(
      "div",
      crelt(
        "button",
        {
          onclick: async () => {
            const encoded = new TextEncoder().encode(dataToWrite);
            await bluetoothConnection?.uartWrite(encoded);
          },
        },
        "Write to micro:bit",
      ),
    ),
  );

  return {
    dom,
    cleanup: () => {
      connection.removeEventListener("uartdata", uartDataListener);
    },
  };
};

const createAccelerometerSection = (): Section => {
  const { type, connection: accelerometerConnection } = typedConnection;
  if (type !== "bluetooth" && type !== "radio") {
    return {};
  }
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
    type === "bluetooth"
      ? [
          crelt("h3", "Period"),
          crelt("label", "Value", periodInput),
          crelt(
            "button",
            {
              onclick: async () => {
                period =
                  (
                    await accelerometerConnection.getAccelerometerPeriod()
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
                await accelerometerConnection.setAccelerometerPeriod(
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

const createMagnetometerSection = (): Section => {
  const { type, connection: magnetometerConnection } = typedConnection;
  if (type !== "bluetooth" && type !== "radio") {
    return {};
  }
  const statusParagraph = crelt("p");
  const listener = (e: MagnetometerDataEvent) => {
    statusParagraph.innerText = JSON.stringify(e.data);
  };
  let period = "";
  const periodInput = crelt("input", {
    type: "number",
    onchange: (e: Event) => {
      period = (e.currentTarget as HTMLInputElement).value;
    },
  }) as HTMLInputElement;
  const bearingParagraph = crelt("p");
  const dom = crelt(
    "section",
    crelt("h2", "Magnetometer"),
    crelt("h3", "Events"),
    crelt(
      "button",
      {
        onclick: () => {
          magnetometerConnection.addEventListener(
            "magnetometerdatachanged",
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
          magnetometerConnection.removeEventListener(
            "magnetometerdatachanged",
            listener,
          );
        },
      },
      "Stop listening",
    ),
    statusParagraph,
    type === "bluetooth"
      ? [
          crelt("h3", "Period"),
          crelt("label", "Value", periodInput),
          crelt(
            "button",
            {
              onclick: async () => {
                period =
                  (
                    await magnetometerConnection.getMagnetometerPeriod()
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
                await magnetometerConnection.setMagnetometerPeriod(
                  parseInt(period, 10),
                );
              },
            },
            "Set period",
          ),
        ]
      : [],
    bearingParagraph,
    type === "bluetooth"
      ? [
          crelt(
            "button",
            {
              onclick: async () => {
                void magnetometerConnection.triggerMagnetometerCalibration();
              },
            },
            "Trigger calibration",
          ),
          crelt(
            "button",
            {
              onclick: async () => {
                const bearing =
                  await magnetometerConnection.getMagnetometerBearing();
                bearingParagraph.textContent = `Bearing: ${bearing ?? 0} degrees`;
              },
            },
            "Get bearing",
          ),
        ]
      : [],
  );
  return {
    dom,
    cleanup: () => {
      magnetometerConnection.removeEventListener(
        "magnetometerdatachanged",
        listener,
      );
    },
  };
};

const createButtonSection = (
  label: string,
  type: "buttonachanged" | "buttonbchanged",
): Section => {
  const { type: connType, connection: buttonConnection } = typedConnection;
  if (connType !== "bluetooth" && connType !== "radio") {
    return {};
  }
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

const createLedSection = (): Section => {
  const { type: connType, connection: ledConnection } = typedConnection;
  if (connType !== "bluetooth") {
    return {};
  }

  const delayInput = crelt("input") as HTMLInputElement;
  const textInput = crelt("input") as HTMLInputElement;
  const matrixInput = crelt("textarea") as HTMLTextAreaElement;
  const dom = crelt("section", crelt("h2", "LED"), [
    crelt("h3", "Matrix"),
    crelt("h3", "Text"),
    crelt("label", "Text", textInput),
    crelt(
      "button",
      {
        onclick: async () => {
          await ledConnection.setLedText(textInput.value);
        },
      },
      "Set text",
    ),
    crelt("h3", "Scrolling delay"),
    crelt("label", "Scrolling delay", delayInput),
    crelt(
      "button",
      {
        onclick: async () => {
          const value = await ledConnection.getLedScrollingDelay();
          if (value) {
            delayInput.value = value.toString();
          }
        },
      },
      "Get scrolling delay",
    ),
    crelt(
      "button",
      {
        onclick: async () => {
          await ledConnection.setLedScrollingDelay(parseInt(delayInput.value));
        },
      },
      "Set scrolling delay",
    ),
    crelt("h3", "Matrix"),
    crelt("label", "Matrix as JSON", matrixInput),
    crelt(
      "button",
      {
        onclick: async () => {
          const matrix = await ledConnection.getLedMatrix();
          matrixInput.value = JSON.stringify(matrix, null, 2);
        },
      },
      "Get matrix",
    ),
    crelt(
      "button",
      {
        onclick: async () => {
          const matrix = JSON.parse(matrixInput.value);
          await ledConnection.setLedMatrix(matrix);
        },
      },
      "Set matrix",
    ),
  ]);

  return {
    dom,
    cleanup: () => {},
  };
};

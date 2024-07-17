/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import "./demo.css";
import { MicrobitWebUSBConnection } from "../lib/usb";
import { HexFlashDataSource } from "../lib/hex-flash-data-source";
import {
  BackgroundErrorEvent,
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceConnection,
  SerialDataEvent,
} from "../lib/device";
import { MicrobitWebBluetoothConnection } from "../lib/bluetooth";
import { AccelerometerDataEvent } from "../lib/accelerometer";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <section id="flash">
    <h2>Connect and flash</h2>
    <label><div>Name</div>
      <input id="name" type="text">
    </label>
    <select class="transport">
      <option value="usb">WebUSB</option>
      <option value="bluetooth">Web Bluetooth</option>
    </select>
    <button class="connect">Connect</button>
    <button class="disconnect">Disconnect</button>
    <p class="status"></p>
    <label><div>File to flash</div><input type="file"/></label>
    <button class="flash">Flash</button>
    <div class="serial-controls">
      <button class="serial-listen">Listen to serial</button>
      <button class="serial-stop">Stop serial data</button>
    </div>
    <div class="acc-data-controls">
      <button class="acc-data-get">Get accelerometer data</button>
      <button class="acc-data-listen">Listen to accelerometer data</button>
      <button class="acc-data-stop">Stop accelerometer data</button>
    </div>
    <div class="acc-period-controls">
      <button class="acc-period-get">Get accelerometer period</button>
      <label style="display: inline;">Set period
        <input class="acc-period-input" type="number">
      </label>
      <button class="acc-period-set">Set accelerometer period</button>
      <div>
  </section>
`;

const transport = document.querySelector(
  "#flash > .transport",
)! as HTMLSelectElement;
const connect = document.querySelector("#flash > .connect")!;
const disconnect = document.querySelector("#flash > .disconnect")!;
const flash = document.querySelector("#flash > .flash")!;
const fileInput = document.querySelector(
  "#flash input[type=file]",
)! as HTMLInputElement;
const statusParagraph = document.querySelector("#flash > .status")!;
const accDataGet = document.querySelector(
  "#flash > .acc-data-controls > .acc-data-get",
)!;
const accDataListen = document.querySelector(
  "#flash >  .acc-data-controls >  .acc-data-listen",
)!;
const accDataStop = document.querySelector(
  "#flash >  .acc-data-controls > .acc-data-stop",
)!;
const accPeriodGet = document.querySelector(
  "#flash > .acc-period-controls > .acc-period-get",
)!;
const accPeriodInput = document.querySelector(
  "#flash > .acc-period-controls .acc-period-input",
)! as HTMLInputElement;
const accPeriodSet = document.querySelector(
  "#flash > .acc-period-controls > .acc-period-set",
)!;
const serialListen = document.querySelector(
  "#flash >  .serial-controls >  .serial-listen",
)!;
const serialStop = document.querySelector(
  "#flash >  .serial-controls > .serial-stop",
)!;

const displayStatus = (status: ConnectionStatus) => {
  statusParagraph.textContent = status.toString();
};
const handleDisplayStatusChange = (event: ConnectionStatusEvent) => {
  displayStatus(event.status);
};
const backgroundErrorListener = (event: BackgroundErrorEvent) => {
  console.error("Handled error:", event.errorMessage);
};

const initConnectionListeners = () => {
  displayStatus(connection.status);
  connection.addEventListener("status", handleDisplayStatusChange);
  connection.addEventListener("backgrounderror", backgroundErrorListener);
};

let connection: DeviceConnection = new MicrobitWebUSBConnection();

initConnectionListeners();

const switchTransport = async () => {
  await connection.disconnect();
  connection.dispose();
  connection.removeEventListener("status", handleDisplayStatusChange);
  connection.removeEventListener("backgrounderror", backgroundErrorListener);

  switch (transport.value) {
    case "bluetooth": {
      connection = new MicrobitWebBluetoothConnection();
      initConnectionListeners();
      break;
    }
    case "usb": {
      connection = new MicrobitWebUSBConnection();
      initConnectionListeners();
      break;
    }
  }
  await connection.initialize();
};
transport.addEventListener("change", switchTransport);

connect.addEventListener("click", async () => {
  await connection.connect();
});
disconnect.addEventListener("click", async () => {
  await connection.disconnect();
});

flash.addEventListener("click", async () => {
  const file = fileInput.files?.item(0);
  if (file) {
    const text = await file.text();
    if (connection.flash) {
      await connection.flash(new HexFlashDataSource(text), {
        partial: true,
        progress: (percentage: number | undefined) => {
          console.log(percentage);
        },
      });
    }
  }
});

const accChangedListener = (event: AccelerometerDataEvent) => {
  console.log(event.data);
};

accDataListen.addEventListener("click", async () => {
  if (connection instanceof MicrobitWebBluetoothConnection) {
    connection?.addEventListener(
      "accelerometerdatachanged",
      accChangedListener,
    );
  } else {
    throw new Error(
      "`getAccelerometerData` is not supported on `MicrobitWebUSBConnection`",
    );
  }
});

accDataStop.addEventListener("click", async () => {
  if (connection instanceof MicrobitWebBluetoothConnection) {
    connection?.removeEventListener(
      "accelerometerdatachanged",
      accChangedListener,
    );
  } else {
    throw new Error(
      "`getAccelerometerData` is not supported on `MicrobitWebUSBConnection`",
    );
  }
});

accDataGet.addEventListener("click", async () => {
  if (connection instanceof MicrobitWebBluetoothConnection) {
    try {
      const data = await connection.getAccelerometerData();
      console.log("Get accelerometer data", data);
    } catch (err) {
      console.error("Handled error:", err);
    }
  } else {
    throw new Error(
      "`getAccelerometerData` is not supported on `MicrobitWebUSBConnection`",
    );
  }
});

accPeriodGet.addEventListener("click", async () => {
  if (connection instanceof MicrobitWebBluetoothConnection) {
    try {
      const period = await connection.getAccelerometerPeriod();
      console.log("Get accelerometer period", period);
    } catch (err) {
      console.error("Handled error:", err);
    }
  } else {
    throw new Error(
      "`getAccelerometerData` is not supported on `MicrobitWebUSBConnection`",
    );
  }
});

accPeriodSet.addEventListener("click", async () => {
  if (connection instanceof MicrobitWebBluetoothConnection) {
    try {
      const period = parseInt(accPeriodInput.value);
      await connection.setAccelerometerPeriod(period);
    } catch (err) {
      console.error("Handled error:", err);
    }
  } else {
    throw new Error(
      "`getAccelerometerData` is not supported on `MicrobitWebUSBConnection`",
    );
  }
});

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

serialListen.addEventListener("click", async () => {
  connection.addEventListener("serialdata", serialDataListener);
});

serialStop.addEventListener("click", async () => {
  connection.removeEventListener("serialdata", serialDataListener);
});

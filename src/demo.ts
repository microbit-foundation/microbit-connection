/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import "./demo.css";
import { MicrobitWebUSBConnection } from "../lib/usb";
import { HexFlashDataSource } from "../lib/hex-flash-data-source";
import {
  ConnectionStatus,
  ConnectionStatusEvent,
  DeviceConnection,
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

const displayStatus = (status: ConnectionStatus) => {
  statusParagraph.textContent = status.toString();
};
const handleDisplayStatusChange = (event: ConnectionStatusEvent) => {
  displayStatus(event.status);
};
const initConnectionStatusDisplay = () => {
  displayStatus(connection.status);
  connection.addEventListener("status", handleDisplayStatusChange);
};

let connection: DeviceConnection = new MicrobitWebUSBConnection();

initConnectionStatusDisplay();

const switchTransport = async () => {
  await connection.disconnect();
  connection.dispose();
  connection.removeEventListener("status", handleDisplayStatusChange);

  switch (transport.value) {
    case "bluetooth": {
      connection = new MicrobitWebBluetoothConnection();
      initConnectionStatusDisplay();
      break;
    }
    case "usb": {
      connection = new MicrobitWebUSBConnection();
      initConnectionStatusDisplay();
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
    await connection.flash(new HexFlashDataSource(text), {
      partial: true,
      progress: (percentage: number | undefined) => {
        console.log(percentage);
      },
    });
  }
});

accDataGet.addEventListener("click", async () => {
  if (connection instanceof MicrobitWebBluetoothConnection) {
    const data = await connection.getAccelerometerData();
    console.log("Get accelerometer data", data);
  } else {
    throw new Error(
      "`getAccelerometerData` is not supported on `MicrobitWebUSBConnection`",
    );
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

accPeriodGet.addEventListener("click", async () => {
  if (connection instanceof MicrobitWebBluetoothConnection) {
    const period = await connection.getAccelerometerPeriod();
    console.log("Get accelerometer period", period);
  } else {
    throw new Error(
      "`getAccelerometerData` is not supported on `MicrobitWebUSBConnection`",
    );
  }
});

accPeriodSet.addEventListener("click", async () => {
  if (connection instanceof MicrobitWebBluetoothConnection) {
    const period = parseInt(accPeriodInput.value);
    await connection.setAccelerometerPeriod(period);
  } else {
    throw new Error(
      "`getAccelerometerData` is not supported on `MicrobitWebUSBConnection`",
    );
  }
});

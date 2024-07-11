/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import "./demo.css";
import { MicrobitWebUSBConnection } from "../lib/webusb";
import { HexFlashDataSource } from "../lib/hex-flash-data-source";
import { ConnectionStatus, DeviceConnection } from "../lib/device";
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
    <div class="acc-controls">
      <button class="acc-data-get">Get accelerometer data</button>
      <button class="acc-data-listen">Listen to accelerometer data</button>
      <button class="acc-data-stop">Stop accelerometer data</button>
    </div>
  </section>
`;

const transport = document.querySelector(
  "#flash > .transport"
)! as HTMLSelectElement;
const connect = document.querySelector("#flash > .connect")!;
const disconnect = document.querySelector("#flash > .disconnect")!;
const flash = document.querySelector("#flash > .flash")!;
const fileInput = document.querySelector(
  "#flash input[type=file]"
)! as HTMLInputElement;
const statusParagraph = document.querySelector("#flash > .status")!;
const accDataGet = document.querySelector(
  "#flash > .acc-controls > .acc-data-get"
)!;
const accDataListen = document.querySelector(
  "#flash >  .acc-controls >  .acc-data-listen"
)!;
const accDataStop = document.querySelector(
  "#flash >  .acc-controls > .acc-data-stop"
)!;

let connection: DeviceConnection = new MicrobitWebUSBConnection();
const displayStatus = (status: ConnectionStatus) => {
  statusParagraph.textContent = status.toString();
};
const switchTransport = async () => {
  await connection.disconnect();
  connection.dispose();

  switch (transport.value) {
    case "bluetooth": {
      connection = new MicrobitWebBluetoothConnection();
      break;
    }
    case "usb": {
      connection = new MicrobitWebUSBConnection();
      break;
    }
  }
  await connection.initialize();
};
transport.addEventListener("change", switchTransport);
void switchTransport();

connection.addEventListener("status", (event) => {
  displayStatus(event.status);
});
displayStatus(connection.status);

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
  const acc = await connection.getAccelerometer();
  const data = await acc?.getData();
  console.log("Get accelerometer data", data);
});

const accChangedListener = (event: AccelerometerDataEvent) => {
  console.log(event.data);
};

accDataListen.addEventListener("click", async () => {
  const acc = await connection.getAccelerometer();
  console.log("Stream accelerometer data");
  acc?.addEventListener("accelerometerdatachanged", accChangedListener);
  acc?.startNotifications();
});

accDataStop.addEventListener("click", async () => {
  const acc = await connection.getAccelerometer();
  acc?.removeEventListener("accelerometerdatachanged", accChangedListener);
  acc?.stopNotifications();
});

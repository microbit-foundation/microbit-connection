/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import "./demo.css";
import { MicrobitWebUSBConnection } from "../lib/webusb";
import { HexFlashDataSource } from "../lib/hex-flash-data-source";
import { ConnectionStatus } from "../lib/device";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <section id="webusb">
    <h2>WebUSB</h2>
    <button class="connect">Connect</button>
    <button class="disconnect">Disconnect</button>
    <p class="status"></p>
    <label><div>File to flash</div><input type="file"/></label>
    <button class="flash">Flash</button>
  </section>
`;

const connect = document.querySelector("#webusb > .connect")!;
const disconnect = document.querySelector("#webusb > .disconnect")!;
const flash = document.querySelector("#webusb > .flash")!;
const fileInput = document.querySelector(
  "#webusb input[type=file]",
)! as HTMLInputElement;
const statusParagraph = document.querySelector("#webusb > .status")!;
const connection = new MicrobitWebUSBConnection();
const initialisePromise = connection.initialize();
const displayStatus = (status: ConnectionStatus) => {
  statusParagraph.textContent = status.toString();
};
connection.addEventListener("status", (event) => {
  displayStatus(event.status);
});
displayStatus(connection.status);

connect.addEventListener("click", async () => {
  await initialisePromise;
  await connection.connect();
});
disconnect.addEventListener("click", async () => {
  await initialisePromise;
  await connection.disconnect();
});

flash.addEventListener("click", async () => {
  const file = fileInput.files?.item(0);
  if (file) {
    const text = await file.text();
    await connection.flash(new HexFlashDataSource(text), {
      partial: false,
      progress: (percentage: number | undefined) => {
        console.log(percentage);
      },
    });
  }
});

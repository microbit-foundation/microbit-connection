/**
 * (c) 2024, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import "./demo.css";
import { MicrobitWebUSBConnection } from "../lib/webusb";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <section id="webusb">
    <h2>WebUSB</h2>
    <button class="connect">Connect</button>
    <label><div>File to flash</div><input type="file"/></label>
    <button class="flash">Flash</button>
  </section>
`;

const connect = document.querySelector("#webusb > .connect")!;
const flash = document.querySelector("#webusb > .flash")!;
const connection = new MicrobitWebUSBConnection();
connection.addEventListener("status", (event) => {
  console.log(event.status);
});

connect.addEventListener("click", async () => {
  await connection.initialize();
  await connection.connect();
});

flash.addEventListener("click", async () => {});

/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */

/**
 * CDC pipeline saturation
 *
 * DAPLink's CDC serial path and WebUSB vendor serial reads share the same
 * UART ring buffer. After a physical USB connection, CDC consumes early
 * serial bytes before our vendor reads can get them, causing truncated
 * output. See: https://github.com/ARMmbed/DAPLink/issues/903
 *
 * Workaround: before flashing, push dummy data through the target's UART
 * to fill DAPLink's internal buffers. When nobody is reading from the CDC
 * serial port, the CDC TX buffer fills first, then cdc_process_event()
 * stops pulling from the UART RX ring buffer, and that fills too. Once
 * both are full, all subsequent UART data overflows harmlessly and
 * post-flash serial output is left for our vendor reads.
 *
 * V1 (nRF51) uses a Thumb blob for the legacy byte-at-a-time UART.
 * V2 (nRF52833) uses SWD register writes to trigger a UARTE DMA transfer.
 *
 * V1 DAPLink defaults to 9600 baud on fresh USB connection, so we call
 * setBaudrate(115200) before saturation to ensure DAPLink can decode the
 * bytes we send.
 */

import { BoardVersion } from "../device.js";
import { Logging } from "../logging.js";
import { CoreRegister } from "./cortex-m.js";
import { type USBDeviceWrapper } from "./device-wrapper.js";

const CDC_SAT_LOAD_ADDR = 0x20000000;
// DAPLink's UART RX ring buffer + CDC TX buffer must both fill before CDC
// stops consuming. Buffer sizes vary by interface chip:
//   KL26/KL27:        64 + 64 = 128 bytes
//   nRF52820/nRF52833: 1024 + 64 = 1088 bytes
// 2048 covers all known variants with headroom (~178ms at 115200 baud).
const CDC_SAT_BYTE_COUNT = 2048;

// nRF51 legacy UART registers (base 0x40002000)
const NRF51_UART_TASKS_STARTTX = 0x40002008;
const NRF51_UART_TASKS_STOPTX = 0x4000200c;
const NRF51_UART_EVENTS_TXDRDY = 0x4000211c;
const NRF51_UART_ENABLE = 0x40002500;
const NRF51_UART_PSEL_TXD = 0x4000250c;
const NRF51_UART_BAUDRATE = 0x40002524;
const NRF51_UART_TXD = 0x4000251c;

// nRF52833 UARTE registers (base 0x40002000)
const NRF52_UARTE_TASKS_STARTTX = 0x40002008;
const NRF52_UARTE_TASKS_STOPTX = 0x4000210c;
const NRF52_UARTE_EVENTS_ENDTX = 0x40002120;
const NRF52_UARTE_EVENTS_TXSTOPPED = 0x40002158;
const NRF52_UARTE_ENABLE = 0x40002500;
const NRF52_UARTE_PSEL_TXD = 0x4000250c;
const NRF52_UARTE_BAUDRATE = 0x40002524;
const NRF52_UARTE_TXD_PTR = 0x40002544;
const NRF52_UARTE_TXD_MAXCNT = 0x40002548;

// UART baud rate register value for 115200 (same encoding on nRF51 and nRF52)
const NRF_BAUDRATE_115200 = 0x01d7e000;

// micro:bit UART TX pins (target → interface chip)
const MICROBIT_V1_TX_PIN = 24; // P0.24
const MICROBIT_V2_TX_PIN = 6; // P0.06

/**
 * Push dummy data through the target's UART to fill DAPLink's internal
 * CDC buffers, preventing CDC from consuming post-flash serial output.
 * Must be called while the target is halted.
 */
export async function saturateCdcPipeline(
  device: USBDeviceWrapper,
  boardVersion: BoardVersion,
  logging: Logging,
): Promise<void> {
  try {
    if (boardVersion === "V1") {
      await saturateCdcV1(device, logging);
    } else {
      await saturateCdcV2(device, logging);
    }
  } catch (e) {
    logging.log(
      `CDC saturation failed (non-fatal): ${e instanceof Error ? e.message : e}`,
    );
  }
}

/**
 * V1 (nRF51): Run a Thumb blob that sends CDC_SAT_BYTE_COUNT bytes at
 * wire speed through the legacy UART. The CPU is resumed with PRIMASK=1
 * to prevent the halted program's ISRs from interfering.
 *
 * Blob register convention (values passed via writeCoreRegister):
 *   r0 = byte count, r1 = TXD addr, r2 = TXDRDY addr,
 *   r3 = data byte, r4 = 0 (for clearing events)
 *
 * Thumb instructions (word 0 is a BKPT pair used as the LR target):
 *   loop: str r4, [r2]      // clear TXDRDY
 *         str r3, [r1]      // write TXD
 *   wait: ldr r5, [r2]      // read TXDRDY
 *         cmp r5, #0
 *         beq wait
 *         subs r0, #1
 *         bne loop
 *         bkpt #0
 */
async function saturateCdcV1(
  device: USBDeviceWrapper,
  logging: Logging,
): Promise<void> {
  const { adi, cortexM } = device;

  // Stop any in-flight TX and fully reconfigure the UART from scratch.
  // The previous program (e.g. MakeCode) may not have set up the UART at
  // all, so we can't assume any registers are configured.
  await adi.writeMem32(NRF51_UART_TASKS_STOPTX, 1);
  await adi.writeMem32(NRF51_UART_ENABLE, 0);
  await adi.writeMem32(NRF51_UART_PSEL_TXD, MICROBIT_V1_TX_PIN);
  await adi.writeMem32(NRF51_UART_BAUDRATE, NRF_BAUDRATE_115200);
  await adi.writeMem32(NRF51_UART_ENABLE, 4); // UART enable
  await adi.writeMem32(NRF51_UART_EVENTS_TXDRDY, 0);
  await adi.writeMem32(NRF51_UART_TASKS_STARTTX, 1);

  const blob = new Uint32Array([
    0xbe00be00, // BKPT (LR target) + pad
    0x600b6014, // str r4,[r2]; str r3,[r1]
    0x2d006815, // ldr r5,[r2]; cmp r5,#0
    0x3801d0fc, // beq wait; subs r0,#1
    0xbe00d1f8, // bne loop; bkpt
  ]);

  await adi.writeBlock(CDC_SAT_LOAD_ADDR, blob);
  await cortexM.writeCoreRegister(CoreRegister.PC, (CDC_SAT_LOAD_ADDR + 4) | 1);
  await cortexM.writeCoreRegister(CoreRegister.LR, CDC_SAT_LOAD_ADDR | 1);
  await cortexM.writeCoreRegister(CoreRegister.SP, 0x20004000);
  await cortexM.writeCoreRegister(CoreRegister.PSR, 0x01000000);
  await cortexM.writeCoreRegister(0, CDC_SAT_BYTE_COUNT);
  await cortexM.writeCoreRegister(1, NRF51_UART_TXD);
  await cortexM.writeCoreRegister(2, NRF51_UART_EVENTS_TXDRDY);
  await cortexM.writeCoreRegister(3, 0x00); // NUL byte (ignored by terminals)
  await cortexM.writeCoreRegister(4, 0);
  await cortexM.writeCoreRegister(20, 1); // PRIMASK = 1

  await cortexM.resume(false);

  // Wait for blob to hit its final BKPT (~178ms for 2048 bytes at 115200).
  for (let i = 0; i < 2000; i++) {
    if (await cortexM.isHalted()) return;
  }
  logging.log("V1 CDC saturation blob did not complete, halting");
  await cortexM.halt();
}

/**
 * V2 (nRF52833): Set up a UARTE DMA transfer via SWD register writes.
 * The DMA engine runs independently of the halted CPU.
 */
async function saturateCdcV2(
  device: USBDeviceWrapper,
  logging: Logging,
): Promise<void> {
  const { adi } = device;

  // Stop any in-flight transfer cleanly
  await adi.writeMem32(NRF52_UARTE_EVENTS_TXSTOPPED, 0);
  await adi.writeMem32(NRF52_UARTE_TASKS_STOPTX, 1);
  for (let i = 0; i < 100; i++) {
    if (await adi.readMem32(NRF52_UARTE_EVENTS_TXSTOPPED)) break;
  }

  // Fully reconfigure UARTE from scratch — the previous program may not
  // have set up the peripheral at all.
  await adi.writeMem32(NRF52_UARTE_ENABLE, 0);
  await adi.writeMem32(NRF52_UARTE_PSEL_TXD, MICROBIT_V2_TX_PIN);
  await adi.writeMem32(NRF52_UARTE_BAUDRATE, NRF_BAUDRATE_115200);
  await adi.writeMem32(NRF52_UARTE_ENABLE, 8); // 8 = UARTE mode

  // Write NUL bytes to RAM for the DMA buffer (harmless if seen by a
  // CDC reader — terminals ignore NUL).
  const nulBuf = new Uint32Array(CDC_SAT_BYTE_COUNT / 4);
  await adi.writeBlock(CDC_SAT_LOAD_ADDR, nulBuf);

  // Set up DMA and trigger
  await adi.writeMem32(NRF52_UARTE_TXD_PTR, CDC_SAT_LOAD_ADDR);
  await adi.writeMem32(NRF52_UARTE_TXD_MAXCNT, CDC_SAT_BYTE_COUNT);
  await adi.writeMem32(NRF52_UARTE_EVENTS_ENDTX, 0);
  await adi.writeMem32(NRF52_UARTE_TASKS_STARTTX, 1);

  // Poll for ENDTX (~178ms for 2048 bytes at 115200 baud).
  for (let i = 0; i < 2000; i++) {
    if (await adi.readMem32(NRF52_UARTE_EVENTS_ENDTX)) return;
  }
  logging.log("UARTE ENDTX not detected after polling");
}

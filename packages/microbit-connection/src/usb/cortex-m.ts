/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * Derived from dapjs (https://github.com/ARMmbed/dapjs) which is
 * Copyright (c) Arm Limited 2018
 * Copyright (c) Microsoft Corporation
 *
 * SPDX-License-Identifier: MIT
 *
 * See arm-debug.ts for the full dapjs license.
 *
 * Cortex-M processor control via the ARM Debug Interface.
 *
 * CortexM provides high-level operations for controlling an ARM Cortex-M
 * core over SWD: halting, resuming, reading/writing core registers,
 * executing code from RAM, and performing software resets.
 *
 * It communicates entirely through ArmDebug memory-mapped register
 * access — the Cortex-M debug registers (DHCSR, DCRSR, DCRDR, etc.) are
 * memory-mapped in the Private Peripheral Bus region starting at 0xE000_0000.
 */

import { type ArmDebug, waitFor } from "./arm-debug.js";
import { DapError } from "./cmsis-dap.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Debug registers
export const DFSR = 0xe000ed30;
export const DHCSR = 0xe000edf0;
export const DCRSR = 0xe000edf4;
export const DCRDR = 0xe000edf8;

// DHCSR bits
export const C_DEBUGEN = 1 << 0;
export const C_HALT = 1 << 1;
export const S_REGRDY = 1 << 16;
export const S_HALT = 1 << 17;
export const DBGKEY = 0xa05f << 16;

// DFSR bits
export const DFSR_HALTED = 1 << 0;
export const DFSR_BKPT = 1 << 1;
export const DFSR_DWTTRAP = 1 << 2;

// DCRSR bits
export const REGWnR = 1 << 16;

// Debug registers — Cortex-M system control
export const DEMCR = 0xe000edfc;
export const DEMCR_VC_CORERESET = 1 << 0;
export const NVIC_AIRCR = 0xe000ed0c;
export const NVIC_AIRCR_VECTKEY = 0x5fa << 16;
export const NVIC_AIRCR_SYSRESETREQ = 1 << 2;
export const S_RESET_ST = 1 << 25;

// ---------------------------------------------------------------------------
// CortexM
// ---------------------------------------------------------------------------

// Cortex-M core register indices used with readCoreRegister/writeCoreRegister.
export const CoreRegister = { SP: 13, LR: 14, PC: 15, PSR: 16 } as const;

export class CortexM {
  constructor(private adi: ArmDebug) {}

  private enableDebug(): Promise<void> {
    return this.adi.writeMem32(DHCSR, DBGKEY | C_DEBUGEN);
  }

  async isHalted(): Promise<boolean> {
    const dhcsr = await this.adi.readMem32(DHCSR);
    return !!(dhcsr & S_HALT);
  }

  async halt(wait = true, timeout = 0): Promise<void> {
    if (await this.isHalted()) return;
    await this.adi.writeMem32(DHCSR, DBGKEY | C_DEBUGEN | C_HALT);
    if (wait) {
      await waitFor(() => this.isHalted(), timeout);
    }
  }

  async resume(wait = true, timeout = 0): Promise<void> {
    if (!(await this.isHalted())) return;
    await this.adi.writeMem32(DFSR, DFSR_DWTTRAP | DFSR_BKPT | DFSR_HALTED);
    await this.enableDebug();
    if (wait) {
      await waitFor(async () => !(await this.isHalted()), timeout);
    }
  }

  async readCoreRegister(register: number): Promise<number> {
    const results = await this.adi.transferSequence([
      this.adi.writeMem32Ops(DCRSR, register),
      this.adi.readMem32Ops(DHCSR),
      this.adi.readMem32Ops(DCRDR),
    ]);
    if (!(results[0] & S_REGRDY)) {
      throw new DapError("Register not ready");
    }
    return results[1];
  }

  async writeCoreRegister(register: number, value: number): Promise<void> {
    const results = await this.adi.transferSequence([
      this.adi.writeMem32Ops(DCRDR, value),
      this.adi.writeMem32Ops(DCRSR, register | REGWnR),
      this.adi.readMem32Ops(DHCSR),
    ]);
    if (!(results[0] & S_REGRDY)) {
      throw new DapError("Register not ready");
    }
  }

  async waitForHalt(timeout = 10_000): Promise<void> {
    await waitFor(() => this.isHalted(), timeout);
  }

  /**
   * Upload code to target RAM, set up registers, resume execution,
   * and wait for the core to halt (typically on a BKPT instruction).
   */
  async execute(
    address: number,
    code: Uint32Array,
    sp: number,
    pc: number,
    lr: number,
    ...registers: number[]
  ): Promise<void> {
    if (registers.length > 12) {
      throw new DapError(
        `Only 12 general purpose registers but got ${registers.length} values`,
      );
    }
    await this.halt(true);
    await this.adi.writeBlock(address, code);
    await this.writeCoreRegister(CoreRegister.PC, pc);
    await this.writeCoreRegister(CoreRegister.LR, lr);
    await this.writeCoreRegister(CoreRegister.SP, sp);
    await this.writeCoreRegister(CoreRegister.PSR, 0x01000000);
    for (let i = 0; i < registers.length; i++) {
      await this.writeCoreRegister(i, registers[i]);
    }
    await this.resume(false);
    await this.waitForHalt();
  }

  /**
   * Software reset by writing to NVIC_AIRCR.
   * Waits for the system to come out of reset.
   */
  async softwareReset(): Promise<void> {
    await this.adi.writeMem32(
      NVIC_AIRCR,
      NVIC_AIRCR_VECTKEY | NVIC_AIRCR_SYSRESETREQ,
    );
    await waitFor(async () => {
      const dhcsr = await this.adi.readMem32(DHCSR);
      return (dhcsr & S_RESET_ST) === 0;
    }, 5000);
  }

  /**
   * Reset the target, optionally halting the core on reset.
   */
  async reset(halt = false): Promise<void> {
    if (halt) {
      await this.halt(true);

      const demcr = await this.adi.readMem32(DEMCR);
      await this.adi.writeMem32(DEMCR, demcr | DEMCR_VC_CORERESET);

      await this.softwareReset();
      await waitFor(() => this.isHalted());

      await this.adi.writeMem32(DEMCR, demcr);
    } else {
      await this.softwareReset();
    }
  }
}

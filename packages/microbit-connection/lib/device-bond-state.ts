/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */

export interface DeviceBondState {
  setBonded(id: string, isBonded: boolean): void;
  isBonded(id: string): boolean;
}

export class DefaultDeviceBondState implements DeviceBondState {
  private bondStates: Record<string, boolean> = {};
  setBonded(id: string, isBonded: boolean): void {
    this.bondStates[id] = isBonded;
  }
  isBonded(id: string): boolean {
    return this.bondStates[id] ?? false;
  }
}

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
 * WebUSB transport layer. Handles opening/closing the USB interface,
 * finding the correct CMSIS-DAP endpoints, and reading/writing raw packets.
 *
 * This is the lowest layer in the USB stack, sitting beneath the CMSIS-DAP
 * protocol layer. It knows nothing about DAP commands — it just moves
 * fixed-size packets between the host and the USB device.
 *
 * micro:bit V2 uses CMSIS-DAP v2 (bulk endpoints). micro:bit V1 uses
 * CMSIS-DAP v1 (HID) which has no bulk endpoints — we fall back to
 * control transfers (SET_REPORT/GET_REPORT) in that case.
 */

import { DeviceError } from "../device.js";

// WebUSB interface class for CMSIS-DAP
const CMSIS_DAP_INTERFACE_CLASS = 0xff;

// HID report types for control transfer fallback (CMSIS-DAP v1 / no bulk endpoints)
const GET_REPORT = 0x01;
const SET_REPORT = 0x09;
const OUT_REPORT = 0x200;
const IN_REPORT = 0x100;

export const PACKET_SIZE = 64;

export interface Transport {
  readonly isOpen: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  read(): Promise<DataView>;
  write(data: Uint8Array): Promise<void>;
}

export class UsbTransport implements Transport {
  private interfaceNumber?: number;
  private endpointIn?: USBEndpoint;
  private endpointOut?: USBEndpoint;

  constructor(private device: USBDevice) {}

  get isOpen(): boolean {
    return this.interfaceNumber !== undefined;
  }

  async open(): Promise<void> {
    if (this.isOpen) return;

    await this.device.open();
    await this.device.selectConfiguration(1);

    const interfaces = this.device.configuration!.interfaces.filter(
      (iface) =>
        iface.alternates[0].interfaceClass === CMSIS_DAP_INTERFACE_CLASS,
    );

    if (!interfaces.length) {
      throw new DeviceError({
        code: "firmware-update-required",
        message: "No valid interfaces found.",
      });
    }

    // Prefer interface with bulk endpoints (CMSIS-DAP v2).
    // Fall back to an interface without endpoints (CMSIS-DAP v1 / HID),
    // which will use control transfers instead.
    const selectedInterface =
      interfaces.find((iface) => iface.alternates[0].endpoints.length > 0) ??
      interfaces[0];

    this.interfaceNumber = selectedInterface.interfaceNumber;

    const endpoints = selectedInterface.alternates[0].endpoints;
    this.endpointIn = undefined;
    this.endpointOut = undefined;
    for (const endpoint of endpoints) {
      if (endpoint.direction === "in" && !this.endpointIn)
        this.endpointIn = endpoint;
      else if (endpoint.direction === "out" && !this.endpointOut)
        this.endpointOut = endpoint;
    }

    await this.device.claimInterface(this.interfaceNumber);
  }

  async close(): Promise<void> {
    this.interfaceNumber = undefined;
    this.endpointIn = undefined;
    this.endpointOut = undefined;
    await this.device.close();
  }

  async read(): Promise<DataView> {
    if (this.interfaceNumber === undefined) {
      throw new DeviceError({
        code: "connection-error",
        message: "No device opened",
      });
    }

    let result: USBInTransferResult;
    if (this.endpointIn) {
      result = await this.device.transferIn(
        this.endpointIn.endpointNumber,
        PACKET_SIZE,
      );
    } else {
      // Control transfer fallback for interfaces without bulk endpoints
      result = await this.device.controlTransferIn(
        {
          requestType: "class",
          recipient: "interface",
          request: GET_REPORT,
          value: IN_REPORT,
          index: this.interfaceNumber,
        },
        PACKET_SIZE,
      );
    }
    if (result.status !== "ok" || !result.data) {
      throw new DeviceError({
        code: "connection-error",
        message: "USB read failed",
      });
    }
    return result.data;
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.interfaceNumber === undefined) {
      throw new DeviceError({
        code: "connection-error",
        message: "No device opened",
      });
    }

    // Always pad to PACKET_SIZE (required for HID control transfer fallback)
    const buffer = new Uint8Array(PACKET_SIZE);
    buffer.set(data.subarray(0, PACKET_SIZE));

    if (this.endpointOut) {
      await this.device.transferOut(this.endpointOut.endpointNumber, buffer);
    } else {
      // Control transfer fallback for interfaces without bulk endpoints
      await this.device.controlTransferOut(
        {
          requestType: "class",
          recipient: "interface",
          request: SET_REPORT,
          value: OUT_REPORT,
          index: this.interfaceNumber,
        },
        buffer,
      );
    }
  }
}

/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */

// FICR Registers (Nordic nRF SoC Factory Information Configuration)
export const FICR = {
  CODEPAGESIZE: 0x10000000 | 0x10,
  CODESIZE: 0x10000000 | 0x14,

  DEVICE_ID_1: 0x10000000 | 0x64,
};

// DAPLink vendor commands
// https://github.com/ARMmbed/DAPLink/blob/main/source/daplink/cmsis-dap/daplink_vendor_commands.h
export const DapLinkVendorCmd = {
  /** Read the DAPLink unique ID (same string as USB serial number). */
  READ_UNIQUE_ID: 0x80,
  READ_SETTINGS: 0x81,
  WRITE_SETTINGS: 0x82,
  SERIAL_READ: 0x83,
  SERIAL_WRITE: 0x84,
  FLASH_RESET: 0x89,
  FLASH_OPEN: 0x8a,
  FLASH_CLOSE: 0x8b,
  FLASH_WRITE: 0x8c,
};

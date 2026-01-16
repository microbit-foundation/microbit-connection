/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { ConnectionAvailabilityStatus, DeviceError } from "./device.js";

/**
 * Throws a DeviceError if the availability status indicates the connection is unavailable.
 * The error codes align with ConnectionAvailabilityStatus values.
 *
 * @param status - The availability status to check.
 * @throws {DeviceError} If status is not "available".
 */
export const throwIfUnavailable = (
  status: ConnectionAvailabilityStatus,
): void => {
  switch (status) {
    case "available":
      return;
    case "unsupported":
      throw new DeviceError({
        code: "unsupported",
        message: "Connection type not supported",
      });
    case "disabled":
      throw new DeviceError({
        code: "disabled",
        message: "Connection is disabled",
      });
    case "permission-denied":
      throw new DeviceError({
        code: "permission-denied",
        message: "Permission denied",
      });
    case "location-disabled":
      throw new DeviceError({
        code: "location-disabled",
        message: "Location services disabled",
      });
  }
};

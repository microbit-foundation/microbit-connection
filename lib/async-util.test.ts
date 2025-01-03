/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { describe, expect, it } from "vitest";
import { TimeoutError, withTimeout } from "./async-util.js";

describe("withTimeout", () => {
  it("times out", async () => {
    const neverResolves = new Promise(() => {});
    await expect(() => withTimeout(neverResolves, 0)).rejects.toThrowError(
      TimeoutError,
    );
  });
  it("returns the value", async () => {
    const resolvesWithValue = async () => "foo";
    expect(await withTimeout(resolvesWithValue(), 10)).toEqual("foo");
  });
});

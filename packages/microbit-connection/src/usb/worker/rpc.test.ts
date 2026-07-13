/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 *
 * @vitest-environment node
 */
import { MessageChannel } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceError, FlashDataError, ProgressStage } from "../../device.js";
import { MessagePortLike, RpcEndpoint, RpcTransfer } from "./rpc.js";

const cleanups: Array<() => void> = [];

const makePair = () => {
  const channel = new MessageChannel();
  const a = new RpcEndpoint(channel.port1 as unknown as MessagePortLike);
  const b = new RpcEndpoint(channel.port2 as unknown as MessagePortLike);
  cleanups.push(() => {
    channel.port1.close();
    channel.port2.close();
  });
  return { a, b };
};

afterEach(() => {
  cleanups.forEach((f) => f());
  cleanups.length = 0;
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("RpcEndpoint", () => {
  it("correlates interleaved responses to the right calls", async () => {
    const { a, b } = makePair();
    b.serve({
      slow: async (args) => {
        await delay(30);
        return `slow:${args[0]}`;
      },
      fast: async (args) => `fast:${args[0]}`,
    });
    const [slow, fast] = await Promise.all([
      a.call<string>("slow", [1]),
      a.call<string>("fast", [2]),
    ]);
    expect(slow).toBe("slow:1");
    expect(fast).toBe("fast:2");
  });

  it("round-trips DeviceError with its code", async () => {
    const { a, b } = makePair();
    b.serve({
      boom: async () => {
        throw new DeviceError({ code: "device-in-use", message: "claimed" });
      },
    });
    const error = await a.call("boom", []).catch((e) => e);
    expect(error).toBeInstanceOf(DeviceError);
    expect(error.code).toBe("device-in-use");
    expect(error.message).toBe("claimed");
  });

  it("round-trips FlashDataError as an instance", async () => {
    const { a, b } = makePair();
    b.serve({
      boom: async () => {
        throw new FlashDataError("bad hex");
      },
    });
    const error = await a.call("boom", []).catch((e) => e);
    expect(error).toBeInstanceOf(FlashDataError);
    expect(error.message).toBe("bad hex");
  });

  it("routes progress to the originating call only", async () => {
    const { a, b } = makePair();
    b.serve({
      work: async (args, context) => {
        context.progress(ProgressStage.PartialFlashing, args[0] as number);
        context.progress(ProgressStage.PartialFlashing, 1);
        return "done";
      },
      idle: async () => {
        await delay(20);
        return "idle";
      },
    });
    const workProgress = vi.fn();
    const idleProgress = vi.fn();
    await Promise.all([
      a.call("work", [0.5], { onProgress: workProgress }),
      a.call("idle", [], { onProgress: idleProgress }),
    ]);
    expect(workProgress.mock.calls).toEqual([
      [ProgressStage.PartialFlashing, 0.5],
      [ProgressStage.PartialFlashing, 1],
    ]);
    expect(idleProgress).not.toHaveBeenCalled();
  });

  it("supports duplex calls", async () => {
    const { a, b } = makePair();
    a.serve({ fromB: async () => "a-result" });
    b.serve({ fromA: async () => "b-result" });
    const [fromA, fromB] = await Promise.all([
      a.call("fromA", []),
      b.call("fromB", []),
    ]);
    expect(fromA).toBe("b-result");
    expect(fromB).toBe("a-result");
  });

  it("rejects unknown methods", async () => {
    const { a, b } = makePair();
    b.serve({});
    await expect(a.call("nope", [])).rejects.toThrow(/Unknown RPC method/);
  });

  it("fail() rejects in-flight and future calls", async () => {
    const { a, b } = makePair();
    b.serve({
      hang: () => new Promise(() => {}),
    });
    const inFlight = a.call("hang", []);
    a.fail(new DeviceError({ code: "connection-error", message: "dead" }));
    await expect(inFlight).rejects.toMatchObject({ code: "connection-error" });
    await expect(a.call("hang", [])).rejects.toMatchObject({
      code: "connection-error",
    });
  });

  it("transfers RpcTransfer-wrapped results, detaching the source", async () => {
    const { a, b } = makePair();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    b.serve({
      data: async () => new RpcTransfer({ data: bytes }, [bytes.buffer]),
    });
    const result = await a.call<{ data: Uint8Array }>("data", []);
    expect([...result.data]).toEqual([1, 2, 3, 4]);
    // The buffer was transferred rather than cloned.
    expect(bytes.buffer.byteLength).toBe(0);
  });

  it("forwards aborts to the serving side", async () => {
    const { a, b } = makePair();
    b.serve({
      cancellable: (_args, context) =>
        new Promise((resolve) => {
          context.signal.addEventListener("abort", () => resolve("aborted"));
        }),
    });
    const controller = new AbortController();
    const result = a.call("cancellable", [], { signal: controller.signal });
    await delay(10);
    controller.abort();
    expect(await result).toBe("aborted");
  });

  it("passes non-RPC messages to the onOther handler", async () => {
    const { a, b } = makePair();
    const other = vi.fn();
    b.onOther(other);
    a.post({ kind: "subscribe", type: "serialdata" });
    await delay(10);
    expect(other).toHaveBeenCalledWith({
      kind: "subscribe",
      type: "serialdata",
    });
  });
});

/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import {
  type BoardVersion,
  ConnectionStatus,
} from "@microbit/microbit-connection";
import { createUniversalHexFlashDataSource } from "@microbit/microbit-connection/universal-hex";
import { TestRunner, type TestContext, type TestSuite } from "./runner";
import "./style.css";

interface SuiteParams {
  boardVersion: BoardVersion;
  connectInstruction: string;
}

function createUSBSuite({
  boardVersion,
  connectInstruction,
}: SuiteParams): TestSuite {
  return {
    name: `${boardVersion} micro:bit`,
    tests: [
      {
        name: "Connect",
        run: async (ctx) => {
          await ctx.waitForUser(connectInstruction);
          await ctx.connection.clearDevice();
          ctx.log("Requesting device...");
          await ctx.connection.connect();
          await ctx.waitForStatus(ConnectionStatus.CONNECTED);
          ctx.log(`Status: ${ctx.connection.status}`);
          ctx.assert(
            ctx.connection.getBoardVersion() === boardVersion,
            `Board version is ${boardVersion}`,
          );
          ctx.log(`Device ID: ${ctx.connection.getDeviceId()}`);
        },
      },
      {
        name: "MakeCode baseline",
        run: async (ctx) => {
          assertConnected(ctx);
          ctx.log("Fetching microbit-beating-heart.hex...");
          const hex = await ctx.fetchHex("microbit-beating-heart.hex");
          ctx.log("Flashing to establish known MakeCode baseline...");
          await flashWithProgress(ctx, hex);
        },
      },
      {
        name: "Partial flash, serial from zero",
        run: async (ctx) => {
          assertConnected(ctx);
          ctx.log("Fetching incremental-makecode.hex...");
          const hex = await ctx.fetchHex("incremental-makecode.hex");
          ctx.log("Flashing (partial expected, same MakeCode runtime)...");
          const stages = await flashWithProgress(ctx, hex);
          assertFlashType(ctx, stages, "PartialFlashing");
          ctx.log("Checking serial restarts from 0 after flash...");
          await assertSerialFromZero(ctx, 5, 15_000);
        },
      },
      {
        name: "Replug, partial flash, serial from zero",
        run: async (ctx) => {
          await replugAndReconnect(ctx, boardVersion);
          ctx.log(
            "Waiting for serial to confirm polling is active on fresh USB connection...",
          );
          await ctx.serial.waitForNumbers(2, 15_000);
          ctx.assert(
            ctx.serial.numbers.length >= 2,
            `Serial active before flash (got ${ctx.serial.numbers.length} numbers)`,
          );
          const resetsBefore = ctx.serial.resetCount;
          ctx.log("Flashing same hex on fresh USB connection...");
          const hex = await ctx.fetchHex("incremental-makecode.hex");
          const stages = await flashWithProgress(ctx, hex);
          assertFlashType(ctx, stages, "PartialFlashing");
          ctx.assert(
            ctx.serial.resetCount > resetsBefore,
            `serialreset fired (count: ${resetsBefore} -> ${ctx.serial.resetCount})`,
          );
          ctx.log("Checking serial restarts from 0 after flash...");
          await assertSerialFromZero(ctx, 5, 15_000);
        },
      },
      {
        name: "Replug, full flash, serial from zero",
        run: async (ctx) => {
          await replugAndReconnect(ctx, boardVersion);
          ctx.log(
            "Waiting for serial to confirm polling is active on fresh USB connection...",
          );
          await ctx.serial.waitForNumbers(2, 15_000);
          ctx.assert(
            ctx.serial.numbers.length >= 2,
            `Serial active before flash (got ${ctx.serial.numbers.length} numbers)`,
          );
          const resetsBefore = ctx.serial.resetCount;
          ctx.log("Flashing Python on fresh USB connection (runtime change)...");
          const hex = await ctx.fetchHex("incremental-python.hex");
          const stages = await flashWithProgress(ctx, hex);
          assertFlashType(ctx, stages, "FullFlashing");
          ctx.assert(
            ctx.serial.resetCount > resetsBefore,
            `serialreset fired (count: ${resetsBefore} -> ${ctx.serial.resetCount})`,
          );
          ctx.log("Checking serial restarts from 0 after flash...");
          await assertSerialFromZero(ctx, 5, 15_000);
        },
      },
      {
        name: "Partial flash fallback to full",
        run: async (ctx) => {
          assertConnected(ctx);
          ctx.log("Re-establishing MakeCode baseline...");
          const baseline = await ctx.fetchHex("microbit-beating-heart.hex");
          await flashWithProgress(ctx, baseline);

          ctx.log("Flashing MakeCode with fault injection during partial...");
          const hex = await ctx.fetchHex("incremental-makecode.hex");
          const stages = await flashWithFault(ctx, hex, "PartialFlashing");
          ctx.assert(
            stages.includes("PartialFlashing") &&
              stages.includes("FullFlashing"),
            `Partial failed then fell back to full (stages: ${stages.join(" → ")})`,
          );
        },
      },
      {
        name: "Full flash fallback to partial",
        run: async (ctx) => {
          assertConnected(ctx);
          ctx.log("Flashing Python with fault injection during full...");
          const hex = await ctx.fetchHex("python-editor-default.hex");
          const stages = await flashWithFault(ctx, hex, "FullFlashing");
          ctx.assert(
            stages.includes("FullFlashing") &&
              stages.includes("PartialFlashing"),
            `Full failed then fell back to partial (stages: ${stages.join(" → ")})`,
          );
        },
      },
      {
        name: "Clean disconnect",
        run: async (ctx) => {
          await ctx.connection.disconnect();
          ctx.assert(
            ctx.connection.status === ConnectionStatus.DISCONNECTED,
            "Disconnected cleanly",
          );
        },
      },
    ],
  };
}

// --- Helpers ---

async function replugAndReconnect(
  ctx: TestContext,
  boardVersion: BoardVersion,
): Promise<void> {
  assertConnected(ctx);
  await ctx.waitForStatus(ConnectionStatus.NO_AUTHORIZED_DEVICE, 60_000, {
    instruction: "Unplug the micro:bit.",
  });
  ctx.assert(
    ctx.connection.status === ConnectionStatus.NO_AUTHORIZED_DEVICE,
    "Device lost after unplug",
  );
  await ctx.waitForUser(
    "Plug the micro:bit back in, then click Continue.",
  );
  ctx.log("Reconnecting...");
  await ctx.connection.connect();
  await ctx.waitForStatus(ConnectionStatus.CONNECTED, 15_000);
  ctx.assert(
    ctx.connection.status === ConnectionStatus.CONNECTED,
    "Reconnected",
  );
  ctx.assert(
    ctx.connection.getBoardVersion() === boardVersion,
    `Still ${boardVersion} after reconnect`,
  );
}

function assertConnected(ctx: TestContext): void {
  ctx.assert(
    ctx.connection.status === ConnectionStatus.CONNECTED,
    "Connected",
  );
}

async function flashWithProgress(
  ctx: TestContext,
  hex: string,
): Promise<string[]> {
  const stages: string[] = [];
  await ctx.connection.flash(createUniversalHexFlashDataSource(hex), {
    partial: true,
    progress: (stage, pct) => {
      const msg = `${stage}${pct !== undefined ? ` ${(pct * 100).toFixed(0)}%` : ""}`;
      if (stages[stages.length - 1] !== stage) {
        stages.push(stage);
        ctx.log(msg);
      }
    },
  });
  ctx.assert(stages.length > 0, "Progress callbacks received");
  ctx.log("Flash complete");
  return stages;
}

async function flashWithFault(
  ctx: TestContext,
  hex: string,
  faultStage: "PartialFlashing" | "FullFlashing",
): Promise<string[]> {
  const stages: string[] = [];
  let injectFault = true;
  await ctx.connection.flash(createUniversalHexFlashDataSource(hex), {
    partial: true,
    progress: (stage, pct) => {
      const msg = `${stage}${pct !== undefined ? ` ${(pct * 100).toFixed(0)}%` : ""}`;
      if (stages[stages.length - 1] !== stage) {
        stages.push(stage);
        ctx.log(msg);
      }
      if (
        injectFault &&
        stage === faultStage &&
        pct !== undefined &&
        pct > 0.1
      ) {
        injectFault = false;
        ctx.log(`Injecting fault during ${faultStage}`);
        throw new Error(`Injected ${faultStage} failure`);
      }
    },
  });
  ctx.assert(stages.length > 0, "Progress callbacks received");
  ctx.log("Flash complete (with fallback)");
  return stages;
}

function assertFlashType(
  ctx: TestContext,
  stages: string[],
  expected: "PartialFlashing" | "FullFlashing",
): void {
  const actual = stages.includes("PartialFlashing")
    ? "PartialFlashing"
    : stages.includes("FullFlashing")
      ? "FullFlashing"
      : "unknown";
  ctx.assert(actual === expected, `Flash type is ${expected} (got ${actual})`);
}

async function assertSerialFromZero(
  ctx: TestContext,
  count: number,
  timeoutMs: number,
): Promise<void> {
  const numbers = await ctx.serial.waitForNumbers(count, timeoutMs);
  ctx.log(`Received: ${numbers.join(", ")}`);
  ctx.assert(numbers.length >= count, `Got ${numbers.length} numbers (need ${count})`);
  ctx.assert(numbers[0] === 0, `First number is 0 (got ${numbers[0]})`);
  for (let i = 1; i < numbers.length; i++) {
    ctx.assert(
      numbers[i] === numbers[i - 1] + 1,
      `Sequential: ${numbers[i - 1]} -> ${numbers[i]}`,
    );
  }
}

// --- Init ---

document.title = "micro:bit USB hardware tests";

const header = document.createElement("h1");
header.textContent = "micro:bit USB hardware tests";
document.body.appendChild(header);

const controls = document.createElement("div");
controls.className = "controls";
document.body.appendChild(controls);

const container = document.createElement("div");
document.body.appendChild(container);

const runner = new TestRunner(container);
runner.addSuite(
  createUSBSuite({
    boardVersion: "V2",
    connectInstruction: "Plug in a V2 micro:bit and click Continue.",
  }),
);
runner.addSuite(
  createUSBSuite({
    boardVersion: "V1",
    connectInstruction:
      "Unplug V2 if present. Plug in a V1 micro:bit and click Continue.",
  }),
);

const runAllBtn = document.createElement("button");
runAllBtn.className = "primary";
runAllBtn.textContent = "Run all";
runAllBtn.addEventListener("click", () => {
  runner.runAll();
});
controls.appendChild(runAllBtn);

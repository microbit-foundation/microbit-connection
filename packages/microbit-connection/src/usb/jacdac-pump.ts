/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 *
 * Jacdac-over-USB exchange pump for micro:bit V2.
 *
 * CODAL programs built with Jacdac support maintain an "exchange" struct in
 * target RAM. The host finds it by scanning for two magic words and then
 * pumps frames in and out of it over SWD while the target keeps running.
 * Ported from jacdac-ts's CMSISProto (src/jdom/transport/microbit.ts) onto
 * this library's ArmDebug memory interface.
 *
 * Exchange struct layout (offsets from the magic words):
 * - +0: magic words 0x786d444a, 0xb0a6c0e9
 * - +8: IRQ number used to signal the target (byte)
 * - +12: device -> host slot, 256 bytes. Byte +14 is the frame data size
 *   (0 = empty, 0xff = freshly initialized by the target). The host
 *   releases the slot by writing word 0 at +12 and raising the IRQ.
 * - +268: host -> device frame header word (first 4 bytes of the frame).
 *   The target zeroes the size byte (+270) when it has consumed the frame.
 * - +272: host -> device frame body (frame bytes 4 onwards).
 */
import { delay } from "../async-util.js";
import { DeviceError } from "../device.js";
import { Logging } from "../logging.js";
import { type ArmDebug } from "./arm-debug.js";
import { DapTransferError } from "./cmsis-dap.js";

const JD_MAGIC_0 = 0x786d444a;
const JD_MAGIC_1 = 0xb0a6c0e9;

const RAM_START = 0x2000_0000;
const RAM_END = RAM_START + 128 * 1024;
const SCAN_CHUNK = 1024;
// The exchange is heap-allocated so in practice lives near this address;
// scan outwards from here rather than linearly from the start of RAM.
const SCAN_ORIGIN = 0x2000_6000;

const RX_OFFSET = 12;
const TX_HEADER_OFFSET = 12 + 256;
const TX_BODY_OFFSET = 12 + 256 + 4;

const JD_FRAME_HEADER_SIZE = 12;
const JD_FRAME_MAX_DATA_SIZE = 240;
const JD_FRAME_MAX_SIZE = JD_FRAME_HEADER_SIZE + JD_FRAME_MAX_DATA_SIZE;

const NVIC_ISPR_BASE = 0xe000e200;

const FIND_EXCHANGE_TIMEOUT = 5_000;
const FIND_EXCHANGE_RETRY_DELAY = 200;
const RECOVERY_DELAY = 500;
const SLOW_CYCLE_THRESHOLD = 50;

// Slow-cycle diagnostics: cycles are timed per phase so the slow-cycle
// warning can attribute the delay (USB transfer vs event-loop lag vs frame
// size). Known benign cause of degrading cycles: DevTools' "capture async
// stack traces" slows the whole worker progressively for as long as the
// inspector is attached — see the troubleshooting note in the README.
const SLOW_LOG_MIN_INTERVAL = 1_000;
const STUCK_SEND_THRESHOLD = 1_000;
const STUCK_SEND_LOG_INTERVAL = 5_000;

// Consecutive empty polls back the poll delay off up to this cap. Zero-delay
// polling (~3k polls/s) burnt a core needlessly and amplified per-async-op
// overheads (such as attached DevTools) into visible stalls; 4ms keeps the
// worst-case added frame latency well under a typical 20ms streaming period.
const IDLE_BACKOFF_MAX_DELAY = 4;

interface SendItem {
  /** Padded to a 4-byte multiple. */
  frame: Uint8Array;
  resolve: () => void;
  reject: (e: Error) => void;
}

const sizeByte = (word: number): number => (word >>> 16) & 0xff;

/**
 * Pumps Jacdac frames through the exchange struct.
 *
 * Purely ArmDebug-based: no DOM or connection dependencies, so it can run
 * wherever the USB stack runs. Lifecycle and gating against flashing are
 * the owner's responsibility.
 */
export class JacdacPump {
  private xchgAddr: number | undefined;
  private irqn = 0;
  private stopRequested = false;
  private terminalError: Error | undefined;
  private sendQ: SendItem[] = [];
  private currSend: SendItem | undefined;
  private lastSendAttempt = 0;
  private lastCycle = 0;

  // Slow-cycle diagnostics state.
  private phases: Record<string, number> = {};
  private cycleRxBytes = 0;
  private sendStartedAt = 0;
  private lastSlowLog = 0;
  private suppressedSlow = 0;
  private lastStuckSendLog = 0;

  constructor(
    private adi: ArmDebug,
    private onFrame: (frame: Uint8Array) => void,
    private logging: Logging,
  ) {}

  /**
   * Find the exchange struct and pump until {@link stop} is called.
   *
   * Long-running: resolves when stopped, throws on terminal errors
   * (including {@link DeviceError} with code `jacdac-missing` when the
   * running program has no Jacdac stack). Pending sends are rejected
   * either way.
   */
  async startPumping(): Promise<void> {
    try {
      this.xchgAddr = await this.findExchangeWithRetry();
      if (this.xchgAddr === undefined) {
        // Stopped during the initial scan.
        return;
      }
      await this.initExchange();
      this.logging.log(
        `Jacdac exchange at 0x${this.xchgAddr.toString(16)}; irqn=${this.irqn}`,
      );
      await this.pumpLoop();
    } catch (e) {
      this.terminalError = e instanceof Error ? e : new Error(String(e));
      throw e;
    } finally {
      this.rejectSends(
        this.terminalError ??
          new DeviceError({
            code: "not-connected",
            message: "Jacdac pump stopped",
          }),
      );
    }
  }

  /**
   * Request the pump loop to exit. Pending sends are rejected when the
   * loop unwinds; awaiting the {@link startPumping} promise confirms the
   * pump has stopped touching the debug interface.
   */
  stop(): void {
    this.stopRequested = true;
  }

  /**
   * Queue a frame for the device. Resolves when the device has consumed
   * it. The frame is copied so the caller may reuse the buffer.
   */
  sendFrame(frame: Uint8Array): Promise<void> {
    if (
      frame.length < JD_FRAME_HEADER_SIZE ||
      frame.length > JD_FRAME_MAX_SIZE
    ) {
      throw new RangeError(
        `Invalid Jacdac frame length ${frame.length}; expected ${JD_FRAME_HEADER_SIZE}..${JD_FRAME_MAX_SIZE}`,
      );
    }
    if (this.stopRequested) {
      return Promise.reject(
        this.terminalError ??
          new DeviceError({
            code: "not-connected",
            message: "Jacdac pump stopped",
          }),
      );
    }
    const padded = new Uint8Array((frame.length + 3) & ~3);
    padded.set(frame);
    return new Promise<void>((resolve, reject) => {
      this.sendQ.push({ frame: padded, resolve, reject });
    });
  }

  private async findExchangeWithRetry(): Promise<number | undefined> {
    const deadline = Date.now() + FIND_EXCHANGE_TIMEOUT;
    while (!this.stopRequested) {
      const addr = await this.findExchange();
      if (addr !== undefined) {
        return addr;
      }
      if (Date.now() >= deadline) {
        throw new DeviceError({
          code: "jacdac-missing",
          message:
            "Jacdac exchange not found; the program on the micro:bit does not include Jacdac",
        });
      }
      await delay(FIND_EXCHANGE_RETRY_DELAY);
    }
    return undefined;
  }

  private async findExchange(): Promise<number | undefined> {
    // Search a chunk for the magic words. Returns the address of the magic,
    // 0 if not in this chunk, or null if the chunk is outside RAM.
    const check = async (addr: number): Promise<number | null> => {
      if (addr < RAM_START || addr + SCAN_CHUNK > RAM_END) {
        return null;
      }
      // One extra word so a magic pair straddling a chunk boundary matches.
      const wordCount = SCAN_CHUNK / 4 + (addr + SCAN_CHUNK < RAM_END ? 1 : 0);
      let words: Uint32Array;
      try {
        words = await this.adi.readBlock(addr, wordCount);
      } catch (e) {
        if (e instanceof DapTransferError) {
          // Beyond the readable RAM of this device variant.
          return null;
        }
        throw e;
      }
      for (let i = 0; i < SCAN_CHUNK / 4; ++i) {
        if (words[i] === JD_MAGIC_0 && words[i + 1] === JD_MAGIC_1) {
          return addr + i * 4;
        }
      }
      return 0;
    };

    let p0 = SCAN_ORIGIN;
    let p1 = SCAN_ORIGIN + SCAN_CHUNK;
    while (!this.stopRequested) {
      const a0 = await check(p0);
      if (a0) {
        return a0;
      }
      const a1 = await check(p1);
      if (a1) {
        return a1;
      }
      if (a0 === null && a1 === null) {
        return undefined;
      }
      p0 -= SCAN_CHUNK;
      p1 += SCAN_CHUNK;
    }
    return undefined;
  }

  /**
   * Read the exchange header and unlock the device -> host slot.
   *
   * Unlike CMSISProto we don't reset the target before attaching, so the
   * slot may be freshly initialized (0xff), empty (0), or hold a stale
   * frame from a previous host session (consumed by the first loop pass).
   */
  private async initExchange(): Promise<void> {
    const xchg = this.xchgAddr!;
    const header = await this.adi.readBlock(xchg, 4);
    this.irqn = header[2] & 0xff;
    const rxSize = sizeByte(header[3]);
    if (rxSize === 0xff) {
      await this.adi.writeMem32(xchg + RX_OFFSET, 0);
    } else if (rxSize > JD_FRAME_MAX_DATA_SIZE) {
      throw new DeviceError({
        code: "connection-error",
        message: "Jacdac exchange corrupt; try power-cycling the micro:bit",
      });
    }
  }

  private async pumpLoop(): Promise<void> {
    let justRecovered = false;
    let idleStreak = 0;
    while (!this.stopRequested) {
      try {
        const progress = await this.pumpCycle();
        justRecovered = false;
        if (progress) {
          idleStreak = 0;
        } else if (!this.stopRequested) {
          // Idle: back off gradually so a quiet bus isn't polled at full
          // rate; reset as soon as a frame moves so bursts drain quickly.
          idleStreak++;
          await this.timed("idle", () =>
            delay(Math.min(idleStreak - 1, IDLE_BACKOFF_MAX_DELAY)),
          );
        }
      } catch (e) {
        if (this.stopRequested) {
          return;
        }
        // A transfer error usually means the target reset (reset button,
        // softwareReset, baud-change reset). The same program restarts and
        // re-creates the exchange, so try once to re-attach.
        if (e instanceof DapTransferError && !justRecovered) {
          justRecovered = true;
          await this.recover();
          continue;
        }
        throw e;
      }
    }
  }

  private async pumpCycle(): Promise<boolean> {
    const now = Date.now();
    const gap = this.lastCycle ? now - this.lastCycle : 0;
    if (gap > SLOW_CYCLE_THRESHOLD) {
      this.logSlowCycle(gap);
    }
    // Phase times accumulated from here (through the trailing idle yield)
    // are what explain the next cycle's gap.
    this.phases = {};
    this.cycleRxBytes = 0;
    this.lastCycle = now;

    let progress = await this.pollRx();
    if (this.currSend || this.sendQ.length) {
      progress = (await this.pollTxAndSend()) || progress;
    }
    return progress;
  }

  /** Time one phase of the pump cycle for the slow-cycle diagnostics. */
  private async timed<T>(phase: string, f: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await f();
    } finally {
      this.phases[phase] =
        (this.phases[phase] ?? 0) + performance.now() - start;
    }
  }

  private logSlowCycle(gap: number): void {
    const now = performance.now();
    if (now - this.lastSlowLog < SLOW_LOG_MIN_INTERVAL) {
      this.suppressedSlow++;
      return;
    }
    this.lastSlowLog = now;
    // "unaccounted" is time within the gap spent outside the timed awaits:
    // event-loop lag from GC, message handling or thread contention.
    const accounted = Object.values(this.phases).reduce((a, b) => a + b, 0);
    const detail = Object.entries(this.phases)
      .map(([name, ms]) => `${name}=${ms.toFixed(1)}`)
      .join(" ");
    const suppressed = this.suppressedSlow
      ? ` [+${this.suppressedSlow} suppressed]`
      : "";
    this.suppressedSlow = 0;
    this.logging.log(
      `Slow Jacdac exchange: ${gap}ms (ms: ${detail || "none"} ` +
        `unaccounted=${Math.max(0, gap - accounted).toFixed(1)}; ` +
        `rxBytes=${this.cycleRxBytes} sendQ=${this.sendQ.length}` +
        `${this.currSendAgeText(now)})${suppressed}`,
    );
  }

  private currSendAgeText(now: number): string {
    return this.currSend
      ? ` currSendAge=${(now - this.sendStartedAt).toFixed(0)}ms`
      : "";
  }

  private async pollRx(): Promise<boolean> {
    const xchg = this.xchgAddr!;
    // Peek the slot's first word for the size so the idle poll is a single
    // DAP transfer rather than a 256-byte block read.
    const head = await this.timed("rxHead", () =>
      this.adi.readMem32(xchg + RX_OFFSET),
    );
    const size = sizeByte(head);
    if (size === 0) {
      return false;
    }
    if (size === 0xff) {
      // The target re-initialized the exchange (e.g. it reset without the
      // debug interface noticing). Re-attach.
      this.logging.log("Jacdac exchange was re-initialized; re-attaching");
      await this.timed("reattach", () => this.initExchange());
      return true;
    }
    if (size > JD_FRAME_MAX_DATA_SIZE) {
      throw new DeviceError({
        code: "connection-error",
        message: "Jacdac exchange corrupt; try power-cycling the micro:bit",
      });
    }
    const words = await this.timed("rxBlock", () =>
      this.adi.readBlock(
        xchg + RX_OFFSET,
        (size + JD_FRAME_HEADER_SIZE + 3) >> 2,
      ),
    );
    // Release the slot before delivering so the target can refill it while
    // the app processes the frame.
    await this.timed("rxRelease", () =>
      this.adi.writeMem32(xchg + RX_OFFSET, 0),
    );
    await this.timed("rxIrq", () => this.triggerIRQ());
    const frameLength = size + JD_FRAME_HEADER_SIZE;
    this.cycleRxBytes += frameLength;
    this.onFrame(new Uint8Array(words.buffer, words.byteOffset, frameLength));
    return true;
  }

  private async pollTxAndSend(): Promise<boolean> {
    const xchg = this.xchgAddr!;
    let progress = false;
    let sendFree = false;
    if (this.currSend) {
      const head = await this.timed("txPoll", () =>
        this.adi.readMem32(xchg + TX_HEADER_OFFSET),
      );
      if (sizeByte(head) === 0) {
        this.currSend.resolve();
        this.currSend = undefined;
        sendFree = true;
        progress = true;
      } else {
        this.logStuckSend();
      }
    }
    if (!this.currSend && this.sendQ.length) {
      if (!sendFree) {
        const head = await this.timed("txPoll", () =>
          this.adi.readMem32(xchg + TX_HEADER_OFFSET),
        );
        sendFree = sizeByte(head) === 0;
      }
      if (sendFree) {
        this.currSend = this.sendQ.shift()!;
        const frame = this.currSend.frame;
        await this.timed("txWrite", () =>
          this.adi.writeBlock(
            xchg + TX_BODY_OFFSET,
            new Uint32Array(frame.buffer, 4, (frame.length - 4) / 4),
          ),
        );
        // Header word last: the size byte it carries is what tells the
        // target a frame is present, so the body must already be in place.
        const headerWord =
          (frame[0] | (frame[1] << 8) | (frame[2] << 16) | (frame[3] << 24)) >>>
          0;
        await this.timed("txWrite", () =>
          this.adi.writeMem32(xchg + TX_HEADER_OFFSET, headerWord),
        );
        await this.timed("txIrq", () => this.triggerIRQ());
        this.lastSendAttempt = Date.now();
        this.sendStartedAt = performance.now();
        progress = true;
      } else if (
        this.lastSendAttempt &&
        Date.now() - this.lastSendAttempt > SLOW_CYCLE_THRESHOLD
      ) {
        this.lastSendAttempt = 0;
        this.logging.log("Jacdac send: device slow to consume frame");
      }
    }
    return progress;
  }

  /**
   * The in-flight frame hasn't been consumed for a suspiciously long time.
   * Without this a TX stall is silent: the "slow to consume" log in
   * {@link pollTxAndSend} only covers a stale foreign frame blocking the
   * slot, not our own in-flight send.
   */
  private logStuckSend(): void {
    const now = performance.now();
    const age = now - this.sendStartedAt;
    if (
      age > STUCK_SEND_THRESHOLD &&
      now - this.lastStuckSendLog > STUCK_SEND_LOG_INTERVAL
    ) {
      this.lastStuckSendLog = now;
      this.logging.log(
        `Jacdac send: in-flight frame unconsumed for ${age.toFixed(0)}ms ` +
          `(sendQ=${this.sendQ.length})`,
      );
    }
  }

  private async triggerIRQ(): Promise<void> {
    await this.adi.writeMem32(
      NVIC_ISPR_BASE + (this.irqn >> 5) * 4,
      (1 << (this.irqn & 31)) >>> 0,
    );
  }

  private async recover(): Promise<void> {
    this.logging.log("Jacdac exchange access failed; attempting recovery");
    if (this.currSend) {
      // The in-flight frame's fate is unknown after a reset.
      this.currSend.reject(
        new DeviceError({
          code: "connection-error",
          message: "Device reset while sending Jacdac frame",
        }),
      );
      this.currSend = undefined;
    }
    await delay(RECOVERY_DELAY);
    if (this.stopRequested) {
      return;
    }
    // The reset may have left the debug interface powered down.
    await this.adi.reinit();
    const words = await this.adi.readBlock(this.xchgAddr!, 2);
    if (words[0] !== JD_MAGIC_0 || words[1] !== JD_MAGIC_1) {
      this.logging.log("Jacdac exchange moved; rescanning");
      const addr = await this.findExchangeWithRetry();
      if (addr === undefined) {
        return;
      }
      this.xchgAddr = addr;
    }
    await this.initExchange();
    // Otherwise the recovery pause is guaranteed to register as one bogus
    // slow cycle.
    this.lastCycle = 0;
  }

  private rejectSends(error: Error): void {
    const items = this.currSend ? [this.currSend, ...this.sendQ] : this.sendQ;
    this.currSend = undefined;
    this.sendQ = [];
    items.forEach((item) => item.reject(error));
  }
}

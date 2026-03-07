/**
 * (c) 2026, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import {
  ConnectionStatus,
  type ConnectionStatusChange,
} from "@microbit/microbit-connection";
import {
  createUSBConnection,
  DeviceSelectionMode,
  type MicrobitUSBConnection,
  type SerialData,
} from "@microbit/microbit-connection/usb";

export type TestStatus = "pending" | "running" | "pass" | "fail" | "skipped";

/**
 * Persistent serial accumulator. Stays attached to the connection for the
 * entire test run, parsing line-delimited integers from serial data.
 * Automatically clears on serialreset events.
 */
export class SerialAccumulator {
  numbers: number[] = [];
  resetCount = 0;
  private buffer = "";

  private readonly dataListener = (event: SerialData) => {
    this.buffer += event.data;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop()!;
    for (const line of lines) {
      const trimmed = line.trim();
      const n = parseInt(trimmed, 10);
      if (!isNaN(n) && String(n) === trimmed) {
        this.numbers.push(n);
      }
    }
  };

  private readonly resetListener = () => {
    this.clear();
    this.resetCount++;
  };

  attach(connection: MicrobitUSBConnection): void {
    connection.addEventListener("serialdata", this.dataListener);
    connection.addEventListener("serialreset", this.resetListener);
  }

  detach(connection: MicrobitUSBConnection): void {
    connection.removeEventListener("serialdata", this.dataListener);
    connection.removeEventListener("serialreset", this.resetListener);
  }

  clear(): void {
    this.numbers = [];
    this.buffer = "";
  }

  /**
   * Wait until at least `count` numbers have been accumulated, or timeout.
   */
  async waitForNumbers(count: number, timeoutMs: number): Promise<number[]> {
    if (this.numbers.length >= count) {
      return this.numbers.slice(0, count);
    }
    return new Promise((resolve) => {
      const check = () => {
        if (this.numbers.length >= count) {
          clearTimeout(timer);
          clearInterval(poller);
          resolve(this.numbers.slice(0, count));
        }
      };
      const poller = setInterval(check, 50);
      const timer = setTimeout(() => {
        clearInterval(poller);
        resolve([...this.numbers]);
      }, timeoutMs);
    });
  }
}

export interface TestContext {
  connection: MicrobitUSBConnection;
  serial: SerialAccumulator;
  log: (msg: string) => void;
  assert: (condition: boolean, msg: string) => void;
  waitForUser: (instruction: string) => Promise<void>;
  waitForStatus: (
    status: ConnectionStatus,
    timeoutMs?: number,
    options?: { instruction?: string },
  ) => Promise<void>;
  fetchHex: (name: string) => Promise<string>;
}

export interface TestDef {
  name: string;
  instruction?: string;
  run: (ctx: TestContext) => Promise<void>;
}

export interface TestSuite {
  name: string;
  tests: TestDef[];
}

interface TestState {
  suite: string;
  def: TestDef;
  status: TestStatus;
  logs: Array<{ msg: string; level: "info" | "error" | "success" }>;
  el: {
    root: HTMLElement;
    status: HTMLElement;
    body: HTMLElement;
    logs: HTMLElement;
  };
}

export class TestRunner {
  private connection: MicrobitUSBConnection;
  private serial: SerialAccumulator;
  private container: HTMLElement;
  private tests: TestState[] = [];
  private running = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.connection = createUSBConnection({
      deviceSelectionMode: DeviceSelectionMode.UseAnyAllowed,
    });
    this.serial = new SerialAccumulator();
  }

  addSuite(suite: TestSuite): void {
    const header = document.createElement("div");
    header.className = "suite-header";

    const h2 = document.createElement("h2");
    h2.textContent = suite.name;
    header.appendChild(h2);

    const btn = document.createElement("button");
    btn.textContent = "Run";
    btn.addEventListener("click", () => {
      this.runSuite(suite.name);
    });
    header.appendChild(btn);

    this.container.appendChild(header);

    for (const def of suite.tests) {
      this.addTest(suite.name, def);
    }
  }

  private addTest(suite: string, def: TestDef): void {
    const root = document.createElement("div");
    root.className = "test";

    const headerEl = document.createElement("div");
    headerEl.className = "test-header";
    headerEl.setAttribute("role", "button");
    headerEl.setAttribute("tabindex", "0");
    headerEl.setAttribute("aria-expanded", "false");

    const statusEl = document.createElement("div");
    statusEl.className = "test-status";
    statusEl.setAttribute("aria-label", "pending");

    const nameEl = document.createElement("div");
    nameEl.className = "test-name";
    nameEl.textContent = def.name;

    headerEl.appendChild(statusEl);
    headerEl.appendChild(nameEl);

    const body = document.createElement("div");
    body.className = "test-body";
    body.id = `test-body-${this.tests.length}`;
    headerEl.setAttribute("aria-controls", body.id);

    const logs = document.createElement("div");
    body.appendChild(logs);

    const toggle = () => {
      const expanded = root.classList.toggle("expanded");
      headerEl.setAttribute("aria-expanded", String(expanded));
    };
    headerEl.addEventListener("click", toggle);
    headerEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });

    root.appendChild(headerEl);
    root.appendChild(body);
    this.container.appendChild(root);

    this.tests.push({
      suite,
      def,
      status: "pending",
      logs: [],
      el: { root, status: statusEl, body, logs },
    });
  }

  async runAll(): Promise<void> {
    await this.run(this.tests);
  }

  async runSuite(suiteName: string): Promise<void> {
    const tests = this.tests.filter((t) => t.suite === suiteName);
    if (tests.length === 0) {
      throw new Error(`No suite named "${suiteName}"`);
    }
    await this.run(tests);
  }

  private async run(tests: TestState[]): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Reset the tests we're about to run
    for (const test of tests) {
      this.setStatus(test, "pending");
      test.logs = [];
      test.el.body.innerHTML = "";
      const logs = document.createElement("div");
      test.el.body.appendChild(logs);
      test.el.logs = logs;
    }

    await this.connection.initialize();
    this.serial.attach(this.connection);

    try {
      for (const test of tests) {
        await this.runTest(test);
        if (test.status === "fail") {
          for (const remaining of tests.slice(tests.indexOf(test) + 1)) {
            this.setStatus(remaining, "skipped");
          }
          break;
        }
      }
    } finally {
      this.serial.detach(this.connection);
      this.running = false;
    }

    this.showSummary(tests);
  }

  private async runTest(test: TestState): Promise<void> {
    console.group(`${test.suite} > ${test.def.name}`);
    this.setStatus(test, "running");
    test.el.root.classList.add("expanded");

    const ctx: TestContext = {
      connection: this.connection,
      serial: this.serial,
      log: (msg: string) => this.appendLog(test, msg, "info"),
      assert: (condition: boolean, msg: string) => {
        if (!condition) {
          this.appendLog(test, `FAIL: ${msg}`, "error");
          throw new Error(`Assertion failed: ${msg}`);
        }
        this.appendLog(test, `PASS: ${msg}`, "success");
      },
      waitForUser: (instruction: string) =>
        this.waitForUser(test, instruction),
      waitForStatus: (
        status: ConnectionStatus,
        timeoutMs = 10_000,
        options?: { instruction?: string },
      ) => this.waitForConnectionStatus(test, status, timeoutMs, options),
      fetchHex: async (name: string) => {
        const resp = await fetch(`/hex-files/${name}`);
        if (!resp.ok) throw new Error(`Failed to fetch hex: ${name}`);
        return resp.text();
      },
    };

    try {
      await test.def.run(ctx);
      this.setStatus(test, "pass");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.appendLog(test, msg, "error");
      this.setStatus(test, "fail");
    }

    test.el.root.classList.remove("expanded");
    console.groupEnd();
  }

  private setStatus(test: TestState, status: TestStatus): void {
    test.status = status;
    const el = test.el.status;
    el.className = `test-status ${status}`;
    const icons: Record<TestStatus, string> = {
      pending: "",
      running: "...",
      pass: "\u2713",
      fail: "\u2717",
      skipped: "-",
    };
    el.textContent = icons[status];
    el.setAttribute("aria-label", status);
  }

  private appendLog(
    test: TestState,
    msg: string,
    level: "info" | "error" | "success",
  ): void {
    test.logs.push({ msg, level });
    if (level === "error") {
      console.error(msg);
    } else {
      console.log(msg);
    }
    const line = document.createElement("div");
    line.className = `log-line ${level}`;
    line.textContent = msg;
    test.el.logs.appendChild(line);
    line.scrollIntoView({ block: "nearest" });
  }

  private showPrompt(
    test: TestState,
    instruction: string,
    options?: { button?: string },
  ): { el: HTMLElement; done: () => void } {
    const el = document.createElement("div");
    el.className = "prompt";

    const label = document.createElement("div");
    label.className = "prompt-label";
    label.textContent = "Action required";
    el.appendChild(label);

    const text = document.createElement("div");
    text.textContent = instruction;
    el.appendChild(text);

    if (options?.button) {
      const btn = document.createElement("button");
      btn.className = "primary";
      btn.textContent = options.button;
      el.appendChild(btn);
    }

    test.el.logs.appendChild(el);
    el.scrollIntoView({ block: "nearest" });

    return {
      el,
      done: () => {
        el.classList.add("done");
      },
    };
  }

  private waitForUser(test: TestState, instruction: string): Promise<void> {
    return new Promise((resolve) => {
      const prompt = this.showPrompt(test, instruction, {
        button: "Continue",
      });
      const btn = prompt.el.querySelector("button")!;
      btn.addEventListener("click", () => {
        prompt.done();
        resolve();
      });
    });
  }

  private waitForConnectionStatus(
    test: TestState,
    target: ConnectionStatus,
    timeoutMs: number,
    options?: { instruction?: string },
  ): Promise<void> {
    if (this.connection.status === target) {
      return Promise.resolve();
    }
    const prompt = options?.instruction
      ? this.showPrompt(test, options.instruction)
      : undefined;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.connection.removeEventListener("status", listener);
        reject(
          new Error(
            `Timeout waiting for status ${target} (current: ${this.connection.status})`,
          ),
        );
      }, timeoutMs);

      const listener = (event: ConnectionStatusChange) => {
        if (event.status === target) {
          clearTimeout(timer);
          this.connection.removeEventListener("status", listener);
          prompt?.done();
          resolve();
        }
      };
      this.connection.addEventListener("status", listener);
    });
  }

  private showSummary(tests: TestState[]): void {
    const existing = this.container.querySelector(".summary");
    if (existing) existing.remove();

    const passed = tests.filter((t) => t.status === "pass").length;
    const failed = tests.filter((t) => t.status === "fail").length;
    const total = tests.length;

    const summaryText = `${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ""}`;
    console.log(`\n=== Summary: ${summaryText} ===`);
    let lastSuite = "";
    for (const test of tests) {
      if (test.suite !== lastSuite) {
        lastSuite = test.suite;
        console.log(`  ${test.suite}`);
      }
      const icon =
        test.status === "pass"
          ? "\u2713"
          : test.status === "fail"
            ? "\u2717"
            : "-";
      console.log(`    ${icon} ${test.def.name}`);
    }

    const el = document.createElement("div");
    el.className = "summary";
    el.textContent = summaryText;
    el.style.borderColor = failed > 0 ? "#ef4444" : "#22c55e";
    this.container.appendChild(el);
  }
}

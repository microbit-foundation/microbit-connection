import { describe, it, expect, vi, beforeEach } from "vitest";
import { type ArmDebug } from "./arm-debug.js";
import { type CmsisDap, type DAPOperation } from "./cmsis-dap.js";
import { DapError } from "./cmsis-dap.js";
import {
  CortexM,
  CoreRegister,
  DHCSR,
  DEMCR,
  NVIC_AIRCR,
  S_HALT,
  S_REGRDY,
  REGWnR,
} from "./cortex-m.js";

// ---------------------------------------------------------------------------
// Mock ADI
// ---------------------------------------------------------------------------

function createMockAdi() {
  const mem32: Map<number, number> = new Map();
  const writtenMem32: Array<{ address: number; value: number }> = [];

  const mockDap: CmsisDap = {
    isOpen: true,
    blockSize: 59,
    send: vi.fn(),
    clearAbort: vi.fn(),
    swjSequence: vi.fn(),
    swjClock: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    configureTransfer: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    transfer: vi.fn(),
    transferBlockRead: vi.fn(),
    transferBlockWrite: vi.fn(),
    drainStaleResponses: vi.fn(),
  };

  const mock: ArmDebug & {
    mem32: Map<number, number>;
    writtenMem32: Array<{ address: number; value: number }>;
    writtenBlocks: Array<{ address: number; values: Uint32Array }>;
    transferSequenceCalls: DAPOperation[][][];
  } = {
    dap: mockDap,
    get isOpen() {
      return true;
    },
    mem32,
    writtenMem32,
    writtenBlocks: [],
    transferSequenceCalls: [],

    readMem32: vi.fn(async (address: number) => {
      return mem32.get(address) ?? 0;
    }),
    writeMem32: vi.fn(async (address: number, value: number) => {
      writtenMem32.push({ address, value });
      mem32.set(address, value);
    }),
    readMem32Ops: vi.fn((address: number): DAPOperation[] => [
      { port: 0, mode: 0x02, register: 0, value: address },
    ]),
    writeMem32Ops: vi.fn((address: number, value: number): DAPOperation[] => [
      { port: 0, mode: 0x00, register: 0, value: address },
      { port: 0, mode: 0x00, register: 0, value },
    ]),
    readBlock: vi.fn(),
    writeBlock: vi.fn(async (address: number, values: Uint32Array) => {
      mock.writtenBlocks.push({ address, values });
    }),
    transferSequence: vi.fn(
      async (groups: DAPOperation[][]): Promise<Uint32Array> => {
        mock.transferSequenceCalls.push(groups);
        // Return S_REGRDY for readCoreRegister/writeCoreRegister
        return new Uint32Array([S_REGRDY, 0x42]);
      },
    ),
    resetState: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    reinit: vi.fn(),
  };

  return mock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CortexM", () => {
  let adi: ReturnType<typeof createMockAdi>;
  let cortex: CortexM;

  beforeEach(() => {
    adi = createMockAdi();
    cortex = new CortexM(adi);
  });

  describe("isHalted", () => {
    it("returns true when S_HALT is set", async () => {
      adi.mem32.set(DHCSR, S_HALT);
      expect(await cortex.isHalted()).toBe(true);
    });

    it("returns false when S_HALT is not set", async () => {
      adi.mem32.set(DHCSR, 0);
      expect(await cortex.isHalted()).toBe(false);
    });
  });

  describe("halt", () => {
    it("writes halt request to DHCSR", async () => {
      adi.mem32.set(DHCSR, 0); // not halted initially
      // After the write, simulate halted state for the wait
      vi.mocked(adi.writeMem32).mockImplementation(async (addr, val) => {
        adi.writtenMem32.push({ address: addr, value: val });
        if (addr === DHCSR) adi.mem32.set(DHCSR, S_HALT);
      });

      await cortex.halt();

      const dhcsrWrite = adi.writtenMem32.find((w) => w.address === DHCSR);
      expect(dhcsrWrite).toBeDefined();
      // Should have C_DEBUGEN and C_HALT bits set with DBGKEY
      expect(dhcsrWrite!.value & 0x03).toBe(0x03);
    });

    it("skips if already halted", async () => {
      adi.mem32.set(DHCSR, S_HALT);

      await cortex.halt();

      expect(adi.writeMem32).not.toHaveBeenCalled();
    });
  });

  describe("resume", () => {
    it("clears halt and enables debug", async () => {
      adi.mem32.set(DHCSR, S_HALT); // halted initially
      // After writes, simulate running state
      vi.mocked(adi.writeMem32).mockImplementation(async (addr, val) => {
        adi.writtenMem32.push({ address: addr, value: val });
        if (addr === DHCSR) adi.mem32.set(DHCSR, 0); // now running
      });

      await cortex.resume();

      // Should have written to DFSR and DHCSR
      expect(adi.writtenMem32.length).toBeGreaterThanOrEqual(2);
    });

    it("skips if not halted", async () => {
      adi.mem32.set(DHCSR, 0);

      await cortex.resume();

      expect(adi.writeMem32).not.toHaveBeenCalled();
    });
  });

  describe("readCoreRegister", () => {
    it("reads register via DCRSR/DCRDR sequence", async () => {
      const value = await cortex.readCoreRegister(CoreRegister.PC);

      expect(adi.transferSequence).toHaveBeenCalled();
      const groups = adi.transferSequenceCalls[0];
      // First group: write DCRSR with register index
      const dcrsrOps = groups[0];
      expect(dcrsrOps.some((op) => op.value === CoreRegister.PC)).toBe(true);
      // Return value comes from the result
      expect(value).toBe(0x42);
    });

    it("throws when S_REGRDY is not set", async () => {
      vi.mocked(adi.transferSequence).mockResolvedValueOnce(
        new Uint32Array([0, 0x42]),
      );

      await expect(cortex.readCoreRegister(CoreRegister.PC)).rejects.toThrow(
        DapError,
      );
    });
  });

  describe("writeCoreRegister", () => {
    it("writes register via DCRDR/DCRSR sequence", async () => {
      await cortex.writeCoreRegister(CoreRegister.SP, 0x20001000);

      expect(adi.transferSequence).toHaveBeenCalled();
      const groups = adi.transferSequenceCalls[0];
      // First group: write DCRDR with value
      const dcrdOps = groups[0];
      expect(dcrdOps.some((op) => op.value === 0x20001000)).toBe(true);
      // Second group: write DCRSR with register | REGWnR
      const dcrsrOps = groups[1];
      expect(
        dcrsrOps.some((op) => op.value === (CoreRegister.SP | REGWnR)),
      ).toBe(true);
    });

    it("throws when S_REGRDY is not set", async () => {
      vi.mocked(adi.transferSequence).mockResolvedValueOnce(
        new Uint32Array([0]),
      );

      await expect(
        cortex.writeCoreRegister(CoreRegister.SP, 0x20001000),
      ).rejects.toThrow(DapError);
    });
  });

  describe("softwareReset", () => {
    it("writes reset request to NVIC_AIRCR", async () => {
      // After reset, S_RESET_ST should clear
      adi.mem32.set(DHCSR, 0);

      await cortex.softwareReset();

      const aircrWrite = adi.writtenMem32.find((w) => w.address === NVIC_AIRCR);
      expect(aircrWrite).toBeDefined();
    });
  });

  describe("reset", () => {
    it("without halt: just does software reset", async () => {
      adi.mem32.set(DHCSR, 0);

      await cortex.reset(false);

      const aircrWrite = adi.writtenMem32.find((w) => w.address === NVIC_AIRCR);
      expect(aircrWrite).toBeDefined();
      // No DEMCR writes for non-halt reset
      const demcrWrite = adi.writtenMem32.find((w) => w.address === DEMCR);
      expect(demcrWrite).toBeUndefined();
    });

    it("with halt: sets vector catch, resets, waits for halt, restores DEMCR", async () => {
      // Start halted so halt() is a no-op
      adi.mem32.set(DHCSR, S_HALT);
      adi.mem32.set(DEMCR, 0);

      await cortex.reset(true);

      // Should have written DEMCR with VC_CORERESET
      const demcrWrites = adi.writtenMem32.filter((w) => w.address === DEMCR);
      expect(demcrWrites.length).toBeGreaterThanOrEqual(2);
      // First write enables VC_CORERESET (bit 0)
      expect(demcrWrites[0].value & 1).toBe(1);
      // Last write restores original DEMCR (0)
      expect(demcrWrites[demcrWrites.length - 1].value).toBe(0);
    });
  });

  describe("execute", () => {
    it("uploads code, sets registers, resumes, and waits for halt", async () => {
      // Start not halted, then halt when halt() is called
      adi.mem32.set(DHCSR, 0);
      vi.mocked(adi.writeMem32).mockImplementation(async (addr, val) => {
        adi.writtenMem32.push({ address: addr, value: val });
        if (addr === DHCSR) adi.mem32.set(DHCSR, S_HALT);
      });

      const code = new Uint32Array([0xbe00be00, 0x12345678]);

      await cortex.execute(
        0x20000000,
        code,
        0x20001000,
        0x20000005,
        0x20000001,
      );

      // Code uploaded via writeBlock
      expect(adi.writeBlock).toHaveBeenCalledWith(0x20000000, code);

      // Core registers set via transferSequence (PC, LR, SP, PSR = 4 writes)
      expect(adi.transferSequence).toHaveBeenCalled();
    });

    it("throws if too many general purpose registers", async () => {
      const code = new Uint32Array([0]);
      const tooMany = new Array(13).fill(0);

      await expect(
        cortex.execute(0x20000000, code, 0, 0, 0, ...tooMany),
      ).rejects.toThrow("Only 12 general purpose registers");
    });
  });
});

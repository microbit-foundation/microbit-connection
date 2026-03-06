import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import MemoryMap from "nrf-intel-hex";
import {
  isUniversalHex,
  separateUniversalHex,
} from "@microbit/microbit-universal-hex";
import { findMakeCodeRegionInMemoryMap } from "./flashing-makecode.js";
import { RegionInfo } from "../services/partial-flashing-service.js";
import { truncateHexAfterEof } from "../../hex-util.js";

const hexDir = resolve(__dirname, "../../../examples");

const loadHex = (name: string) => readFileSync(resolve(hexDir, name), "utf-8");

/**
 * Load a hex file, separate if universal, and return parsed MemoryMaps
 * keyed by board ID (or 0 for thin hex).
 */
const loadParsedHex = (
  name: string,
): { boardId: number; memoryMap: MemoryMap }[] => {
  const raw = loadHex(name);
  if (isUniversalHex(raw)) {
    return separateUniversalHex(raw).map((p) => ({
      boardId: p.boardId,
      memoryMap: MemoryMap.fromHex(p.hex),
    }));
  }
  return [
    { boardId: 0, memoryMap: MemoryMap.fromHex(truncateHexAfterEof(raw)) },
  ];
};

const fullFlashRegion = (end: number): RegionInfo => ({
  start: 0,
  end,
  hash: "",
});

// All example hex files with expected regions per board
const hexFiles = [
  {
    // v0 embeds source directly in the flash binary (JSON + LZMA at ~0x315f0)
    // rather than in custom Intel HEX record type 0x0E like later versions.
    name: "microbit-small-heart-makecode-v0.hex",
    label: "MakeCode v0",
    universal: false,
    regions: [
      {
        boardId: 0,
        start: 0x30c00,
        end: 0x3fc40,
        hash: "AB433FFB2EC06262",
        appHash: "653E46119D3A701B",
      },
    ],
  },
  {
    name: "microbit-small-heart-makecode-v1.hex",
    label: "MakeCode v1",
    universal: false,
    regions: [
      {
        boardId: 0,
        start: 0x32c00,
        end: 0x3fc40,
        hash: "13FC432659DAE036",
        appHash: "579ACD9774545DAA",
      },
    ],
  },
  {
    name: "microbit-small-heart-makecode-v2.hex",
    label: "MakeCode v2",
    universal: false,
    regions: [
      {
        boardId: 0,
        start: 0x34800,
        end: 0x3fc40,
        hash: "02F597B8CE253C03",
        appHash: "AF81BA51A0E7E921",
      },
    ],
  },
  {
    name: "microbit-small-heart-makecode-v3.hex",
    label: "MakeCode v3",
    universal: true,
    regions: [
      {
        boardId: 0x9901,
        start: 0x35000,
        end: 0x3fc40,
        hash: "4F4FD28A88324C7E",
        appHash: "C1008100AB00DD00",
      },
      {
        boardId: 0x9903,
        start: 0x45000,
        end: 0x7f340,
        hash: "FFC95E6502F1C747",
        appHash: "DB0013005900BE00",
      },
    ],
  },
  {
    name: "microbit-small-heart-makecode-v4.hex",
    label: "MakeCode v4",
    universal: true,
    regions: [
      {
        boardId: 0x9901,
        start: 0x35000,
        end: 0x3fc40,
        hash: "02E34856C566087A",
        appHash: "54005A00F1008000",
      },
      {
        boardId: 0x9903,
        start: 0x47000,
        end: 0x7f340,
        hash: "8E4D117FB81B2B19",
        appHash: "39006F00D900A600",
      },
    ],
  },
  {
    name: "microbit-small-heart-makecode-v5.hex",
    label: "MakeCode v5",
    universal: true,
    regions: [
      {
        boardId: 0x9900,
        start: 0x36800,
        end: 0x3fc40,
        hash: "FFDA7A967870CC1B",
        appHash: "E4006A0031002200",
      },
      {
        boardId: 0x9903,
        start: 0x47000,
        end: 0x7f340,
        hash: "3BD7683DA9B220E8",
        appHash: "3E003800AF001600",
      },
    ],
  },
  {
    name: "microbit-small-heart-makecode-v6.hex",
    label: "MakeCode v6",
    universal: true,
    regions: [
      {
        boardId: 0x9900,
        start: 0x35400,
        end: 0x3fc40,
        hash: "F4B5733CAAC69708",
        appHash: "78005900AB000900",
      },
      {
        boardId: 0x9903,
        start: 0x47000,
        end: 0x7f340,
        hash: "890F5019E604A158",
        appHash: "E300B400A6003100",
      },
    ],
  },
  {
    name: "microbit-small-heart-makecode-v7.hex",
    label: "MakeCode v7",
    universal: true,
    regions: [
      {
        boardId: 0x9900,
        start: 0x35400,
        end: 0x3fc40,
        hash: "F87DD6F924D49825",
        appHash: "2B00EF0092003900",
      },
      {
        boardId: 0x9903,
        start: 0x47000,
        end: 0x7f340,
        hash: "42B6FF95F591DA1F",
        appHash: "9100F3005800E800",
      },
    ],
  },
  {
    name: "microbit-small-heart-makecode-v8.hex",
    label: "MakeCode v8",
    universal: true,
    regions: [
      {
        boardId: 0x9900,
        start: 0x35400,
        end: 0x3fc40,
        hash: "8E76592A9CB06B29",
        appHash: "8300A70050005500",
      },
      {
        boardId: 0x9903,
        start: 0x47000,
        end: 0x7f340,
        hash: "22204AC874977E7F",
        appHash: "900022002E00BE00",
      },
    ],
  },
];

describe("findMakeCodeRegionInMemoryMap", () => {
  for (const { name, label, universal, regions } of hexFiles) {
    describe(label, () => {
      const parts = loadParsedHex(name);

      if (!universal) {
        it("is a non-universal (thin) hex", () => {
          expect(isUniversalHex(loadHex(name))).toBe(false);
        });
      }

      for (const expected of regions) {
        const part = parts.find((p) => p.boardId === expected.boardId);
        const isV2Board =
          expected.boardId === 0x9903 || expected.boardId === 0x9904;
        const boardLabel =
          expected.boardId === 0
            ? "thin V1"
            : `boardId=0x${expected.boardId.toString(16)}`;
        const flashEnd = isV2Board ? 0x80000 : 0x40000;

        it(`finds the MakeCode region (${boardLabel})`, () => {
          expect(part).toBeDefined();
          const region = findMakeCodeRegionInMemoryMap(
            part!.memoryMap,
            fullFlashRegion(flashEnd),
          );
          expect(region).toEqual({
            start: expected.start,
            end: expected.end,
            hash: expected.hash,
            appHash: expected.appHash,
          });
        });
      }
    });
  }

  describe("thin hex EOF truncation", () => {
    const thinFiles = hexFiles.filter((f) => !f.universal);

    for (const { name, label } of thinFiles) {
      it(`${label} raw hex has data after EOF that MemoryMap.fromHex rejects`, () => {
        const raw = loadHex(name);
        expect(() => MemoryMap.fromHex(raw)).toThrow(/after.*EOF/i);
      });

      it(`${label} can be parsed after truncating at EOF`, () => {
        const parts = loadParsedHex(name);
        expect(parts).toHaveLength(1);
        expect(parts[0].memoryMap).toBeInstanceOf(MemoryMap);
      });
    }
  });
});

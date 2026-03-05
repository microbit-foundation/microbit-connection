/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */

export const read32FromUInt8Array = (data: Uint8Array, i: number): number => {
  return (
    (data[i] |
      (data[i + 1] << 8) |
      (data[i + 2] << 16) |
      (data[i + 3] << 24)) >>>
    0
  );
};

// Returns the MurmurHash of the data passed to it, used for checksum calculation.
// Drawn from https://github.com/microsoft/pxt-microbit/blob/dec5b8ce72d5c2b4b0b20aafefce7474a6f0c7b2/editor/extension.tsx#L14
export const murmur3_core = (data: Uint8Array): [number, number] => {
  let h0 = 0x2f9be6cc;
  let h1 = 0x1ec3a6c8;

  for (let i = 0; i < data.byteLength; i += 4) {
    let k = read32FromUInt8Array(data, i) >>> 0;
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);

    h0 ^= k;
    h1 ^= k;
    h0 = (h0 << 13) | (h0 >>> 19);
    h1 = (h1 << 13) | (h1 >>> 19);
    h0 = (Math.imul(h0, 5) + 0xe6546b64) >>> 0;
    h1 = (Math.imul(h1, 5) + 0xe6546b64) >>> 0;
  }
  return [h0, h1];
};

export class Page {
  constructor(
    readonly targetAddr: number,
    readonly data: Uint8Array,
  ) {}
}

// Split buffer into pages, each of pageSize size.
// Drawn from https://github.com/microsoft/pxt-microbit/blob/dec5b8ce72d5c2b4b0b20aafefce7474a6f0c7b2/editor/extension.tsx#L209
export const pageAlignBlocks = (
  buffer: Uint8Array,
  targetAddr: number,
  pageSize: number,
): Page[] => {
  let unaligned = new Uint8Array(buffer);
  let pages = [];
  for (let i = 0; i < unaligned.byteLength; ) {
    let newbuf = new Uint8Array(pageSize).fill(0xff);
    let startPad = (targetAddr + i) & (pageSize - 1);
    let newAddr = targetAddr + i - startPad;
    for (; i < unaligned.byteLength; ++i) {
      if (targetAddr + i >= newAddr + pageSize) break;
      newbuf[targetAddr + i - newAddr] = unaligned[i];
    }
    let page = new Page(newAddr, newbuf);
    pages.push(page);
  }
  return pages;
};

// Filter out all pages whose calculated checksum matches the corresponding checksum passed as an argument.
// Drawn from https://github.com/microsoft/pxt-microbit/blob/dec5b8ce72d5c2b4b0b20aafefce7474a6f0c7b2/editor/extension.tsx#L523
export const onlyChanged = (
  pages: Page[],
  checksums: Uint32Array,
  pageSize: number,
): Page[] => {
  return pages.filter((page) => {
    let idx = page.targetAddr / pageSize;
    if (idx * 2 + 2 > checksums.length) return true; // out of range?
    let c0 = checksums[idx * 2];
    let c1 = checksums[idx * 2 + 1];
    let ch = murmur3_core(page.data);
    if (c0 === ch[0] && c1 === ch[1]) return false;
    return true;
  });
};

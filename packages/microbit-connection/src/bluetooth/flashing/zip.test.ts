import { execSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createZip } from "./zip.js";

const isWindows = process.platform === "win32";

describe.skipIf(isWindows)("createZip", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "zip-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const unzip = (zipPath: string, outDir: string) => {
    execSync(`unzip -o "${zipPath}" -d "${outDir}"`, { stdio: "pipe" });
  };

  it("creates a valid ZIP with a single text file", () => {
    const content = "Hello, World!";
    const encoder = new TextEncoder();
    const zip = createZip([
      { name: "hello.txt", data: encoder.encode(content) },
    ]);

    const zipPath = join(tempDir, "test.zip");
    const outDir = join(tempDir, "out");
    writeFileSync(zipPath, zip);
    unzip(zipPath, outDir);

    const extracted = readFileSync(join(outDir, "hello.txt"), "utf-8");
    expect(extracted).toBe(content);
  });

  it("creates a valid ZIP with multiple files", () => {
    const encoder = new TextEncoder();
    const files = [
      { name: "file1.txt", content: "First file content" },
      { name: "file2.txt", content: "Second file content" },
      { name: "data.json", content: '{"key": "value"}' },
    ];

    const zip = createZip(
      files.map((f) => ({ name: f.name, data: encoder.encode(f.content) })),
    );

    const zipPath = join(tempDir, "test.zip");
    const outDir = join(tempDir, "out");
    writeFileSync(zipPath, zip);
    unzip(zipPath, outDir);

    for (const file of files) {
      const extracted = readFileSync(join(outDir, file.name), "utf-8");
      expect(extracted).toBe(file.content);
    }
  });

  it("creates a valid ZIP with binary data", () => {
    const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
    const zip = createZip([{ name: "binary.bin", data: binaryData }]);

    const zipPath = join(tempDir, "test.zip");
    const outDir = join(tempDir, "out");
    writeFileSync(zipPath, zip);
    unzip(zipPath, outDir);

    const extracted = new Uint8Array(readFileSync(join(outDir, "binary.bin")));
    expect(extracted).toEqual(binaryData);
  });

  it("creates a valid ZIP with empty file", () => {
    const zip = createZip([{ name: "empty.txt", data: new Uint8Array(0) }]);

    const zipPath = join(tempDir, "test.zip");
    const outDir = join(tempDir, "out");
    writeFileSync(zipPath, zip);
    unzip(zipPath, outDir);

    const extracted = readFileSync(join(outDir, "empty.txt"));
    expect(extracted.length).toBe(0);
  });

  it("creates a valid ZIP matching DFU package structure", () => {
    const encoder = new TextEncoder();
    const appBin = new Uint8Array(1024).fill(0xab);
    const appDat = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const manifest = JSON.stringify({
      manifest: {
        application: {
          bin_file: "application.bin",
          dat_file: "application.dat",
        },
      },
    });

    const zip = createZip([
      { name: "application.dat", data: appDat },
      { name: "application.bin", data: appBin },
      { name: "manifest.json", data: encoder.encode(manifest) },
    ]);

    const zipPath = join(tempDir, "dfu.zip");
    const outDir = join(tempDir, "out");
    writeFileSync(zipPath, zip);
    unzip(zipPath, outDir);

    expect(
      new Uint8Array(readFileSync(join(outDir, "application.dat"))),
    ).toEqual(appDat);
    expect(
      new Uint8Array(readFileSync(join(outDir, "application.bin"))),
    ).toEqual(appBin);
    expect(readFileSync(join(outDir, "manifest.json"), "utf-8")).toBe(manifest);
  });
});

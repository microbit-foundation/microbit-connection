/**
 * Minimal ZIP file creator using STORE method (no compression).
 * Sufficient for creating Nordic DFU packages.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Creates a ZIP file containing the given entries with no compression.
 */
export function createZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();

  // Calculate total size needed
  let totalSize = 22; // End of central directory
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    totalSize += 30 + nameBytes.length + entry.data.length; // Local file header + data
    totalSize += 46 + nameBytes.length; // Central directory entry
  }

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let localOffset = 0;
  const centralDirectoryEntries: Array<{
    nameBytes: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  }> = [];

  // Write local file headers and data
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const fileOffset = localOffset;

    // Local file header signature
    view.setUint32(localOffset, 0x04034b50, true);
    localOffset += 4;

    // Version needed to extract (2.0)
    view.setUint16(localOffset, 20, true);
    localOffset += 2;

    // General purpose bit flag
    view.setUint16(localOffset, 0, true);
    localOffset += 2;

    // Compression method (0 = STORE)
    view.setUint16(localOffset, 0, true);
    localOffset += 2;

    // Last mod file time (0)
    view.setUint16(localOffset, 0, true);
    localOffset += 2;

    // Last mod file date (0)
    view.setUint16(localOffset, 0, true);
    localOffset += 2;

    // CRC-32
    view.setUint32(localOffset, crc, true);
    localOffset += 4;

    // Compressed size (same as uncompressed for STORE)
    view.setUint32(localOffset, entry.data.length, true);
    localOffset += 4;

    // Uncompressed size
    view.setUint32(localOffset, entry.data.length, true);
    localOffset += 4;

    // File name length
    view.setUint16(localOffset, nameBytes.length, true);
    localOffset += 2;

    // Extra field length
    view.setUint16(localOffset, 0, true);
    localOffset += 2;

    // File name
    bytes.set(nameBytes, localOffset);
    localOffset += nameBytes.length;

    // File data
    bytes.set(entry.data, localOffset);
    localOffset += entry.data.length;

    centralDirectoryEntries.push({
      nameBytes,
      crc,
      size: entry.data.length,
      offset: fileOffset,
    });
  }

  const centralDirectoryOffset = localOffset;

  // Write central directory
  for (const entry of centralDirectoryEntries) {
    // Central file header signature
    view.setUint32(localOffset, 0x02014b50, true);
    localOffset += 4;

    // Version made by (2.0, DOS)
    view.setUint16(localOffset, 20, true);
    localOffset += 2;

    // Version needed to extract (2.0)
    view.setUint16(localOffset, 20, true);
    localOffset += 2;

    // General purpose bit flag
    view.setUint16(localOffset, 0, true);
    localOffset += 2;

    // Compression method (0 = STORE)
    view.setUint16(localOffset, 0, true);
    localOffset += 2;

    // Last mod file time
    view.setUint16(localOffset, 0, true);
    localOffset += 2;

    // Last mod file date
    view.setUint16(localOffset, 0, true);
    localOffset += 2;

    // CRC-32
    view.setUint32(localOffset, entry.crc, true);
    localOffset += 4;

    // Compressed size
    view.setUint32(localOffset, entry.size, true);
    localOffset += 4;

    // Uncompressed size
    view.setUint32(localOffset, entry.size, true);
    localOffset += 4;

    // File name length
    view.setUint16(localOffset, entry.nameBytes.length, true);
    localOffset += 2;

    // Extra field length
    view.setUint16(localOffset, 0, true);
    localOffset += 2;

    // File comment length
    view.setUint16(localOffset, 0, true);
    localOffset += 2;

    // Disk number start
    view.setUint16(localOffset, 0, true);
    localOffset += 2;

    // Internal file attributes
    view.setUint16(localOffset, 0, true);
    localOffset += 2;

    // External file attributes
    view.setUint32(localOffset, 0, true);
    localOffset += 4;

    // Relative offset of local header
    view.setUint32(localOffset, entry.offset, true);
    localOffset += 4;

    // File name
    bytes.set(entry.nameBytes, localOffset);
    localOffset += entry.nameBytes.length;
  }

  const centralDirectorySize = localOffset - centralDirectoryOffset;

  // End of central directory record
  // Signature
  view.setUint32(localOffset, 0x06054b50, true);
  localOffset += 4;

  // Number of this disk
  view.setUint16(localOffset, 0, true);
  localOffset += 2;

  // Disk where central directory starts
  view.setUint16(localOffset, 0, true);
  localOffset += 2;

  // Number of central directory records on this disk
  view.setUint16(localOffset, entries.length, true);
  localOffset += 2;

  // Total number of central directory records
  view.setUint16(localOffset, entries.length, true);
  localOffset += 2;

  // Size of central directory
  view.setUint32(localOffset, centralDirectorySize, true);
  localOffset += 4;

  // Offset of start of central directory
  view.setUint32(localOffset, centralDirectoryOffset, true);
  localOffset += 4;

  // Comment length
  view.setUint16(localOffset, 0, true);

  return bytes;
}

// CRC-32 lookup table
const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crc32Table[i] = c;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crc32Table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

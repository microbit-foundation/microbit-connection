// MakeCode hex files may contain embedded source in custom record types
// (type 0x0E) after the EOF record, and older files may have trailing blank
// lines. The nrf-intel-hex parser rejects any data after EOF, so we truncate.
export const truncateHexAfterEof = (hex: string): string => {
  // The EOF record is :00000001FF (case-insensitive per the Intel HEX spec).
  const eofIdx = hex.search(/:00000001FF/i);
  if (eofIdx < 0) return hex;
  return hex.slice(0, eofIdx + ":00000001FF".length) + "\n";
};

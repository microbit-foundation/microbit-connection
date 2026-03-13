import { useState } from "react";

const ledGridLetters: string[][] = [
  ["t", "a", "t", "a", "t"],
  ["p", "e", "p", "e", "p"],
  ["g", "i", "g", "i", "g"],
  ["v", "o", "v", "o", "v"],
  ["z", "u", "z", "u", "z"],
];

interface BluetoothPatternInputProps {
  onDeviceNameChange: (deviceName: string) => void;
  initialValue?: string;
}

const findRowForChar = (char: string, colIdx: number): number => {
  for (let rowIdx = 0; rowIdx < ledGridLetters.length; rowIdx++) {
    if (ledGridLetters[rowIdx][colIdx] === char) {
      return rowIdx;
    }
  }
  return 5;
};

const BluetoothPatternInput = ({
  onDeviceNameChange,
  initialValue,
}: BluetoothPatternInputProps) => {
  const [deviceChars, setDeviceChars] = useState<string[]>(() => {
    if (initialValue && initialValue.length === 5) {
      return initialValue.split("");
    }
    return Array(5).fill("");
  });

  const [activeRows, setActiveRows] = useState<number[]>(() => {
    if (initialValue && initialValue.length === 5) {
      const chars = initialValue.split("");
      return chars.map((char, colIdx) => findRowForChar(char, colIdx));
    }
    return Array(5).fill(5);
  });

  return (
    <div
      className="pattern-grid"
      role="group"
      aria-label="Bluetooth pairing pattern. Select one cell per column to match the pattern on your micro:bit."
    >
      {ledGridLetters.map((row, rowIdx) =>
        row.map((_letter, colIdx) => {
          const isLit = rowIdx >= activeRows[colIdx];
          return (
            <button
              key={`${rowIdx}${colIdx}`}
              className={`pattern-cell ${isLit ? "lit" : "unlit"}`}
              aria-label={`Column ${colIdx + 1}, row ${rowIdx + 1}${isLit ? ", selected" : ""}`}
              aria-pressed={isLit}
              onClick={() => {
                const newActiveRows = [...activeRows];
                newActiveRows[colIdx] = rowIdx;
                setActiveRows(newActiveRows);

                const newDeviceChars = [...deviceChars];
                newDeviceChars[colIdx] = ledGridLetters[rowIdx][colIdx];
                setDeviceChars(newDeviceChars);
                onDeviceNameChange(newDeviceChars.join(""));
              }}
            />
          );
        }),
      )}
      {deviceChars.map((c, ci) => (
        <div key={ci} className="pattern-char" aria-hidden="true">
          {c}
        </div>
      ))}
    </div>
  );
};

export default BluetoothPatternInput;

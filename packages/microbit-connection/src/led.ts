type FixedArray<T, L extends number> = T[] & { length: L };
type LedRow = FixedArray<boolean, 5>;
export type LedMatrix = FixedArray<LedRow, 5>;

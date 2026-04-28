interface LedGridProps {
  /** 5x5 boolean grid, row-major. */
  grid: boolean[][];
  /** Called when a cell is toggled. */
  onToggle?: (row: number, col: number) => void;
  /** Cell size in px. Defaults to 44. */
  cellSize?: number;
  /** Gap between cells in px. Defaults to 4. */
  gap?: number;
}

const LedGrid = ({ grid, onToggle, cellSize = 44, gap = 4 }: LedGridProps) => {
  return (
    <div
      className="led-grid"
      role="group"
      aria-label="5 by 5 LED grid"
      style={{
        gridTemplateColumns: `repeat(5, ${cellSize}px)`,
        gridTemplateRows: `repeat(5, ${cellSize}px)`,
        gap,
      }}
    >
      {grid.map((row, rowIdx) =>
        row.map((lit, colIdx) => (
          <button
            key={`${rowIdx}-${colIdx}`}
            className={`pattern-cell ${lit ? "lit" : "unlit"}`}
            aria-label={`Column ${colIdx + 1}, row ${rowIdx + 1}${lit ? ", on" : ", off"}`}
            aria-pressed={lit}
            onClick={() => onToggle?.(rowIdx, colIdx)}
          />
        )),
      )}
    </div>
  );
};

export default LedGrid;

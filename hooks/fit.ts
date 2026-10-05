// A terminal cell is roughly twice as tall as it is wide.
export const CELL_ASPECT = 2
// Smallest number of image pixels per cell column, so small images are not blown up.
const MIN_PIXELS_PER_COLUMN = 8

export type Cells = { columns: number; rows: number }

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value))

/**
 * The box of cells that shows a `width` x `height` pixel image at its own
 * proportions, no wider than `maxColumns` and no taller than `maxRows`.
 */
export function fitCells(
  width: number,
  height: number,
  maxColumns: number,
  maxRows: number,
): Cells {
  let columns = Math.min(maxColumns, Math.max(1, Math.round(width / MIN_PIXELS_PER_COLUMN)))
  let rows = Math.round((columns * height) / width / CELL_ASPECT)
  if (rows > maxRows) {
    rows = maxRows
    columns = Math.round((rows * CELL_ASPECT * width) / height)
  }

  return { columns: clamp(columns, 1, 255), rows: clamp(rows, 1, 255) }
}

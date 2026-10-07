/** The same drag positions a lone image inside its row, then moves it outside.
 * Match upstream's 4 px minimum free space; a full-width item must remain movable. */
export function mediaItemDragMode(single: boolean, free: number, row: { top: number; bottom: number } | null | undefined, y: number): 'position' | 'move' {
  return single && free >= 4 && row && y >= row.top && y <= row.bottom ? 'position' : 'move';
}

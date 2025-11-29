import type { CliNode, TextStyle } from '../../types.js';
import type { GridCell } from '../types.js';
import { ANSI } from '../../style/colors.js';
import { getStyleCodes, stylesEqual } from '../styles.js';
import { log } from '../../logger.js';

interface FrameCache {
    grid: GridCell[][];
    statusLine?: string;
}

const PREVIOUS_FRAMES = new WeakMap<CliNode, FrameCache>();

/** Rows that must be re-rendered regardless of diff (e.g., under moved images). */
let dirtyRows: Set<number> = new Set();

/**
 * Mark rows as dirty so they will be re-rendered even if grid content hasn't changed.
 * Used when images move to ensure the content behind old image positions is re-sent.
 * @param rows - Row indices to mark as dirty.
 */
export function markRowsDirty(rows: number[]): void {
    for (const row of rows) {
        dirtyRows.add(row);
    }
}

/**
 * Clear all dirty row markers. Called after serialization.
 */
export function clearDirtyRows(): void {
    dirtyRows.clear();
}

/**
 * Get current dirty rows.
 */
export function getDirtyRows(): Set<number> {
    return dirtyRows;
}

export function diffAndSerialize(root: CliNode, grid: GridCell[][], statusLine?: string): string {
    log('diffAndSerialize:enter', { 
        gridRows: grid?.length, 
        gridCols: grid?.[0]?.length,
        hasGrid: !!grid,
        firstRowValid: !!grid?.[0]
    });
    
    const prev = PREVIOUS_FRAMES.get(root);
    const width = grid[0]?.length ?? 0;
    const height = grid.length;
    const needsFullRedraw =
        !prev || prev.grid.length !== height || (height > 0 && prev.grid[0]?.length !== width);

    log('diffAndSerialize:setup', { width, height, needsFullRedraw, hasPrev: !!prev });

    // Note: Cursor visibility is managed by renderToString, not here
    let output = '';

    if (needsFullRedraw) {
        log('diffAndSerialize:fullRedraw');
        output += ANSI.CLEAR_SCREEN;
        output += serializeAllRows(grid);
        log('diffAndSerialize:fullRedraw:done');
    } else if (prev) {
        log('diffAndSerialize:diff');
        output += serializeDiffRows(grid, prev.grid);
        log('diffAndSerialize:diff:done');
    }

    if (statusLine !== undefined) {
        const prevStatus = prev?.statusLine;
        if (needsFullRedraw || statusLine !== prevStatus) {
            output += ANSI.MOVE_TO(0, height);
            const line = statusLine.slice(0, width);
            output += line.padEnd(width, ' ');
            output += ANSI.RESET;
        }
    } else if (prev?.statusLine) {
        output += ANSI.MOVE_TO(0, height);
        output += ANSI.CLEAR_LINE;
    }

    PREVIOUS_FRAMES.set(root, {
        grid: cloneGrid(grid),
        statusLine,
    });

    log('diffAndSerialize:exit');
    return output;
}

function serializeAllRows(grid: GridCell[][]): string {
    log('serializeAllRows:enter', { rows: grid?.length });
    let output = '';
    for (let y = 0; y < grid.length; y++) {
        const row = grid[y];
        if (!row) {
            log('serializeAllRows:nullRow', { y });
            continue;
        }
        output += ANSI.MOVE_TO(0, y);
        output += renderRow(row);
    }
    log('serializeAllRows:exit');
    return output;
}

function serializeDiffRows(next: GridCell[][], prev: GridCell[][]): string {
    let output = '';
    const rows = Math.max(next.length, prev.length);
    for (let y = 0; y < rows; y++) {
        const nextRow = next[y];
        const prevRow = prev[y];
        
        // Force re-render if row is marked dirty (e.g., image moved away from this row)
        const isDirty = dirtyRows.has(y);
        
        if (!nextRow || !prevRow) {
            output += ANSI.MOVE_TO(0, y);
            output += ANSI.CLEAR_LINE;
            if (nextRow) {
                output += renderRow(nextRow);
            }
            continue;
        }
        if (isDirty || !rowsEqual(nextRow, prevRow)) {
            output += ANSI.MOVE_TO(0, y);
            output += ANSI.CLEAR_LINE;
            output += renderRow(nextRow);
        }
    }
    
    // Clear dirty rows after processing
    clearDirtyRows();
    
    return output;
}

function rowsEqual(a: GridCell[], b: GridCell[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].char !== b[i].char) return false;
        if (!stylesEqual(a[i].style, b[i].style)) return false;
    }
    return true;
}

function renderRow(cells: GridCell[]): string {
    let line = '';
    let currentStyle: TextStyle | undefined = undefined;

    for (const cell of cells) {
        const styleChanged = !stylesEqual(currentStyle, cell.style);
        if (styleChanged) {
            if (cell.style) {
                line += getStyleCodes(cell.style, currentStyle);
                currentStyle = cell.style;
            } else {
                // Reset immediately when transitioning to unstyled cells
                // This ensures backgrounds don't bleed into subsequent cells
                line += ANSI.RESET;
                currentStyle = undefined;
            }
        }
        line += cell.char;
    }

    // Reset at end of line if we have an active style
    if (currentStyle) {
        line += ANSI.RESET;
    }

    return line;
}

function cloneGrid(grid: GridCell[][]): GridCell[][] {
    return grid.map(row =>
        row.map(cell => ({
            char: cell.char,
            style: cell.style ? { ...cell.style } : undefined,
        }))
    );
}




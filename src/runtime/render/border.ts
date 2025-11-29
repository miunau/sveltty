/**
 * Border rendering for CLI elements.
 * 
 * Styling is driven by computed CSS styles. Border color, style, and background
 * come from the style parameter which has already been resolved by the stylesheet
 * (including :focus, :disabled pseudo-class states).
 */
import type { BorderStyle, CliNode, Style } from '../types.js';
import type { ClipRect, GridCell } from './types.js';
import { setCell } from './utils.js';

export function renderBorder(
    node: CliNode,
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    style: Style,
    clip?: ClipRect
): void {
    // Border style comes from computed CSS - defaults to 'single' if not specified
    const borderStyle = style.borderStyle || 'single';
    if (borderStyle === 'none') return;

    const chars = getBorderChars(borderStyle);

    // Border color from computed CSS - defaults to ButtonBorder system color
    const borderColor = style.borderColor;
    const fallbackBg = style.borderBackgroundColor ?? style.borderBg;
    const topBg = style.borderTopBackgroundColor ?? fallbackBg;
    const rightBg = style.borderRightBackgroundColor ?? fallbackBg;
    const bottomBg = style.borderBottomBackgroundColor ?? fallbackBg;
    const leftBg = style.borderLeftBackgroundColor ?? fallbackBg;
    const styles = {
        top: makeBorderStyle(borderColor, topBg, fallbackBg),
        right: makeBorderStyle(borderColor, rightBg, fallbackBg),
        bottom: makeBorderStyle(borderColor, bottomBg, fallbackBg),
        left: makeBorderStyle(borderColor, leftBg, fallbackBg),
        topLeft: makeBorderStyle(
            borderColor,
            style.borderTopLeftBackgroundColor ?? topBg ?? leftBg ?? fallbackBg,
            fallbackBg
        ),
        topRight: makeBorderStyle(
            borderColor,
            style.borderTopRightBackgroundColor ?? topBg ?? rightBg ?? fallbackBg,
            fallbackBg
        ),
        bottomLeft: makeBorderStyle(
            borderColor,
            style.borderBottomLeftBackgroundColor ?? bottomBg ?? leftBg ?? fallbackBg,
            fallbackBg
        ),
        bottomRight: makeBorderStyle(
            borderColor,
            style.borderBottomRightBackgroundColor ?? bottomBg ?? rightBg ?? fallbackBg,
            fallbackBg
        ),
    };

    const x1 = Math.floor(x);
    const y1 = Math.floor(y);
    const x2 = Math.floor(x + width) - 1;
    const y2 = Math.floor(y + height) - 1;

    // Clip bounds (default to grid bounds if no clip provided)
    const clipX1 = clip ? Math.floor(clip.x1) : 0;
    const clipY1 = clip ? Math.floor(clip.y1) : 0;
    const clipX2 = clip ? Math.ceil(clip.x2) : grid[0]?.length ?? 0;
    const clipY2 = clip ? Math.ceil(clip.y2) : grid.length;

    // Helper to check if a cell is within clip bounds
    const inClip = (row: number, col: number): boolean => {
        return row >= clipY1 && row < clipY2 && col >= clipX1 && col < clipX2;
    };

    // Draw corners
    if (y1 >= 0 && y1 < grid.length && x1 >= 0 && x1 < grid[0].length && inClip(y1, x1)) {
        setCell(grid, y1, x1, chars.topLeft, styles.topLeft);
    }

    if (y1 >= 0 && y1 < grid.length && x2 >= 0 && x2 < grid[0].length && inClip(y1, x2)) {
        setCell(grid, y1, x2, chars.topRight, styles.topRight);
    }

    if (y2 >= 0 && y2 < grid.length) {
        if (x1 >= 0 && x1 < grid[0].length && inClip(y2, x1)) {
            setCell(grid, y2, x1, chars.bottomLeft, styles.bottomLeft);
        }

        if (x2 >= 0 && x2 < grid[0].length && inClip(y2, x2)) {
            setCell(grid, y2, x2, chars.bottomRight, styles.bottomRight);
        }
    }

    // Draw horizontal lines
    for (let col = x1 + 1; col < x2; col++) {
        if (col >= 0 && col < grid[0].length) {
            if (y1 >= 0 && y1 < grid.length && inClip(y1, col)) {
                setCell(grid, y1, col, chars.horizontal, styles.top);
            }

            if (y2 >= 0 && y2 < grid.length && inClip(y2, col)) {
                setCell(grid, y2, col, chars.horizontal, styles.bottom);
            }
        }
    }

    // Draw vertical lines
    for (let row = y1 + 1; row < y2; row++) {
        if (row >= 0 && row < grid.length) {
            if (x1 >= 0 && x1 < grid[0].length && inClip(row, x1)) {
                setCell(grid, row, x1, chars.vertical, styles.left);
            }

            if (x2 >= 0 && x2 < grid[0].length && inClip(row, x2)) {
                setCell(grid, row, x2, chars.vertical, styles.right);
            }
        }
    }
}

export interface BorderChars {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
    horizontal: string;
    vertical: string;
    /** T-junction pointing right (left edge, connects to box on right) */
    teeRight: string;
    /** T-junction pointing left (right edge, connects to box on left) */
    teeLeft: string;
    /** T-junction pointing down (top edge, connects to box below) */
    teeDown: string;
    /** T-junction pointing up (bottom edge, connects to box above) */
    teeUp: string;
    /** Cross/intersection (for table grids) */
    cross: string;
}

export function getBorderChars(style: BorderStyle['borderStyle']): BorderChars {
    switch (style) {
        case 'double':
            return {
                topLeft: '╔',
                topRight: '╗',
                bottomLeft: '╚',
                bottomRight: '╝',
                horizontal: '═',
                vertical: '║',
                teeRight: '╠',
                teeLeft: '╣',
                teeDown: '╦',
                teeUp: '╩',
                cross: '╬',
            };
        case 'round':
            return {
                topLeft: '╭',
                topRight: '╮',
                bottomLeft: '╰',
                bottomRight: '╯',
                horizontal: '─',
                vertical: '│',
                teeRight: '├',
                teeLeft: '┤',
                teeDown: '┬',
                teeUp: '┴',
                cross: '┼',
            };
        case 'bold':
            return {
                topLeft: '┏',
                topRight: '┓',
                bottomLeft: '┗',
                bottomRight: '┛',
                horizontal: '━',
                vertical: '┃',
                teeRight: '┣',
                teeLeft: '┫',
                teeDown: '┳',
                teeUp: '┻',
                cross: '╋',
            };
        case 'classic':
            return {
                topLeft: '+',
                topRight: '+',
                bottomLeft: '+',
                bottomRight: '+',
                horizontal: '-',
                vertical: '|',
                teeRight: '+',
                teeLeft: '+',
                teeDown: '+',
                teeUp: '+',
                cross: '+',
            };
        case 'dotted':
            return {
                topLeft: '·',
                topRight: '·',
                bottomLeft: '·',
                bottomRight: '·',
                horizontal: '·',
                vertical: '·',
                teeRight: '·',
                teeLeft: '·',
                teeDown: '·',
                teeUp: '·',
                cross: '·',
            };
        case 'single':
        default:
            return {
                topLeft: '┌',
                topRight: '┐',
                bottomLeft: '└',
                bottomRight: '┘',
                horizontal: '─',
                vertical: '│',
                teeRight: '├',
                teeLeft: '┤',
                teeDown: '┬',
                teeUp: '┴',
                cross: '┼',
            };
    }
}

function makeBorderStyle(color: string | undefined, bg: string | undefined, fallback: string | undefined): Style {
    const style: Style = {};
    if (color) {
        style.color = color;
    }
    // Only set background if explicitly provided - borders are transparent by default
    const resolvedBg = bg ?? fallback;
    if (resolvedBg) {
        style.backgroundColor = resolvedBg;
    }
    return style;
}

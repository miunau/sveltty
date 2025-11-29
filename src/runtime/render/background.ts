import type { TextStyle } from '../types.js';
import type { ClipRect, GridCell } from './types.js';
import { 
    isGradient, 
    parseGradient, 
    getGradientColorAt, 
    getLinearGradientPosition, 
    getRadialGradientPosition,
    getConicGradientPosition,
    type Gradient
} from '../style/gradient.js';

/**
 * Fill a rectangular area with a background color or gradient.
 * Respects the optional clip rect to constrain the fill area.
 */
export function fillBackground(
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    clip?: ClipRect
): void {
    // Check if this is a gradient
    if (isGradient(color)) {
        fillGradientBackground(grid, x, y, width, height, color, clip);
        return;
    }

    let x1 = Math.floor(x);
    let y1 = Math.floor(y);
    let x2 = Math.floor(x + width);
    let y2 = Math.floor(y + height);

    // Constrain to clip rect if provided
    if (clip) {
        x1 = Math.max(x1, Math.floor(clip.x1));
        y1 = Math.max(y1, Math.floor(clip.y1));
        x2 = Math.min(x2, Math.ceil(clip.x2));
        y2 = Math.min(y2, Math.ceil(clip.y2));
    }

    for (let row = y1; row < y2 && row < grid.length; row++) {
        if (row < 0) continue;
        for (let col = x1; col < x2 && col < grid[row].length; col++) {
            if (col < 0) continue;
            const cell = grid[row][col];
            if (!cell) continue;
            const style = cell.style;
            if (style && style.backgroundColor === color) {
                continue;
            }
            if (!style) {
                grid[row][col] = {
                    char: cell.char,
                    style: { backgroundColor: color },
                };
                continue;
            }
            cell.style = { ...style, backgroundColor: color } as TextStyle;
        }
    }
}

/**
 * Fill a rectangular area with a gradient background.
 */
function fillGradientBackground(
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    gradientStr: string,
    clip?: ClipRect
): void {
    const gradient = parseGradient(gradientStr);
    if (!gradient) {
        // Fallback to first color if parsing fails
        fillBackground(grid, x, y, width, height, '#000000', clip);
        return;
    }

    let x1 = Math.floor(x);
    let y1 = Math.floor(y);
    let x2 = Math.floor(x + width);
    let y2 = Math.floor(y + height);

    // Constrain to clip rect if provided
    if (clip) {
        x1 = Math.max(x1, Math.floor(clip.x1));
        y1 = Math.max(y1, Math.floor(clip.y1));
        x2 = Math.min(x2, Math.ceil(clip.x2));
        y2 = Math.min(y2, Math.ceil(clip.y2));
    }

    const elementWidth = Math.floor(width);
    const elementHeight = Math.floor(height);

    for (let row = y1; row < y2 && row < grid.length; row++) {
        if (row < 0) continue;
        for (let col = x1; col < x2 && col < grid[row].length; col++) {
            if (col < 0) continue;
            const cell = grid[row][col];
            if (!cell) continue;

            // Calculate position within the element
            const localX = col - Math.floor(x);
            const localY = row - Math.floor(y);

            // Get gradient position based on type
            const position = getGradientPosition(gradient, localX, localY, elementWidth, elementHeight);
            const color = getGradientColorAt(gradient, position);

            const style = cell.style;
            if (!style) {
                grid[row][col] = {
                    char: cell.char,
                    style: { backgroundColor: color },
                };
            } else {
                cell.style = { ...style, backgroundColor: color } as TextStyle;
            }
        }
    }
}

/**
 * Get gradient position based on gradient type
 */
function getGradientPosition(
    gradient: Gradient,
    x: number,
    y: number,
    width: number,
    height: number
): number {
    switch (gradient.type) {
        case 'linear':
        return getLinearGradientPosition(gradient, x, y, width, height);
        case 'radial':
        return getRadialGradientPosition(gradient, x, y, width, height);
        case 'conic':
            return getConicGradientPosition(gradient, x, y, width, height);
    }
}

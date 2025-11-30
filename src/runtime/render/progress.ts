/**
 * Progress element renderer for CLI.
 * Handles <progress> elements with value/max attributes.
 * 
 * Web API compatible:
 * - progress.value: Current value (0 to max)
 * - progress.max: Maximum value (default: 1)
 * - progress.position: Computed ratio (-1 if indeterminate)
 * 
 * Indeterminate state: When value attribute is not set, shows animated/pulsing bar.
 * 
 * Styling is driven by computed CSS styles via custom properties:
 * - progress-bar-color: Color of filled portion
 * - progress-track-color: Color of empty portion
 * - progress-filled-char: Character for filled cells (default: █)
 * - progress-empty-char: Character for empty cells (default: ░)
 */

import type { GridCell, ClipRect } from './types.js';
import type { TextStyle, CliNode } from '../types.js';
import type { ElementRenderer } from './registry.js';
import { registerRenderer } from './registry.js';
import { setCell } from './utils.js';
import { parseNumericAttribute, parseNumericAttributeOrUndefined } from '../utils/attributes.js';
import { getStringWidth } from './string-width.js';

/**
 * Get the value of a progress element.
 * Returns undefined if indeterminate (no value set).
 */
export function getProgressValue(node: CliNode): number | undefined {
    return parseNumericAttributeOrUndefined(node.value);
}

/**
 * Get the max value of a progress element.
 * Default is 1 per HTML spec.
 */
export function getProgressMax(node: CliNode): number {
    const max = parseNumericAttribute(node.max, 1);
    return max > 0 ? max : 1;
}

/**
 * Get the position (ratio) of a progress element.
 * Returns -1 if indeterminate, otherwise 0-1.
 */
export function getProgressPosition(node: CliNode): number {
    const value = getProgressValue(node);
    if (value === undefined) {
        return -1; // Indeterminate
    }
    const max = getProgressMax(node);
    return Math.max(0, Math.min(1, value / max));
}

/**
 * Render a progress bar into the grid.
 * Uses CSS custom properties for styling.
 */
export function renderProgress(
    node: CliNode,
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    textStyle: TextStyle,
    clip: ClipRect
): void {
    const position = getProgressPosition(node);
    
    // CSS custom properties with sensible defaults
    const filledChar = textStyle.progressFilledChar ?? '█';
    const emptyChar = textStyle.progressEmptyChar ?? '░';
    const barColor = textStyle.progressBarColor ?? 'cyan';
    const trackColor = textStyle.progressTrackColor ?? 'gray';
    
    const trackStyle: TextStyle = { ...textStyle, color: trackColor };
    const barStyle: TextStyle = { ...textStyle, color: barColor };

    // Use the first row for the progress bar
    const barY = Math.floor(y);
    if (barY < clip.y1 || barY >= clip.y2) return;
    if (barY < 0 || barY >= grid.length) return;

    const barWidth = Math.floor(width);
    const startX = Math.floor(x);

    // Get character widths for proper rendering
    const filledCharWidth = getStringWidth(filledChar);
    const emptyCharWidth = getStringWidth(emptyChar);

    if (position < 0) {
        // Indeterminate: show a pulsing/animated pattern
        let i = 0;
        while (i < barWidth) {
            const col = startX + i;
            if (col >= clip.x1 && col < clip.x2) {
                const char = (i % 2 === 0) ? '▓' : '░';
                setCell(grid, barY, col, char, barStyle);
            }
            i++;
        }
    } else {
        // Determinate: show filled portion
        const filledWidth = Math.round(position * barWidth);
        
        let i = 0;
        while (i < barWidth) {
            const col = startX + i;
            if (col >= clip.x1 && col < clip.x2) {
                if (i < filledWidth) {
                    setCell(grid, barY, col, filledChar, barStyle);
                    // Handle double-width characters
                    if (filledCharWidth === 2 && col + 1 < clip.x2) {
                        setCell(grid, barY, col + 1, '', barStyle);
                        i++;
                    }
                } else {
                    setCell(grid, barY, col, emptyChar, trackStyle);
                    // Handle double-width characters
                    if (emptyCharWidth === 2 && col + 1 < clip.x2) {
                        setCell(grid, barY, col + 1, '', trackStyle);
                        i++;
                    }
                }
            }
            i++;
        }
    }
}

/**
 * Initialize a progress element with proper DOM-like properties.
 */
export function initProgressElement(node: CliNode): void {
    let _value: number | undefined = undefined;
    let _max: number = 1;

    // Read initial attributes using shared parsing utilities
    const initialValue = parseNumericAttributeOrUndefined(node.value);
    if (initialValue !== undefined) {
        _value = initialValue;
    }

    const initialMax = parseNumericAttribute(node.max, 1);
    if (initialMax > 0) {
        _max = initialMax;
    }

    Object.defineProperty(node, 'value', {
        get() {
            return _value;
        },
        set(val: number | string | undefined) {
            if (val === undefined || val === null || val === '') {
                _value = undefined;
            } else {
                const num = typeof val === 'number' ? val : parseFloat(val as string);
                _value = Number.isFinite(num) ? Math.max(0, num) : undefined;
            }
        },
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(node, 'max', {
        get() {
            return _max;
        },
        set(val: number | string) {
            const num = typeof val === 'number' ? val : parseFloat(val as string);
            _max = Number.isFinite(num) && num > 0 ? num : 1;
        },
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(node, 'position', {
        get() {
            if (_value === undefined) return -1;
            return Math.max(0, Math.min(1, _value / _max));
        },
        enumerable: true,
        configurable: false,
    });
}

/**
 * Progress element renderer.
 * Registered with the element registry to handle <progress> elements.
 */
export const progressRenderer: ElementRenderer = {
    tags: ['progress'],
    customChildren: true,
    
    render(node, ctx, bounds, computedStyle) {
        renderProgress(
            node,
            ctx.grid,
            bounds.absX,
            bounds.absY,
            bounds.width,
            bounds.height,
            computedStyle,
            bounds.clip
        );
    },
};

// Register the progress renderer
registerRenderer(progressRenderer);

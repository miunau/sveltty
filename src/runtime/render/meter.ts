/**
 * Meter element renderer for CLI.
 * Handles <meter> elements with value/min/max/low/high/optimum attributes.
 * 
 * Web API compatible:
 * - meter.value: Current value (required)
 * - meter.min: Minimum value (default: 0)
 * - meter.max: Maximum value (default: 1)
 * - meter.low: Upper bound of low range
 * - meter.high: Lower bound of high range
 * - meter.optimum: Optimal value (determines coloring logic)
 * 
 * Coloring logic (matches browser behavior):
 * - If value is in the "good" range relative to optimum: green
 * - If value is in the "average" range: yellow
 * - If value is in the "poor" range: red
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meter
 * 
 * Styling via CSS custom properties:
 * - --meter-good-color: Color when value is in good range (default: green)
 * - --meter-average-color: Color when value is in average range (default: yellow)
 * - --meter-poor-color: Color when value is in poor range (default: red)
 * - --meter-track-color: Color of empty portion (default: gray)
 * - --meter-filled-char: Character for filled cells (default: █)
 * - --meter-empty-char: Character for empty cells (default: ░)
 */

import type { GridCell, ClipRect } from './types.js';
import type { TextStyle, CliNode } from '../types.js';
import type { ElementRenderer } from './registry.js';
import { registerRenderer } from './registry.js';
import { setCell } from './utils.js';
import { getStringWidth } from './string-width.js';

/**
 * Get a numeric attribute value with a default.
 */
function getNumericAttr(node: CliNode, attr: string, defaultValue: number): number {
    const val = (node as unknown as Record<string, unknown>)[attr];
    if (val === undefined || val === null || val === '') {
        return defaultValue;
    }
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(num) ? num : defaultValue;
}

/**
 * Get the value of a meter element.
 */
export function getMeterValue(node: CliNode): number {
    return getNumericAttr(node, 'value', 0);
}

/**
 * Get the min value of a meter element.
 * Default is 0 per HTML spec.
 */
export function getMeterMin(node: CliNode): number {
    return getNumericAttr(node, 'min', 0);
}

/**
 * Get the max value of a meter element.
 * Default is 1 per HTML spec.
 */
export function getMeterMax(node: CliNode): number {
    const max = getNumericAttr(node, 'max', 1);
    const min = getMeterMin(node);
    return max > min ? max : min + 1;
}

/**
 * Get the low threshold of a meter element.
 * Default is min value.
 */
export function getMeterLow(node: CliNode): number {
    const min = getMeterMin(node);
    const max = getMeterMax(node);
    const low = getNumericAttr(node, 'low', min);
    return Math.max(min, Math.min(low, max));
}

/**
 * Get the high threshold of a meter element.
 * Default is max value.
 */
export function getMeterHigh(node: CliNode): number {
    const min = getMeterMin(node);
    const max = getMeterMax(node);
    const low = getMeterLow(node);
    const high = getNumericAttr(node, 'high', max);
    return Math.max(low, Math.min(high, max));
}

/**
 * Get the optimum value of a meter element.
 * Default is midpoint between min and max.
 */
export function getMeterOptimum(node: CliNode): number {
    const min = getMeterMin(node);
    const max = getMeterMax(node);
    const optimum = getNumericAttr(node, 'optimum', (min + max) / 2);
    return Math.max(min, Math.min(optimum, max));
}

/**
 * Determine the "region" (good/average/poor) for a meter value.
 * Returns 'good', 'average', or 'poor'.
 * 
 * Logic per HTML spec:
 * - Optimum in low segment: low values are good, high values are poor
 * - Optimum in high segment: high values are good, low values are poor
 * - Optimum in middle segment: middle values are good, extremes are poor
 */
export function getMeterRegion(node: CliNode): 'good' | 'average' | 'poor' {
    const value = getMeterValue(node);
    const min = getMeterMin(node);
    const max = getMeterMax(node);
    const low = getMeterLow(node);
    const high = getMeterHigh(node);
    const optimum = getMeterOptimum(node);

    // Clamp value to valid range
    const clampedValue = Math.max(min, Math.min(value, max));

    // Determine which segment the optimum is in
    const optimumInLow = optimum <= low;
    const optimumInHigh = optimum >= high;

    // Determine which segment the value is in
    const valueInLow = clampedValue <= low;
    const valueInHigh = clampedValue >= high;
    const valueInMiddle = !valueInLow && !valueInHigh;

    if (optimumInLow) {
        // Low values are good
        if (valueInLow) return 'good';
        if (valueInMiddle) return 'average';
        return 'poor';
    } else if (optimumInHigh) {
        // High values are good
        if (valueInHigh) return 'good';
        if (valueInMiddle) return 'average';
        return 'poor';
    } else {
        // Middle values are good (optimum in middle segment)
        if (valueInMiddle) return 'good';
        return 'average'; // Extremes are just average when optimum is in middle
    }
}

/**
 * Render a meter bar into the grid.
 * Uses CSS custom properties for styling.
 */
export function renderMeter(
    node: CliNode,
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    textStyle: TextStyle,
    clip: ClipRect
): void {
    const value = getMeterValue(node);
    const min = getMeterMin(node);
    const max = getMeterMax(node);
    const region = getMeterRegion(node);

    // CSS custom properties with sensible defaults
    const filledChar = textStyle.meterFilledChar ?? '█';
    const emptyChar = textStyle.meterEmptyChar ?? '░';
    const goodColor = textStyle.meterGoodColor ?? '#22c55e'; // green-500
    const averageColor = textStyle.meterAverageColor ?? '#eab308'; // yellow-500
    const poorColor = textStyle.meterPoorColor ?? '#ef4444'; // red-500
    const trackColor = textStyle.meterTrackColor ?? 'gray';

    // Select bar color based on region
    let barColor: string;
    switch (region) {
        case 'good':
            barColor = goodColor;
            break;
        case 'average':
            barColor = averageColor;
            break;
        case 'poor':
            barColor = poorColor;
            break;
    }

    const trackStyle: TextStyle = { ...textStyle, color: trackColor };
    const barStyle: TextStyle = { ...textStyle, color: barColor };

    // Use the first row for the meter bar
    const barY = Math.floor(y);
    if (barY < clip.y1 || barY >= clip.y2) return;
    if (barY < 0 || barY >= grid.length) return;

    const barWidth = Math.floor(width);
    const startX = Math.floor(x);

    // Calculate filled portion
    const range = max - min;
    const position = range > 0 ? (Math.max(min, Math.min(value, max)) - min) / range : 0;
    const filledWidth = Math.round(position * barWidth);

    // Get character widths for proper rendering
    const filledCharWidth = getStringWidth(filledChar);
    const emptyCharWidth = getStringWidth(emptyChar);

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

/**
 * Initialize a meter element with proper DOM-like properties.
 */
export function initMeterElement(node: CliNode): void {
    let _value: number = 0;
    let _min: number = 0;
    let _max: number = 1;
    let _low: number | undefined;
    let _high: number | undefined;
    let _optimum: number | undefined;

    // Read initial attributes
    const attrs = ['value', 'min', 'max', 'low', 'high', 'optimum'] as const;
    const nodeProps = node as unknown as Record<string, unknown>;
    for (const attr of attrs) {
        const initial = nodeProps[attr];
        if (initial !== undefined && initial !== null && initial !== '') {
            const num = typeof initial === 'number' ? initial : parseFloat(String(initial));
            if (Number.isFinite(num)) {
                switch (attr) {
                    case 'value': _value = num; break;
                    case 'min': _min = num; break;
                    case 'max': _max = num; break;
                    case 'low': _low = num; break;
                    case 'high': _high = num; break;
                    case 'optimum': _optimum = num; break;
                }
            }
        }
    }

    // Define getters/setters for all properties
    Object.defineProperty(node, 'value', {
        get() { return _value; },
        set(val: number | string) {
            const num = typeof val === 'number' ? val : parseFloat(val as string);
            _value = Number.isFinite(num) ? num : 0;
        },
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(node, 'min', {
        get() { return _min; },
        set(val: number | string) {
            const num = typeof val === 'number' ? val : parseFloat(val as string);
            _min = Number.isFinite(num) ? num : 0;
        },
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(node, 'max', {
        get() { return _max; },
        set(val: number | string) {
            const num = typeof val === 'number' ? val : parseFloat(val as string);
            _max = Number.isFinite(num) && num > _min ? num : _min + 1;
        },
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(node, 'low', {
        get() { return _low ?? _min; },
        set(val: number | string | undefined) {
            if (val === undefined || val === null) {
                _low = undefined;
            } else {
                const num = typeof val === 'number' ? val : parseFloat(val as string);
                _low = Number.isFinite(num) ? num : undefined;
            }
        },
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(node, 'high', {
        get() { return _high ?? _max; },
        set(val: number | string | undefined) {
            if (val === undefined || val === null) {
                _high = undefined;
            } else {
                const num = typeof val === 'number' ? val : parseFloat(val as string);
                _high = Number.isFinite(num) ? num : undefined;
            }
        },
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(node, 'optimum', {
        get() { return _optimum ?? (_min + _max) / 2; },
        set(val: number | string | undefined) {
            if (val === undefined || val === null) {
                _optimum = undefined;
            } else {
                const num = typeof val === 'number' ? val : parseFloat(val as string);
                _optimum = Number.isFinite(num) ? num : undefined;
            }
        },
        enumerable: true,
        configurable: true,
    });
}

/**
 * Meter element renderer.
 * Registered with the element registry to handle <meter> elements.
 */
export const meterRenderer: ElementRenderer = {
    tags: ['meter'],
    customChildren: true,

    render(node, ctx, bounds, computedStyle) {
        renderMeter(
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

// Register the meter renderer
registerRenderer(meterRenderer);


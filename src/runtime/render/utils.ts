import type { CliNode, TextStyle } from '../types.js';
import type { BorderStyle } from '../types.js';
import type { ClipRect, GridCell } from './types.js';

/**
 * Sets a grid cell, preserving existing background color if the new style doesn't specify one.
 * This enables transparent compositing where child elements show parent backgrounds.
 */
export function setCell(
    grid: GridCell[][],
    row: number,
    col: number,
    char: string,
    style?: TextStyle
): void {
    if (row < 0 || row >= grid.length || col < 0 || col >= grid[row].length) return;
    const existing = grid[row][col];
    const existingBg = existing?.style?.backgroundColor;
    const finalStyle = style ? { ...style } : {};
    if (!finalStyle.backgroundColor && existingBg) {
        finalStyle.backgroundColor = existingBg;
    }
    grid[row][col] = { char, style: Object.keys(finalStyle).length ? finalStyle : undefined };
}

export function mergeTextStyles(...styles: Array<TextStyle | undefined>): TextStyle {
    const result: Record<string, any> = {};
    for (const style of styles) {
        if (!style) continue;
        for (const key of Object.keys(style) as (keyof TextStyle)[]) {
            const value = style[key];
            if (value !== undefined) {
                result[key as string] = value;
            }
        }
    }
    return result as TextStyle;
}

export interface PaddingInsets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export function getPaddingInsets(node: CliNode): PaddingInsets {
    const inline = (node.style ?? {}) as Record<string, unknown>;
    const css = (node.__cssStyle ?? {}) as Record<string, unknown>;
    const read = (key: string): unknown => {
        if (inline[key] !== undefined) return inline[key];
        if (css[key] !== undefined) return css[key];
        return undefined;
    };
    const readAxis = (axisKey: string): unknown => {
        if (!axisKey) return undefined;
        return read(axisKey);
    };
    const fallback = (): unknown => read('padding');
    const resolve = (edge: 'Top' | 'Right' | 'Bottom' | 'Left'): number => {
        return (
            normalizeInset(read(`padding${edge}`)) ??
            normalizeInset(
                readAxis(edge === 'Top' || edge === 'Bottom' ? 'paddingY' : 'paddingX')
            ) ??
            normalizeInset(fallback()) ??
            0
        );
    };
    return {
        top: resolve('Top'),
        right: resolve('Right'),
        bottom: resolve('Bottom'),
        left: resolve('Left'),
    };
}

function normalizeInset(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const numeric = parseFloat(trimmed);
        if (!Number.isNaN(numeric)) {
            return Math.max(0, Math.floor(numeric));
        }
    }
    return undefined;
}

export interface BorderInsets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export function getBorderInsets(style: Partial<BorderStyle>): BorderInsets {
    const hasBorder = style.borderStyle && style.borderStyle !== 'none';
    const edgeEnabled = (flag: boolean | undefined): boolean => flag !== false;
    return {
        top: hasBorder && edgeEnabled(style.borderTop) ? 1 : 0,
        right: hasBorder && edgeEnabled(style.borderRight) ? 1 : 0,
        bottom: hasBorder && edgeEnabled(style.borderBottom) ? 1 : 0,
        left: hasBorder && edgeEnabled(style.borderLeft) ? 1 : 0,
    };
}

export function resolveClip(grid: GridCell[][], clip?: ClipRect): ClipRect {
    if (clip) {
        return clip;
    }
    const height = grid.length;
    const width = grid[0]?.length ?? 0;
    return {
        x1: 0,
        y1: 0,
        x2: width,
        y2: height,
    };
}


/**
 * Unified form control rendering utilities.
 * Provides consistent interior area calculation and content rendering
 * for input, select, button, and checkbox elements.
 * 
 * All styling is driven by computed CSS styles.
 */
import type { ClipRect, GridCell } from './types.js';
import type { TextStyle, CliNode } from '../types.js';
import { getBorderInsets, getPaddingInsets, mergeTextStyles, setCell } from './utils.js';
import { getStringWidth } from './string-width.js';

/**
 * Computed interior rectangle for a form control, accounting for borders and padding.
 */
export interface InteriorRect {
    /** Left edge of content area (after border + padding) */
    x: number;
    /** Top edge of content area (after border + padding) */
    y: number;
    /** Width of content area */
    width: number;
    /** Height of content area */
    height: number;
    /** Resolved clip rectangle */
    clip: ClipRect;
}

/**
 * Common parameters passed to all form control renderers.
 */
export interface FormControlContext {
    node: CliNode;
    grid: GridCell[][];
    x: number;
    y: number;
    width: number;
    height: number;
    isFocused: boolean;
    style: TextStyle;
    clip: ClipRect;
}

/**
 * Calculates the interior content area of a form control,
 * accounting for borders and padding.
 */
export function getInteriorRect(ctx: FormControlContext, includePadding = true): InteriorRect {
    const border = getBorderInsets(ctx.style);
    const padding = includePadding ? getPaddingInsets(ctx.node) : { top: 0, right: 0, bottom: 0, left: 0 };
    
    const innerX = Math.floor(ctx.x) + border.left + padding.left;
    const innerY = Math.floor(ctx.y) + border.top + padding.top;
    const innerWidth = Math.max(1, Math.floor(ctx.width) - border.left - border.right - padding.left - padding.right);
    const innerHeight = Math.max(1, Math.floor(ctx.height) - border.top - border.bottom - padding.top - padding.bottom);
    
    return {
        x: innerX,
        y: innerY,
        width: innerWidth,
        height: innerHeight,
        clip: ctx.clip,
    };
}

/**
 * Fills the interior of a form control with a background style.
 * Preserves existing background if the style doesn't specify one.
 */
export function fillInterior(
    grid: GridCell[][],
    rect: InteriorRect,
    style: TextStyle,
    char = ' '
): void {
    const { x, y, width, height, clip } = rect;
    
    for (let row = 0; row < height; row++) {
        const gy = y + row;
        if (gy < clip.y1 || gy >= clip.y2) continue;
        
        for (let col = 0; col < width; col++) {
            const gx = x + col;
            if (gx < clip.x1 || gx >= clip.x2) continue;
            setCell(grid, gy, gx, char, style);
        }
    }
}

/**
 * Draws text centered within the interior rectangle.
 * Preserves existing background if the style doesn't specify one.
 */
export function drawCenteredText(
    grid: GridCell[][],
    rect: InteriorRect,
    text: string,
    style: TextStyle
): void {
    const { x, y, width, height, clip } = rect;
    
    const centerY = y + Math.floor(height / 2);
    const textWidth = getStringWidth(text);
    const startX = x + Math.max(0, Math.floor((width - textWidth) / 2));
    
    if (centerY < clip.y1 || centerY >= clip.y2) return;
    
    let gx = startX;
    for (const char of text) {
        const charWidth = getStringWidth(char);
        if (charWidth === 0) continue; // Skip zero-width chars
        if (gx >= clip.x2) break;
        if (gx >= clip.x1 && gx >= x && gx < x + width) {
            setCell(grid, centerY, gx, char, style);
            // Handle double-width characters
            if (charWidth === 2 && gx + 1 < x + width && gx + 1 < clip.x2) {
                setCell(grid, centerY, gx + 1, '', style);
        }
        }
        gx += charWidth;
    }
}

/**
 * Draws a single character centered within the interior rectangle.
 * Preserves existing background if the style doesn't specify one.
 */
export function drawCenteredChar(
    grid: GridCell[][],
    rect: InteriorRect,
    char: string,
    style: TextStyle
): void {
    const { x, y, width, height, clip } = rect;
    
    const centerX = x + Math.floor(width / 2);
    const centerY = y + Math.floor(height / 2);
    
    if (centerY < clip.y1 || centerY >= clip.y2) return;
    if (centerX < clip.x1 || centerX >= clip.x2) return;
    
    setCell(grid, centerY, centerX, char, style);
}

/**
 * Resolves the effective style for a form control, merging base with computed style.
 */
export function resolveFormControlStyle(
    baseStyle: TextStyle | undefined,
    computedStyle: TextStyle,
    options: {
        disabled?: boolean;
        focused?: boolean;
        invalid?: boolean;
        disabledStyle?: TextStyle;
        focusStyle?: TextStyle;
        invalidStyle?: TextStyle;
        defaultStyle?: TextStyle;
    }
): TextStyle {
    return mergeTextStyles(
        baseStyle,
        computedStyle,
        options.disabled ? options.disabledStyle : undefined,
        options.focused && !options.disabled ? options.focusStyle : (options.defaultStyle ?? undefined),
        options.invalid ? options.invalidStyle : undefined
    );
}

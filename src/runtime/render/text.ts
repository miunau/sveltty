/**
 * Text rendering for CLI elements.
 * 
 * Styling is driven by computed CSS styles. Text inherits color from parent
 * elements and is transparent by default (no background unless explicitly set).
 * Supports CSS text wrapping properties (white-space, word-break, etc.).
 */
import type { TextNode, TextStyle, CliNode } from '../types.js';
import { TEXT_NODE } from '../types.js';
import type { ClipRect, GridCell } from './types.js';
import type { ElementRenderer } from './registry.js';
import { registerRenderer } from './registry.js';
import { getComputedCliStyle } from '../style/computed.js';
import { mergeTextStyles, setCell } from './utils.js';
import { wrapText, getWrapOptionsFromStyle } from './text-wrap.js';
import { getStringWidth } from './string-width.js';

/**
 * Options for text rendering
 */
export interface TextRenderOptions {
    /** Container width for text alignment calculations */
    containerWidth?: number;
    /** Container starting X position for alignment calculations */
    containerX?: number;
    /** Container clip rect - used when alignment moves text outside its own bounds */
    containerClip?: ClipRect;
}

/**
 * Calculate the starting X position for a line based on text alignment
 */
function calculateAlignedX(
    lineLength: number,
    baseX: number,
    containerX: number,
    containerWidth: number,
    textAlign: TextStyle['textAlign']
): number {
    if (!textAlign || textAlign === 'left') {
        return baseX;
    }
    
    const availableWidth = containerWidth;
    
    if (textAlign === 'center') {
        const offset = Math.floor((availableWidth - lineLength) / 2);
        return containerX + Math.max(0, offset);
    }
    
    if (textAlign === 'right') {
        const offset = availableWidth - lineLength;
        return containerX + Math.max(0, offset);
    }
    
    return baseX;
}

/**
 * Render a text node.
 * Uses computed CSS styles - text is transparent by default.
 * Applies CSS text wrapping based on white-space, word-break, etc.
 */
export function renderText(
    node: TextNode,
    grid: GridCell[][],
    x: number,
    y: number,
    clip: ClipRect,
    inheritedStyle: TextStyle | undefined,
    options?: TextRenderOptions
): void {
    const text = node.textContent ?? node.value ?? '';
    if (typeof text === 'string' && text.trim().length === 0) {
        return;
    }
    
    // Compute style from CSS - no theme fallback needed
    const computedNodeStyle = getComputedCliStyle(node, inheritedStyle);
    const style = mergeTextStyles(computedNodeStyle);
    
    // Text nodes are transparent by default - don't inherit or apply background
    // unless explicitly set on the text node itself
    if (!computedNodeStyle.backgroundColor) {
        delete style.backgroundColor;
    }
    
    const textAlign = style.textAlign;
    
    // Determine container bounds for alignment and wrapping
    const containerX = options?.containerX ?? Math.floor(x);
    const containerWidth = options?.containerWidth ?? (clip.x2 - clip.x1);
    
    // Always use container clip when available
    const effectiveClip = options?.containerClip ?? clip;
    
    const clipX1 = Math.floor(effectiveClip.x1);
    const clipX2 = Math.ceil(effectiveClip.x2);
    const clipY1 = Math.floor(effectiveClip.y1);
    const clipY2 = Math.ceil(effectiveClip.y2);

    // Get wrapping options from computed style
    const wrapOptions = getWrapOptionsFromStyle(computedNodeStyle);
    
    // Wrap text according to CSS rules
    const wrapResult = wrapText(text, {
        ...wrapOptions,
        maxWidth: containerWidth > 0 ? containerWidth : undefined,
    });
    
    const lines = wrapResult.lines;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        const row = Math.floor(y) + lineIdx;

        if (row >= grid.length || row < 0) break;
        if (row < clipY1 || row >= clipY2) continue;

        // Calculate starting column based on alignment (using display width)
        const lineDisplayWidth = getStringWidth(line);
        let col = calculateAlignedX(lineDisplayWidth, Math.floor(x), containerX, containerWidth, textAlign);

        // Place each character with its style
        // Use for...of to properly iterate over Unicode code points
        for (const char of line) {
            const charWidth = getStringWidth(char);
            
            // Skip zero-width characters (combining marks, ZWJ, etc.)
            if (charWidth === 0) {
                // Append to previous cell if possible
                if (col > 0 && col - 1 < grid[row].length) {
                    const prevCell = grid[row][col - 1];
                    if (prevCell) {
                        grid[row][col - 1] = {
                            char: prevCell.char + char,
                            style: prevCell.style,
                        };
                    }
                }
                continue;
            }
            
            if (col >= clipX2) break;
            
            if (col >= clipX1 && col < clipX2) {
                setCell(grid, row, col, char, Object.keys(style).length > 0 ? style : undefined);
                
                // For double-width characters, fill the next cell with empty space
                // to prevent other content from rendering there
                if (charWidth === 2 && col + 1 < clipX2 && col + 1 < grid[row].length) {
                    // Mark the next cell as a continuation (empty, same style)
                    setCell(grid, row, col + 1, '', style);
                }
            }
            
            col += charWidth;
        }
    }
}

/**
 * Draw text at a specific position with styling.
 * Low-level function for direct text drawing.
 * Uses display width for proper Unicode support.
 */
export function drawText(
    text: string,
    grid: GridCell[][],
    x: number,
    y: number,
    style: TextStyle,
    isFocused: boolean,
    clip: ClipRect
): void {
    const row = Math.floor(y);
    if (row < 0 || row >= grid.length) return;
    const clipX1 = Math.floor(clip.x1);
    const clipX2 = Math.ceil(clip.x2);
    const clipY1 = Math.floor(clip.y1);
    const clipY2 = Math.ceil(clip.y2);
    if (row < clipY1 || row >= clipY2) return;
    let col = Math.floor(x);
    const st: TextStyle = { ...(style || {}) };
    if (isFocused) {
        st.underline = true;
    }
    for (const ch of text) {
        const charWidth = getStringWidth(ch);
        
        // Skip zero-width characters
        if (charWidth === 0) continue;
        
        if (col >= clipX2) break;
        if (col >= clipX1 && col >= 0 && col < grid[row].length) {
            setCell(grid, row, col, ch, Object.keys(st).length ? st : undefined);
            
            // Handle double-width characters
            if (charWidth === 2 && col + 1 < clipX2 && col + 1 < grid[row].length) {
                setCell(grid, row, col + 1, '', st);
            }
        }
        col += charWidth;
    }
}

/**
 * Measure text dimensions using display width.
 */
export function measureText(text: string): { width: number; height: number } {
    const lines = text.split('\n');
    const width = Math.max(...lines.map(line => getStringWidth(line)));
    const height = lines.length;
    return { width, height };
}

/**
 * Text node renderer.
 * Registered with the element registry to handle text nodes.
 */
export const textRenderer: ElementRenderer = {
    tags: ['#text'],
    customChildren: true,
    
    render(node, ctx, bounds, computedStyle) {
        const textOptions: TextRenderOptions | undefined = ctx.containerBounds
            ? { 
                containerX: ctx.containerBounds.x, 
                containerWidth: ctx.containerBounds.width, 
                containerClip: ctx.containerBounds.clip 
            }
            : undefined;
        renderText(node as TextNode, ctx.grid, bounds.absX, bounds.absY, bounds.clip, computedStyle, textOptions);
    },
};

/**
 * Check if a node is a text node.
 */
export function isTextNode(node: CliNode): boolean {
    return node.nodeType === TEXT_NODE || node.type === 'text';
}

// Register the text renderer
registerRenderer(textRenderer);

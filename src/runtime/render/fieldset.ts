/**
 * Fieldset and Legend rendering for CLI.
 * 
 * Renders fieldset borders with legend text appearing on the top border,
 * similar to how browsers render HTML fieldset/legend elements.
 */
import type { CliNode, TextStyle } from '../types.js';
import type { ClipRect, GridCell } from './types.js';
import type { ElementRenderer } from './registry.js';
import { registerRenderer } from './registry.js';
import { getBorderChars } from './border.js';
import { setCell } from './utils.js';
import { getNodeTag, getNodeChildren } from '../utils/node.js';
import { getComputedCliStyle } from '../style/computed.js';
import { renderElementBackground } from './base-render.js';
import { getStringWidth } from './string-width.js';

/**
 * Find the legend element within a fieldset.
 * Per HTML spec, the legend must be the first child element.
 */
export function findLegend(fieldset: CliNode): CliNode | null {
    for (const child of getNodeChildren(fieldset)) {
        if (!child || typeof child !== 'object') continue;
        if (getNodeTag(child) === 'legend') {
            return child as CliNode;
        }
        // Per HTML spec, legend must be first element child
        // Skip text nodes and comments
        if (child.nodeType === 1) {
            break;
        }
    }
    return null;
}

/**
 * Get the text content of a legend element.
 */
export function getLegendText(legend: CliNode): string {
    // Check for direct textContent
    if (legend.textContent) {
        return String(legend.textContent);
    }
    // Check for text node children
    let text = '';
    for (const child of getNodeChildren(legend)) {
        if (!child) continue;
        if (child.type === 'text' || child.nodeType === 3) {
            text += String(child.value ?? child.textContent ?? '');
        } else if (child.textContent) {
            text += String(child.textContent);
        }
    }
    return text;
}

/**
 * Render a fieldset border with legend on top.
 * The legend appears in the top border, creating a gap in the border line.
 */
export function renderFieldsetBorder(
    node: CliNode,
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    style: TextStyle,
    legend: CliNode | null,
    legendStyle: TextStyle,
    clip?: ClipRect
): void {
    const borderStyle = style.borderStyle || 'single';
    if (borderStyle === 'none') return;

    const chars = getBorderChars(borderStyle);
    const borderColor = style.borderColor;
    const borderBg = style.borderBg;
    
    const borderTextStyle: TextStyle = {};
    if (borderColor) {
        borderTextStyle.color = borderColor;
    }
    if (borderBg) {
        borderTextStyle.backgroundColor = borderBg;
    }

    const x1 = Math.floor(x);
    const y1 = Math.floor(y);
    const x2 = Math.floor(x + width) - 1;
    const y2 = Math.floor(y + height) - 1;

    // Clip bounds
    const clipX1 = clip ? Math.floor(clip.x1) : 0;
    const clipY1 = clip ? Math.floor(clip.y1) : 0;
    const clipX2 = clip ? Math.ceil(clip.x2) : grid[0]?.length ?? 0;
    const clipY2 = clip ? Math.ceil(clip.y2) : grid.length;

    const inClip = (row: number, col: number): boolean => {
        return row >= clipY1 && row < clipY2 && col >= clipX1 && col < clipX2;
    };

    // Get legend text and calculate its position (using display width)
    const legendText = legend ? getLegendText(legend) : '';
    const legendWidth = getStringWidth(legendText);
    const legendPadding = 1; // Space before legend text
    const legendStart = x1 + 1 + legendPadding; // After top-left corner + padding
    const legendEnd = legendStart + legendWidth;

    // Draw corners
    if (y1 >= 0 && y1 < grid.length && x1 >= 0 && x1 < grid[0].length && inClip(y1, x1)) {
        setCell(grid, y1, x1, chars.topLeft, borderTextStyle);
    }
    if (y1 >= 0 && y1 < grid.length && x2 >= 0 && x2 < grid[0].length && inClip(y1, x2)) {
        setCell(grid, y1, x2, chars.topRight, borderTextStyle);
    }
    if (y2 >= 0 && y2 < grid.length) {
        if (x1 >= 0 && x1 < grid[0].length && inClip(y2, x1)) {
            setCell(grid, y2, x1, chars.bottomLeft, borderTextStyle);
        }
        if (x2 >= 0 && x2 < grid[0].length && inClip(y2, x2)) {
            setCell(grid, y2, x2, chars.bottomRight, borderTextStyle);
        }
    }

    // Draw top horizontal line with gap for legend (using display width)
    // First, build a map of which columns contain legend characters
    const legendChars: Map<number, { char: string; isSecondHalf: boolean }> = new Map();
    if (legendText) {
        let col = legendStart;
        for (const char of legendText) {
            const charWidth = getStringWidth(char);
            if (charWidth === 0) continue;
            legendChars.set(col, { char, isSecondHalf: false });
            if (charWidth === 2) {
                legendChars.set(col + 1, { char: '', isSecondHalf: true });
            }
            col += charWidth;
        }
    }
    
    for (let col = x1 + 1; col < x2; col++) {
        if (col >= 0 && col < grid[0].length && y1 >= 0 && y1 < grid.length && inClip(y1, col)) {
            const legendChar = legendChars.get(col);
            if (legendChar) {
                // Render legend character instead of border
                setCell(grid, y1, col, legendChar.char, legendStyle);
            } else {
                setCell(grid, y1, col, chars.horizontal, borderTextStyle);
            }
        }
    }

    // Draw bottom horizontal line
    for (let col = x1 + 1; col < x2; col++) {
        if (col >= 0 && col < grid[0].length && y2 >= 0 && y2 < grid.length && inClip(y2, col)) {
            setCell(grid, y2, col, chars.horizontal, borderTextStyle);
        }
    }

    // Draw vertical lines
    for (let row = y1 + 1; row < y2; row++) {
        if (row >= 0 && row < grid.length) {
            if (x1 >= 0 && x1 < grid[0].length && inClip(row, x1)) {
                setCell(grid, row, x1, chars.vertical, borderTextStyle);
            }
            if (x2 >= 0 && x2 < grid[0].length && inClip(row, x2)) {
                setCell(grid, row, x2, chars.vertical, borderTextStyle);
            }
        }
    }
}

/**
 * Check if a node is a legend element.
 */
export function isLegend(node: CliNode): boolean {
    return getNodeTag(node) === 'legend';
}

/**
 * Fieldset element renderer.
 * 
 * Handles rendering of fieldset elements with their special border behavior:
 * - Legend appears on the top border
 * - Border is rendered after background but handles legend specially
 * - Children are rendered normally except for the legend
 */
export const fieldsetRenderer: ElementRenderer = {
    tags: ['fieldset'],
    customChildren: false, // We handle children specially but still want default behavior
    
    render(node, ctx, bounds, computedStyle) {
        // Render background
        renderElementBackground(ctx.grid, bounds, computedStyle);
        
        // Find legend and render fieldset border with legend
        const legend = findLegend(node);
        const legendStyle = legend ? getComputedCliStyle(legend, computedStyle) : computedStyle;
        
        // Render the fieldset border with legend on top
        renderFieldsetBorder(
            node,
            ctx.grid,
            bounds.absX,
            bounds.absY,
            bounds.width,
            bounds.height,
            computedStyle,
            legend,
            legendStyle,
            bounds.clip
        );
    },
};

/**
 * Legend element renderer.
 * 
 * Legends are rendered as part of the fieldset border, so this renderer
 * is a no-op. The legend content is handled by renderFieldsetBorder.
 */
export const legendRenderer: ElementRenderer = {
    tags: ['legend'],
    customChildren: true, // Skip children - legend text is rendered by fieldset
    
    render() {
        // Legend is rendered as part of the fieldset border
        // No additional rendering needed here
    },
};

// Register the fieldset and legend renderers
registerRenderer(fieldsetRenderer);
registerRenderer(legendRenderer);


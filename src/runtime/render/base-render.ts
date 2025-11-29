/**
 * Base rendering utilities for CLI elements.
 * 
 * Provides common rendering operations that can be used by element renderers:
 * - Background filling
 * - Border rendering
 * - Content area calculation
 * 
 * These utilities ensure consistent rendering behavior across all elements.
 */
import type { CliNode, TextStyle } from '../types.js';
import type { ClipRect, GridCell } from './types.js';
import type { NodeBounds } from './pipeline/context.js';
import { fillBackground } from './background.js';
import { renderBorder } from './border.js';
import { getBorderInsets } from './utils.js';

/**
 * Options for base rendering operations.
 */
export interface BaseRenderOptions {
    /** Skip background rendering. */
    skipBackground?: boolean;
    /** Skip border rendering. */
    skipBorder?: boolean;
    /** Render border before content (for form controls). */
    borderFirst?: boolean;
}

/**
 * Render the background for an element.
 * 
 * Fills the interior of the element (inside borders) with the background color.
 * Only renders if backgroundColor is explicitly set on the element.
 * 
 * @param grid - The render grid.
 * @param bounds - The element bounds.
 * @param style - The computed style.
 */
export function renderElementBackground(
    grid: GridCell[][],
    bounds: NodeBounds,
    style: TextStyle
): void {
    const backgroundColor = style.backgroundColor;
    if (!backgroundColor) return;

    const { absX, absY, width, height, clip } = bounds;
    const hasBorder = style.borderStyle && style.borderStyle !== 'none';

    if (hasBorder) {
        // Fill only the interior (inside borders)
        const borderInsets = getBorderInsets(style);
        const interiorX = absX + borderInsets.left;
        const interiorY = absY + borderInsets.top;
        const interiorW = Math.max(0, width - borderInsets.left - borderInsets.right);
        const interiorH = Math.max(0, height - borderInsets.top - borderInsets.bottom);
        if (interiorW > 0 && interiorH > 0) {
            fillBackground(grid, interiorX, interiorY, interiorW, interiorH, backgroundColor, clip);
        }
    } else {
        fillBackground(grid, absX, absY, width, height, backgroundColor, clip);
    }
}

/**
 * Render the border for an element.
 * 
 * @param node - The CLI node.
 * @param grid - The render grid.
 * @param bounds - The element bounds.
 * @param style - The computed style.
 */
export function renderElementBorder(
    node: CliNode,
    grid: GridCell[][],
    bounds: NodeBounds,
    style: TextStyle
): void {
    const hasBorder = style.borderStyle && style.borderStyle !== 'none';
    if (!hasBorder) return;

    const { absX, absY, width, height, clip } = bounds;
    renderBorder(node, grid, absX, absY, width, height, style, clip);
}

/**
 * Perform base rendering operations for an element.
 * 
 * This includes background filling and border rendering in the correct order.
 * Form controls render borders first (so content appears inside), while
 * other elements render borders after (so they appear on top of children).
 * 
 * @param node - The CLI node.
 * @param grid - The render grid.
 * @param bounds - The element bounds.
 * @param style - The computed style.
 * @param options - Rendering options.
 * @returns Whether borders should be rendered after children (for non-form controls).
 */
export function renderElementBase(
    node: CliNode,
    grid: GridCell[][],
    bounds: NodeBounds,
    style: TextStyle,
    options: BaseRenderOptions = {}
): { renderBorderAfter: boolean } {
    const { skipBackground, skipBorder, borderFirst } = options;

    // Render background
    if (!skipBackground) {
        renderElementBackground(grid, bounds, style);
    }

    // For form controls, render border first
    if (borderFirst && !skipBorder) {
        renderElementBorder(node, grid, bounds, style);
        return { renderBorderAfter: false };
    }

    // For other elements, border is rendered after children
    return { renderBorderAfter: !skipBorder && Boolean(style.borderStyle && style.borderStyle !== 'none') };
}

/**
 * Calculate the content area bounds (inside padding).
 * 
 * @param bounds - The element bounds.
 * @param padding - The padding values.
 * @returns The content area clip rect, or null if invalid.
 */
export function calculateContentClip(
    bounds: NodeBounds,
    padding: { top: number; right: number; bottom: number; left: number }
): ClipRect | null {
    const { absX, absY, width, height, clip } = bounds;

    if (padding.top === 0 && padding.right === 0 && padding.bottom === 0 && padding.left === 0) {
        return clip;
    }

    const contentX1 = absX + padding.left;
    const contentY1 = absY + padding.top;
    const contentX2 = absX + width - padding.right;
    const contentY2 = absY + height - padding.bottom;

    if (contentX1 >= contentX2 || contentY1 >= contentY2) {
        return null;
    }

    // Intersect with the node clip
    const x1 = Math.max(clip.x1, contentX1);
    const y1 = Math.max(clip.y1, contentY1);
    const x2 = Math.min(clip.x2, contentX2);
    const y2 = Math.min(clip.y2, contentY2);

    if (x1 >= x2 || y1 >= y2) {
        return null;
    }

    return { x1, y1, x2, y2 };
}


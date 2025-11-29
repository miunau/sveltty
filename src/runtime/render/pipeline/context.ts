/**
 * Paint Context
 * 
 * Provides a clean, composable context for the paint pipeline.
 * Replaces the 9-parameter paintNode function with a structured context
 * that can be easily extended and passed through the render tree.
 */

import type { CliNode, TextStyle } from '../../types.js';
import type { ClipRect, GridCell } from '../types.js';

/**
 * Viewport dimensions and clip bounds.
 */
export interface Viewport {
    /** Grid width in cells. */
    width: number;
    /** Grid height in cells. */
    height: number;
    /** Clip bounds for the viewport. */
    clip: ClipRect;
}

/**
 * Container bounds for text alignment.
 */
export interface ContainerBounds {
    /** Container X position. */
    x: number;
    /** Container width. */
    width: number;
    /** Container clip bounds. */
    clip: ClipRect;
}

/**
 * Layout override for constrained rendering.
 * Used when painting content within a bounded area (table cells, etc.).
 */
export interface LayoutOverride {
    /** Absolute X position. */
    x: number;
    /** Absolute Y position. */
    y: number;
    /** Width in cells. */
    width: number;
    /** Height in cells. */
    height: number;
}

/**
 * Computed bounds for a node during painting.
 */
export interface NodeBounds {
    /** Absolute X position. */
    absX: number;
    /** Absolute Y position. */
    absY: number;
    /** Width in cells. */
    width: number;
    /** Height in cells. */
    height: number;
    /** Clip region for this node. */
    clip: ClipRect;
}

/**
 * Paint context for rendering nodes.
 * 
 * This context is passed through the render tree and provides all
 * the information needed to paint a node and its children.
 */
export interface PaintContext {
    /** The render grid. */
    grid: GridCell[][];
    
    /** Viewport dimensions and bounds. */
    viewport: Viewport;
    
    /** Parent's absolute X position. */
    parentX: number;
    
    /** Parent's absolute Y position. */
    parentY: number;
    
    /** Inherited text style from parent. */
    parentStyle?: TextStyle;
    
    /** Current clip bounds. */
    clip?: ClipRect;
    
    /** Container bounds for text alignment. */
    containerBounds?: ContainerBounds;
    
    /** Skip top-layer elements (popovers, dropdowns) in main tree pass. */
    skipTopLayer?: boolean;
    
    /**
     * Override layout for this node.
     * When set, the node renders at these bounds instead of its computedLayout.
     * Used for constrained rendering (table cells, scrollable areas, etc.).
     */
    layoutOverride?: LayoutOverride;
    
    /**
     * Scroll offset from parent scroll container.
     * Applied to child positions when painting inside a scroll container.
     */
    scrollOffset?: { x: number; y: number };
}

/**
 * Create a new paint context with updated values.
 * Non-specified values are inherited from the parent context.
 * 
 * @param parent - The parent context to inherit from.
 * @param updates - Values to update in the new context.
 * @returns A new context with the updates applied.
 */
export function childContext(
    parent: PaintContext,
    updates: Partial<PaintContext>
): PaintContext {
    return {
        ...parent,
        ...updates,
        // Clear layoutOverride unless explicitly passed - it shouldn't propagate
        layoutOverride: updates.layoutOverride,
    };
}

/**
 * Create a child context for rendering children of a node.
 * 
 * @param parent - The parent context.
 * @param absX - The absolute X position of the parent node.
 * @param absY - The absolute Y position of the parent node.
 * @param width - The width of the parent node.
 * @param nodeClip - The clip region for the parent node.
 * @param inheritedStyle - The inherited text style.
 * @returns A new context for rendering children.
 */
export function childContextForNode(
    parent: PaintContext,
    absX: number,
    absY: number,
    width: number,
    nodeClip: ClipRect,
    inheritedStyle?: TextStyle
): PaintContext {
    return {
        grid: parent.grid,
        viewport: parent.viewport,
        parentX: absX,
        parentY: absY,
        parentStyle: inheritedStyle,
        clip: nodeClip,
        containerBounds: {
            x: absX,
            width,
            clip: nodeClip,
        },
        skipTopLayer: parent.skipTopLayer,
        // layoutOverride is not inherited
    };
}

/**
 * Create the initial paint context for the root of the tree.
 * 
 * @param grid - The render grid.
 * @param skipTopLayer - Whether to skip top-layer elements.
 * @returns The initial paint context.
 */
export function createRootContext(
    grid: GridCell[][],
    skipTopLayer: boolean = false
): PaintContext {
    const viewport: Viewport = {
        width: grid[0]?.length ?? 0,
        height: grid.length,
        clip: { x1: 0, y1: 0, x2: grid[0]?.length ?? 0, y2: grid.length },
    };
    
    return {
        grid,
        viewport,
        parentX: 0,
        parentY: 0,
        parentStyle: undefined,
        clip: undefined,
        containerBounds: undefined,
        skipTopLayer,
        layoutOverride: undefined,
    };
}

/**
 * Convert a LayoutOverride to a ClipRect.
 */
export function layoutToClip(layout: LayoutOverride): ClipRect {
    return {
        x1: layout.x,
        y1: layout.y,
        x2: layout.x + layout.width,
        y2: layout.y + layout.height,
    };
}

/**
 * Intersect two clip rectangles, returning the overlapping region.
 * Returns null if there is no overlap.
 */
export function intersectClip(a: ClipRect | undefined, b: ClipRect): ClipRect | null {
    if (!a) return b;
    
    const x1 = Math.max(a.x1, b.x1);
    const y1 = Math.max(a.y1, b.y1);
    const x2 = Math.min(a.x2, b.x2);
    const y2 = Math.min(a.y2, b.y2);
    
    if (x2 <= x1 || y2 <= y1) {
        return null;
    }
    
    return { x1, y1, x2, y2 };
}


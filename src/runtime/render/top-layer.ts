/**
 * Top Layer System
 * 
 * Manages all overlay elements that render above the main content:
 * - Popovers (HTML Popover API)
 * - Select dropdowns
 * - Dialogs (modal and non-modal)
 * - Tooltips (future)
 * - Context menus (future)
 * 
 * All overlays are rendered in z-index order after the main tree,
 * with proper occlusion handling for images and other content.
 * 
 * Modal dialogs include a backdrop that covers the entire viewport.
 */

import type { CliNode, TextStyle } from '../types.js';
import type { GridCell, ClipRect } from './types.js';
import type { PaintContext, Viewport } from './pipeline/context.js';
import { addOcclusionZone } from './occlusion.js';

/** Types of top-layer elements. */
export type TopLayerType = 'popover' | 'dropdown' | 'dialog' | 'modal' | 'tooltip' | 'menu';

/** Base interface for all top-layer elements. */
export interface TopLayerElement {
    /** Type of overlay. */
    type: TopLayerType;
    /** The CLI node for this overlay. */
    node: CliNode;
    /** Absolute X position. */
    x: number;
    /** Absolute Y position. */
    y: number;
    /** Width in cells. */
    width: number;
    /** Height in cells. */
    height: number;
    /** Z-index for stacking order. */
    zIndex: number;
    /** Custom render function (optional - for special rendering like dropdowns). */
    render?: TopLayerRenderFn;
    /** Context-based render function (preferred for new code). */
    renderWithContext?: TopLayerContextRenderFn;
    /** Additional data for custom renderers. */
    data?: unknown;
}

/**
 * Custom render function signature (legacy).
 * Used when rendering top-layer elements with direct grid access.
 */
export type TopLayerRenderFn = (
    element: TopLayerElement,
    grid: GridCell[][],
    viewport: { width: number; height: number; clip: ClipRect }
) => void;

/**
 * Custom render function using PaintContext.
 * Preferred for new renderers using the context-based architecture.
 */
export type TopLayerContextRenderFn = (
    element: TopLayerElement,
    ctx: PaintContext
) => void;

/** Pending top-layer elements for the current frame. */
let topLayerElements: TopLayerElement[] = [];

/** Base z-index for different overlay types. */
const BASE_Z_INDEX: Record<TopLayerType, number> = {
    tooltip: 1000,
    dropdown: 2000,
    popover: 3000,
    dialog: 4000, // Non-modal dialogs
    menu: 4500,
    modal: 5000, // Modal dialogs (highest)
};

/**
 * Clear all top-layer elements. Called at start of each render frame.
 */
export function clearTopLayer(): void {
    topLayerElements = [];
}

/**
 * Add an element to the top layer.
 * @param element - The top-layer element to add.
 */
export function addToTopLayer(element: TopLayerElement): void {
    topLayerElements.push(element);
}

/**
 * Add a popover to the top layer.
 */
export function addPopoverToTopLayer(
    node: CliNode,
    x: number,
    y: number,
    width: number,
    height: number,
    stackIndex: number
): void {
    addToTopLayer({
        type: 'popover',
        node,
        x,
        y,
        width,
        height,
        zIndex: BASE_Z_INDEX.popover + stackIndex,
    });
}

/**
 * Add a select dropdown to the top layer.
 */
export function addDropdownToTopLayer(
    node: CliNode,
    x: number,
    y: number,
    width: number,
    height: number,
    style: TextStyle,
    borderStyle: string,
    render: TopLayerRenderFn
): void {
    addToTopLayer({
        type: 'dropdown',
        node,
        x,
        y,
        width,
        height,
        zIndex: BASE_Z_INDEX.dropdown,
        render,
        data: { style, borderStyle },
    });
}

/**
 * Add a non-modal dialog to the top layer.
 */
export function addDialogToTopLayer(
    node: CliNode,
    x: number,
    y: number,
    width: number,
    height: number,
    stackIndex: number
): void {
    addToTopLayer({
        type: 'dialog',
        node,
        x,
        y,
        width,
        height,
        zIndex: BASE_Z_INDEX.dialog + stackIndex,
    });
}

/**
 * Add a modal dialog to the top layer.
 * Modal dialogs include backdrop rendering.
 */
export function addModalToTopLayer(
    node: CliNode,
    x: number,
    y: number,
    width: number,
    height: number,
    stackIndex: number,
    backdropStyle?: TextStyle
): void {
    addToTopLayer({
        type: 'modal',
        node,
        x,
        y,
        width,
        height,
        zIndex: BASE_Z_INDEX.modal + stackIndex,
        data: { backdropStyle },
    });
}

/**
 * Get all top-layer elements sorted by z-index (lowest first).
 */
export function getTopLayerElements(): TopLayerElement[] {
    return [...topLayerElements].sort((a, b) => a.zIndex - b.zIndex);
}

/**
 * Register a top-layer element's bounds as an occlusion zone.
 * Call this when rendering each top-layer element.
 */
export function registerTopLayerOcclusion(element: TopLayerElement): void {
    addOcclusionZone({
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        zIndex: element.zIndex,
    });
}

/**
 * Clear a rectangular area of the grid.
 * Used to ensure top-layer elements fully occlude content beneath them.
 */
export function clearGridArea(
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    clip: ClipRect
): void {
    let x1 = Math.floor(x);
    let y1 = Math.floor(y);
    let x2 = Math.floor(x + width);
    let y2 = Math.floor(y + height);
    
    // Constrain to clip rect
    x1 = Math.max(x1, Math.floor(clip.x1));
    y1 = Math.max(y1, Math.floor(clip.y1));
    x2 = Math.min(x2, Math.ceil(clip.x2));
    y2 = Math.min(y2, Math.ceil(clip.y2));
    
    for (let row = y1; row < y2 && row < grid.length; row++) {
        if (row < 0) continue;
        for (let col = x1; col < x2 && col < grid[row].length; col++) {
            if (col < 0) continue;
            grid[row][col] = { char: ' ', style: undefined };
        }
    }
}


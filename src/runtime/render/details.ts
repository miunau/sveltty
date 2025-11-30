/**
 * Details element renderer for CLI.
 * Handles <details> and <summary> elements with open/close behavior.
 * 
 * Web API compatible:
 * - details.open: boolean property to get/set open state
 * - 'toggle' event dispatched when open state changes
 * 
 * CSS styling via ::marker pseudo-element:
 * - summary::marker { color: red; }
 * - details[open] > summary::marker { content: "▼ "; }
 * - details:not([open]) > summary::marker { content: "▶ "; }
 */

import type { GridCell } from './types.js';
import type { TextStyle, CliNode, ToggleEventDetail } from '../types.js';
import { parseBooleanAttribute } from '../utils/attributes.js';
import type { ElementRenderer } from './registry.js';
import { registerRenderer } from './registry.js';
import { setCell } from './utils.js';
import { getNodeTag } from '../utils/node.js';
import { computePseudoElementStyle } from '../style/stylesheet.js';
import { getStringWidth } from './string-width.js';

/** Default markers for open/closed state */
export const DETAILS_MARKERS = {
    open: '▼',
    closed: '▶',
};

/**
 * Check if a details element is open.
 * Follows the Web API: details.open property.
 */
export function isDetailsOpen(node: CliNode): boolean {
    // Check the 'open' property/attribute
    const openProp = node.open;
    if (typeof openProp === 'boolean') return openProp;
    // HTML attribute presence means true
    if (openProp === '' || openProp === 'open') return true;
    return false;
}

/**
 * Toggle the open state of a details element.
 * Dispatches a 'toggle' event as per Web API.
 */
export function toggleDetails(node: CliNode): void {
    const wasOpen = isDetailsOpen(node);
    node.open = !wasOpen;
    
    // Dispatch toggle event
    const event: ToggleEventDetail = {
        type: 'toggle',
        target: node,
        oldState: wasOpen ? 'open' : 'closed',
        newState: !wasOpen ? 'open' : 'closed',
    };
    
    // Call any registered toggle handlers
    if (typeof node.ontoggle === 'function') {
        node.ontoggle(event);
    }
}

/**
 * Find the summary element within a details element.
 * Per HTML spec, the first <summary> child is used.
 */
export function findSummary(detailsNode: CliNode): CliNode | null {
    const children = detailsNode.children ?? [];
    for (const child of children) {
        if (getNodeTag(child) === 'summary') {
            return child;
        }
    }
    return null;
}

/**
 * Get the disclosure marker character based on open state.
 * @param openMarker - Custom marker for open state (default: ▼)
 * @param closedMarker - Custom marker for closed state (default: ▶)
 */
export function getDetailsMarker(isOpen: boolean, openMarker = DETAILS_MARKERS.open, closedMarker = DETAILS_MARKERS.closed): string {
    return isOpen ? openMarker : closedMarker;
}

/**
 * Render the details marker into the grid.
 */
export function renderDetailsMarker(
    grid: GridCell[][],
    x: number,
    y: number,
    isOpen: boolean,
    style: TextStyle,
    clip: { x1: number; y1: number; x2: number; y2: number }
): void {
    if (y < clip.y1 || y >= clip.y2) return;
    if (x < clip.x1 || x >= clip.x2) return;

    const marker = getDetailsMarker(isOpen);
    setCell(grid, y, x, marker, style);
    
    // Handle double-width marker characters
    const markerWidth = getStringWidth(marker);
    if (markerWidth === 2 && x + 1 < clip.x2 && y < grid.length && x + 1 < grid[y].length) {
        setCell(grid, y, x + 1, '', style);
    }
}

/**
 * Initialize a details element with proper DOM-like properties.
 */
export function initDetailsElement(node: CliNode): void {
    // Set up the 'open' property with getter/setter
    let _open = false;
    
    // Check if already has open attribute (handles boolean, empty string, or 'open')
    _open = parseBooleanAttribute(node.open);

    Object.defineProperty(node, 'open', {
        get() {
            return _open;
        },
        set(value: boolean) {
            const oldOpen = _open;
            _open = Boolean(value);
            if (oldOpen !== _open) {
                // Dispatch toggle event
                const event = {
                    type: 'toggle',
                    target: node,
                    oldState: oldOpen ? 'open' : 'closed',
                    newState: _open ? 'open' : 'closed',
                };
                const handler = this.ontoggle;
                if (typeof handler === 'function') {
                    handler(event);
                }
            }
        },
        enumerable: true,
        configurable: true,
    });
}

/**
 * Summary element renderer.
 * Renders the disclosure marker using ::marker pseudo-element styles,
 * inside the summary's left padding area.
 */
export const summaryRenderer: ElementRenderer = {
    tags: ['summary'],
    customChildren: false, // Let default child rendering continue
    
    render(node, ctx, bounds, computedStyle) {
        // Get ::marker pseudo-element styles
        const markerPseudoStyle = computePseudoElementStyle(node, 'marker');
        
        // Check for content: none to hide the marker
        if (markerPseudoStyle.content === 'none' || markerPseudoStyle.content === '""') {
            return;
        }
        
        // Get marker from ::marker content, or use default
        let marker: string;
        if (markerPseudoStyle.content && typeof markerPseudoStyle.content === 'string') {
            // Strip quotes from content value
            marker = markerPseudoStyle.content.replace(/^["']|["']$/g, '');
        } else {
            // Fallback to default based on open state
            const detailsParent = node.parent;
            const isOpen = detailsParent ? isDetailsOpen(detailsParent) : false;
            marker = isOpen ? DETAILS_MARKERS.open : DETAILS_MARKERS.closed;
        }
        
        // Build marker style: inherit from element, then apply ::marker overrides
        const markerColor = markerPseudoStyle.color ?? 'cyan';
        const markerStyle: TextStyle = { 
            ...computedStyle, 
            ...markerPseudoStyle,
            color: markerColor,
        };
        
        // Render marker inside the summary's left padding area (like ::marker)
        const markerX = Math.floor(bounds.absX);
        const markerY = Math.floor(bounds.absY);
        if (markerX >= 0 && markerY >= 0 && markerY < ctx.grid.length && markerX < ctx.grid[markerY].length) {
            setCell(ctx.grid, markerY, markerX, marker, markerStyle);
            
            // Handle double-width marker characters (e.g., ▶ ▼ in some terminals)
            // Fill continuation cell to prevent border corruption
            const markerWidth = getStringWidth(marker);
            if (markerWidth === 2 && markerX + 1 < ctx.grid[markerY].length) {
                setCell(ctx.grid, markerY, markerX + 1, '', markerStyle);
            }
        }
    },
};

// Register the summary renderer
registerRenderer(summaryRenderer);

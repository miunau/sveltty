/**
 * Scroll State Management
 * 
 * Provides unified scroll state management for scroll containers in the CLI.
 * Follows the pattern established by input.ts with __scrollX/__scrollY,
 * but uses a unified __scroll object for all scroll-related state.
 * 
 * This module provides:
 * - ScrollState interface for tracking scroll position and dimensions
 * - Functions to get/set scroll position
 * - scrollIntoView for ensuring focused elements are visible
 * - Utilities for detecting and traversing scroll containers
 */

import Yoga from 'yoga-layout';
import type { CliNode } from './types.js';
import { measureContentSize } from './render/content-measure.js';
import { log } from './logger.js';

/**
 * Scroll state stored on scroll container nodes.
 */
export interface ScrollState {
    /** Vertical scroll offset (pixels from top). */
    scrollTop: number;
    /** Horizontal scroll offset (pixels from left). */
    scrollLeft: number;
    /** Total width of scrollable content. */
    scrollWidth: number;
    /** Total height of scrollable content. */
    scrollHeight: number;
    /** Visible width of the scroll container. */
    clientWidth: number;
    /** Visible height of the scroll container. */
    clientHeight: number;
}

/**
 * Options for setting scroll position.
 */
export interface ScrollOptions {
    /** Target vertical scroll position. */
    top?: number;
    /** Target horizontal scroll position. */
    left?: number;
    /** Scroll behavior (smooth scrolling not yet implemented). */
    behavior?: 'auto' | 'smooth';
}

/**
 * Get the scroll state from a node, returning default values if not initialized.
 * 
 * @param node - The node to get scroll state from.
 * @returns The current scroll state.
 */
export function getScrollState(node: CliNode): ScrollState {
    return node.__scroll ?? {
        scrollTop: 0,
        scrollLeft: 0,
        scrollWidth: 0,
        scrollHeight: 0,
        clientWidth: 0,
        clientHeight: 0,
    };
}

/**
 * Initialize or update scroll state for a scroll container.
 * Measures content size and updates dimensions.
 * 
 * @param node - The scroll container node.
 * @param clientWidth - Visible width of the container.
 * @param clientHeight - Visible height of the container.
 */
export function initScrollState(node: CliNode, clientWidth: number, clientHeight: number): void {
    const contentSize = measureContentSize(node);
    const existing = node.__scroll;
    
    node.__scroll = {
        scrollTop: existing?.scrollTop ?? 0,
        scrollLeft: existing?.scrollLeft ?? 0,
        scrollWidth: contentSize.width,
        scrollHeight: contentSize.height,
        clientWidth,
        clientHeight,
    };
}

/**
 * Set the scroll position of a scroll container.
 * Clamps values to valid ranges.
 * 
 * @param node - The scroll container node.
 * @param options - Scroll position options.
 */
export function setScrollPosition(node: CliNode, options: ScrollOptions): void {
    const state = getScrollState(node);
    const maxScrollTop = Math.max(0, state.scrollHeight - state.clientHeight);
    const maxScrollLeft = Math.max(0, state.scrollWidth - state.clientWidth);
    
    if (options.top !== undefined) {
        state.scrollTop = Math.max(0, Math.min(options.top, maxScrollTop));
    }
    if (options.left !== undefined) {
        state.scrollLeft = Math.max(0, Math.min(options.left, maxScrollLeft));
    }
    
    node.__scroll = state;
}

/**
 * Scroll by a delta amount.
 * 
 * @param node - The scroll container node.
 * @param deltaX - Horizontal scroll delta.
 * @param deltaY - Vertical scroll delta.
 */
export function scrollBy(node: CliNode, deltaX: number, deltaY: number): void {
    const state = getScrollState(node);
    setScrollPosition(node, {
        top: state.scrollTop + deltaY,
        left: state.scrollLeft + deltaX,
    });
}

/**
 * Check if a node is a scroll container based on its overflow style.
 * Checks both computed CSS style (__cssStyle) and inline style (style).
 * 
 * @param node - The node to check.
 * @returns True if the node has overflow: scroll or overflow: auto.
 */
export function isScrollContainer(node: CliNode): boolean {
    const cssStyle = node.__cssStyle ?? {};
    const inlineStyle = node.style ?? {};
    // Check CSS style first (higher specificity), then inline style
    const overflow = cssStyle.overflow ?? cssStyle.overflowY ?? 
                     inlineStyle.overflow ?? inlineStyle.overflowY;
    return overflow === 'scroll' || overflow === 'auto';
}

/**
 * Find the nearest scroll container ancestor of a node.
 * 
 * @param node - The node to start from.
 * @returns The nearest scroll container ancestor, or null if none.
 */
export function findScrollParent(node: CliNode): CliNode | null {
    let current = node.parent;
    let depth = 0;
    const maxDepth = 100;
    while (current && depth < maxDepth) {
        if (isScrollContainer(current)) {
            return current;
        }
        current = current.parent;
        depth++;
    }
    return null;
}

/**
 * Scroll the nearest scroll container to make the target node visible.
 * Implements browser-like scrollIntoView behavior.
 * 
 * @param target - The node to scroll into view.
 * @param visited - Set of already-visited scroll containers (for cycle detection).
 */
export function scrollIntoView(target: CliNode, visited?: Set<CliNode>): void {
    log('scrollIntoView:enter', { 
        target: target.nodeName,
        targetId: target.id,
        visitedCount: visited?.size ?? 0
    });
    
    const scrollParent = findScrollParent(target);
    if (!scrollParent) {
        log('scrollIntoView:noScrollParent');
        return;
    }
    
    log('scrollIntoView:foundParent', { 
        scrollParent: scrollParent.nodeName,
        scrollParentClass: scrollParent.className
    });
    
    // Prevent infinite loops from circular references
    const visitedSet = visited ?? new Set<CliNode>();
    if (visitedSet.has(scrollParent)) {
        log('scrollIntoView:alreadyVisited');
        return;
    }
    visitedSet.add(scrollParent);
    
    const targetLayout = target.computedLayout;
    const parentLayout = scrollParent.computedLayout;
    if (!targetLayout || !parentLayout) {
        log('scrollIntoView:noLayout', { hasTargetLayout: !!targetLayout, hasParentLayout: !!parentLayout });
        return;
    }
    
    // Get or compute client dimensions from layout
    // If scroll state isn't initialized yet, calculate from parent layout
    let scrollState = getScrollState(scrollParent);
    let clientHeight = scrollState.clientHeight;
    let clientWidth = scrollState.clientWidth;
    
    // If dimensions aren't set, compute them from the parent's layout
    if (clientHeight === 0 && parentLayout.height > 0) {
        // Account for borders/padding using Yoga's computed padding
        const yogaNode = scrollParent.yogaNode;
        if (yogaNode) {
            const paddingTop = yogaNode.getComputedPadding(Yoga.EDGE_TOP) || 0;
            const paddingBottom = yogaNode.getComputedPadding(Yoga.EDGE_BOTTOM) || 0;
            clientHeight = parentLayout.height - paddingTop - paddingBottom;
        } else {
            clientHeight = parentLayout.height;
        }
    }
    if (clientWidth === 0 && parentLayout.width > 0) {
        const yogaNode = scrollParent.yogaNode;
        if (yogaNode) {
            const paddingLeft = yogaNode.getComputedPadding(Yoga.EDGE_LEFT) || 0;
            const paddingRight = yogaNode.getComputedPadding(Yoga.EDGE_RIGHT) || 0;
            clientWidth = parentLayout.width - paddingLeft - paddingRight;
        } else {
            clientWidth = parentLayout.width;
        }
    }
    
    // If still no dimensions, can't scroll
    if (clientHeight <= 0) return;
    
    // Get padding offset to convert layout positions to content-relative
    let paddingTop = 0;
    let paddingLeft = 0;
    const yogaNode = scrollParent.yogaNode;
    if (yogaNode) {
        paddingTop = yogaNode.getComputedPadding(Yoga.EDGE_TOP) || 0;
        paddingLeft = yogaNode.getComputedPadding(Yoga.EDGE_LEFT) || 0;
    }
    
    // Calculate target position relative to scroll parent's layout origin
    let targetY = targetLayout.top;
    let targetX = targetLayout.left;
    let current = target.parent;
    
    // Guard against circular parent references with a depth limit
    let depth = 0;
    const maxDepth = 100;
    while (current && current !== scrollParent && depth < maxDepth) {
        if (current.computedLayout) {
            targetY += current.computedLayout.top;
            targetX += current.computedLayout.left;
        }
        current = current.parent;
        depth++;
    }
    
    // Convert to content-relative coordinates by subtracting padding
    // Layout positions include padding offset, but scroll is content-relative
    targetY -= paddingTop;
    targetX -= paddingLeft;
    
    // Simple browser-like scrollIntoView({ block: 'nearest' }) behavior:
    // - If target is above viewport, scroll up so target is at top
    // - If target is below viewport, scroll down so target is at bottom  
    // - If target is already fully visible, don't scroll
    let newScrollTop = scrollState.scrollTop;
    let newScrollLeft = scrollState.scrollLeft;
    
    const viewportTop = scrollState.scrollTop;
    const viewportBottom = viewportTop + clientHeight;
    const targetBottom = targetY + targetLayout.height;
    
    // Vertical scrolling
    if (targetY < viewportTop) {
        // Target is above viewport - scroll up to show it at top
        newScrollTop = targetY;
    } else if (targetBottom > viewportBottom) {
        // Target is below viewport - scroll down to show it at bottom
        newScrollTop = targetBottom - clientHeight;
    }
    
    // Horizontal scrolling  
    const viewportLeft = scrollState.scrollLeft;
    const viewportRight = viewportLeft + clientWidth;
    const targetRight = targetX + targetLayout.width;
    
    if (targetX < viewportLeft) {
        // Target is left of viewport
        newScrollLeft = targetX;
    } else if (targetRight > viewportRight) {
        // Target is right of viewport
        newScrollLeft = targetRight - clientWidth;
    }
    
    // Apply scroll changes - update the scroll state directly
    if (newScrollTop !== scrollState.scrollTop || newScrollLeft !== scrollState.scrollLeft) {
        // Calculate content size for max scroll bounds
        const contentSize = measureContentSize(scrollParent);
        const maxScrollTop = Math.max(0, contentSize.height - clientHeight);
        const maxScrollLeft = Math.max(0, contentSize.width - clientWidth);
        
        // Clamp and set new scroll position
        const clampedScrollTop = Math.max(0, Math.min(newScrollTop, maxScrollTop));
        const clampedScrollLeft = Math.max(0, Math.min(newScrollLeft, maxScrollLeft));
        
        scrollParent.__scroll = {
            ...scrollState,
            scrollTop: clampedScrollTop,
            scrollLeft: clampedScrollLeft,
            clientWidth,
            clientHeight,
            scrollWidth: contentSize.width,
            scrollHeight: contentSize.height,
        };
    }
    
    // For nested scroll containers: ensure the scroll parent itself is visible
    // in any outer scroll containers by recursively calling scrollIntoView
    const outerScrollParent = findScrollParent(scrollParent);
    if (outerScrollParent) {
        log('scrollIntoView:recurse', { 
            scrollParent: scrollParent.nodeName,
            outerScrollParent: outerScrollParent.nodeName 
        });
        scrollIntoView(scrollParent, visitedSet);
    }
    
    log('scrollIntoView:exit');
}

/**
 * Get the maximum scroll position for a scroll container.
 * 
 * @param node - The scroll container node.
 * @returns Object with maxScrollTop and maxScrollLeft values.
 */
export function getMaxScroll(node: CliNode): { maxScrollTop: number; maxScrollLeft: number } {
    const state = getScrollState(node);
    return {
        maxScrollTop: Math.max(0, state.scrollHeight - state.clientHeight),
        maxScrollLeft: Math.max(0, state.scrollWidth - state.clientWidth),
    };
}

/**
 * Check if a scroll container can scroll vertically.
 * 
 * @param node - The scroll container node.
 * @returns True if content exceeds viewport height.
 */
export function canScrollVertically(node: CliNode): boolean {
    const state = getScrollState(node);
    return state.scrollHeight > state.clientHeight;
}

/**
 * Check if a scroll container can scroll horizontally.
 * 
 * @param node - The scroll container node.
 * @returns True if content exceeds viewport width.
 */
export function canScrollHorizontally(node: CliNode): boolean {
    const state = getScrollState(node);
    return state.scrollWidth > state.clientWidth;
}

// ============================================================================
// DOM-Compatible Scroll API
// ============================================================================

/**
 * Options for Element.scroll() and Element.scrollTo() methods.
 * Matches the DOM ScrollToOptions interface.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/scroll
 */
export interface ScrollToOptions {
    /** Target vertical scroll position in pixels. */
    top?: number;
    /** Target horizontal scroll position in pixels. */
    left?: number;
    /** Scroll behavior. 'instant' and 'auto' are immediate; 'smooth' is not yet implemented. */
    behavior?: 'auto' | 'smooth' | 'instant';
}

/**
 * Options for Element.scrollIntoView() method.
 * Matches the DOM ScrollIntoViewOptions interface.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView
 */
export interface ScrollIntoViewOptions {
    /** Scroll behavior. 'instant' and 'auto' are immediate; 'smooth' is not yet implemented. */
    behavior?: 'auto' | 'smooth' | 'instant';
    /** Vertical alignment: 'start' | 'center' | 'end' | 'nearest'. Default is 'nearest'. */
    block?: 'start' | 'center' | 'end' | 'nearest';
    /** Horizontal alignment: 'start' | 'center' | 'end' | 'nearest'. Default is 'nearest'. */
    inline?: 'start' | 'center' | 'end' | 'nearest';
}

/**
 * DOM-compatible scroll() method implementation.
 * Scrolls to specified coordinates or options.
 * 
 * @param node - The scroll container node.
 * @param xOrOptions - X coordinate or ScrollToOptions object.
 * @param y - Y coordinate (only used if first arg is a number).
 */
export function domScroll(
    node: CliNode,
    xOrOptions?: number | ScrollToOptions,
    y?: number
): void {
    if (!isScrollContainer(node)) return;
    
    if (typeof xOrOptions === 'number') {
        setScrollPosition(node, {
            left: xOrOptions,
            top: y ?? 0,
        });
    } else if (xOrOptions && typeof xOrOptions === 'object') {
        setScrollPosition(node, {
            top: xOrOptions.top,
            left: xOrOptions.left,
        });
    }
}

/**
 * DOM-compatible scrollTo() method implementation.
 * Alias for domScroll().
 * 
 * @param node - The scroll container node.
 * @param xOrOptions - X coordinate or ScrollToOptions object.
 * @param y - Y coordinate (only used if first arg is a number).
 */
export function domScrollTo(
    node: CliNode,
    xOrOptions?: number | ScrollToOptions,
    y?: number
): void {
    domScroll(node, xOrOptions, y);
}

/**
 * DOM-compatible scrollBy() method implementation.
 * Scrolls by specified delta coordinates or options.
 * 
 * @param node - The scroll container node.
 * @param xOrOptions - X delta or ScrollToOptions object with deltas.
 * @param y - Y delta (only used if first arg is a number).
 */
export function domScrollBy(
    node: CliNode,
    xOrOptions?: number | ScrollToOptions,
    y?: number
): void {
    if (!isScrollContainer(node)) return;
    
    if (typeof xOrOptions === 'number') {
        scrollBy(node, xOrOptions, y ?? 0);
    } else if (xOrOptions && typeof xOrOptions === 'object') {
        scrollBy(node, xOrOptions.left ?? 0, xOrOptions.top ?? 0);
    }
}

/**
 * DOM-compatible scrollIntoView() method implementation.
 * Scrolls the nearest scroll container to make the target visible.
 * 
 * @param target - The node to scroll into view.
 * @param argOrOptions - Boolean for legacy API or ScrollIntoViewOptions.
 */
export function domScrollIntoView(
    target: CliNode,
    argOrOptions?: boolean | ScrollIntoViewOptions
): void {
    // For now, we implement 'nearest' behavior for both block and inline
    // Full support for 'start', 'center', 'end' can be added later
    // The boolean arg (legacy API): true = alignToTop, false = alignToBottom
    // We treat both as 'nearest' for simplicity
    scrollIntoView(target);
}

/**
 * Attach DOM-compatible scroll methods to a node.
 * This adds scroll(), scrollTo(), scrollBy(), and scrollIntoView() methods
 * that match the standard DOM Element API.
 * 
 * @param node - The node to attach methods to.
 */
export function attachScrollMethods(node: CliNode): void {
    const el = node;
    
    // scroll() and scrollTo() - set absolute position
    el.scroll = function(xOrOptions?: number | ScrollToOptions, y?: number): void {
        domScroll(node, xOrOptions, y);
    };
    
    el.scrollTo = function(xOrOptions?: number | ScrollToOptions, y?: number): void {
        domScrollTo(node, xOrOptions, y);
    };
    
    // scrollBy() - scroll by delta
    el.scrollBy = function(xOrOptions?: number | ScrollToOptions, y?: number): void {
        domScrollBy(node, xOrOptions, y);
    };
    
    // scrollIntoView() - scroll parent to show this element
    el.scrollIntoView = function(argOrOptions?: boolean | ScrollIntoViewOptions): void {
        domScrollIntoView(node, argOrOptions);
    };
}

/**
 * Define scroll property descriptors for Element prototype patching.
 * Returns property descriptors for scrollTop, scrollLeft, scrollWidth,
 * scrollHeight, clientWidth, and clientHeight.
 */
export function getScrollPropertyDescriptors(): PropertyDescriptorMap {
    return {
        scrollTop: {
            get(this: CliNode): number {
                return getScrollState(this).scrollTop;
            },
            set(this: CliNode, value: number): void {
                if (isScrollContainer(this)) {
                    setScrollPosition(this, { top: value });
                }
            },
            configurable: true,
            enumerable: true,
        },
        scrollLeft: {
            get(this: CliNode): number {
                return getScrollState(this).scrollLeft;
            },
            set(this: CliNode, value: number): void {
                if (isScrollContainer(this)) {
                    setScrollPosition(this, { left: value });
                }
            },
            configurable: true,
            enumerable: true,
        },
        scrollWidth: {
            get(this: CliNode): number {
                return getScrollState(this).scrollWidth;
            },
            configurable: true,
            enumerable: true,
        },
        scrollHeight: {
            get(this: CliNode): number {
                return getScrollState(this).scrollHeight;
            },
            configurable: true,
            enumerable: true,
        },
        clientWidth: {
            get(this: CliNode): number {
                return getScrollState(this).clientWidth;
            },
            configurable: true,
            enumerable: true,
        },
        clientHeight: {
            get(this: CliNode): number {
                return getScrollState(this).clientHeight;
            },
            configurable: true,
            enumerable: true,
        },
    };
}

/**
 * Define scroll method descriptors for Element prototype patching.
 * Returns property descriptors for scroll, scrollTo, scrollBy, and scrollIntoView.
 */
export function getScrollMethodDescriptors(): PropertyDescriptorMap {
    return {
        scroll: {
            value: function(this: CliNode, xOrOptions?: number | ScrollToOptions, y?: number): void {
                domScroll(this, xOrOptions, y);
            },
            writable: true,
            configurable: true,
            enumerable: false,
        },
        scrollTo: {
            value: function(this: CliNode, xOrOptions?: number | ScrollToOptions, y?: number): void {
                domScrollTo(this, xOrOptions, y);
            },
            writable: true,
            configurable: true,
            enumerable: false,
        },
        scrollBy: {
            value: function(this: CliNode, xOrOptions?: number | ScrollToOptions, y?: number): void {
                domScrollBy(this, xOrOptions, y);
            },
            writable: true,
            configurable: true,
            enumerable: false,
        },
        scrollIntoView: {
            value: function(this: CliNode, argOrOptions?: boolean | ScrollIntoViewOptions): void {
                domScrollIntoView(this, argOrOptions);
            },
            writable: true,
            configurable: true,
            enumerable: false,
        },
    };
}

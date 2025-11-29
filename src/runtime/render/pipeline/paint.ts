/**
 * Paint pipeline for rendering CLI nodes to the grid.
 * 
 * All styling is driven by computed CSS styles. The user-agent stylesheet
 * provides defaults, and pseudo-classes (:focus, :disabled, etc.) are
 * resolved before rendering.
 */
import Yoga from 'yoga-layout';
import type { CliNode, TextStyle } from '../../types.js';
import { TEXT_NODE } from '../../types.js';
import type { ClipRect, GridCell } from '../types.js';
import { getComputedCliStyle } from '../../style/computed.js';
import { computeStylesheetStyle, computePseudoElementStyle } from '../../style/stylesheet.js';
import { shouldHidePopover, isPopoverOpen, getOpenPopovers } from '../../popover.js';
import { isDialogOpen, isDialogModal, shouldHideDialog, getOpenDialogs, getOpenModals } from '../../dialog.js';
import { clearRenderedImages } from '../image.js';
import { getNodeTag, getNodeChildren } from '../../utils/node.js';
import { clearOcclusionZones } from '../occlusion.js';
import {
    clearTopLayer,
    addPopoverToTopLayer,
    addDialogToTopLayer,
    addModalToTopLayer,
    getTopLayerElements,
    registerTopLayerOcclusion,
    clearGridArea,
    type TopLayerElement,
} from '../top-layer.js';
import type {
    PaintContext,
    NodeBounds,
    Viewport,
} from './context.js';
import {
    childContext,
    createRootContext,
    intersectClip,
    layoutToClip,
} from './context.js';
import {
    getRenderer,
    type RenderContext,
} from '../registry.js';
import {
    isScrollContainer,
    initScrollState,
    getScrollState,
} from '../../scroll.js';
import { rectsOverlap, addOcclusionZone } from '../occlusion.js';
import {
    renderVerticalScrollbar,
    shouldShowVerticalScrollbar,
    getScrollbarStyleFromCSS,
} from '../scrollbar.js';
import { log } from '../../logger.js';
import { getImageBounds } from '../image.js';

// Import renderers to trigger their self-registration
import '../text.js';
import '../input.js';
import '../select.js';
import '../button.js';
import '../progress.js';
import '../meter.js';
import '../image.js';
import '../list.js';
import '../details.js';
import '../table.js';
import '../fieldset.js';

// Import base rendering utilities
import { renderElementBackground, renderElementBorder } from '../base-render.js';
import { isDetailsOpen } from '../details.js';

const INHERITED_TEXT_PROPS: (keyof TextStyle)[] = [
    'color',
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'dim',
    'inverse',
    'textAlign',
];

/**
 * Get the z-index value for a node.
 * Returns 0 for 'auto' or undefined (DOM order preserved).
 * Positioned elements (position != static) with explicit z-index create stacking contexts.
 * 
 * @param node - The node to get z-index for.
 * @returns The z-index value (0 for auto/unset).
 */
function getNodeZIndex(node: CliNode): number {
    const cssStyle = node.__cssStyle;
    const inlineStyle = node.style;
    
    // Check inline style first (higher specificity)
    const inlineZ = inlineStyle?.zIndex;
    if (typeof inlineZ === 'number' && Number.isFinite(inlineZ)) {
        return inlineZ;
    }
    
    // Then check CSS style
    const cssZ = cssStyle?.zIndex;
    if (typeof cssZ === 'number' && Number.isFinite(cssZ)) {
        return cssZ;
    }
    
    return 0; // 'auto' or unset - use DOM order
}

/**
 * Sort children by z-index for proper stacking order.
 * Maintains DOM order for elements with the same z-index.
 * 
 * @param children - Array of child nodes.
 * @returns Sorted array (negative z-index first, then 0/auto, then positive).
 */
function sortByZIndex(children: CliNode[]): CliNode[] {
    // Create array with original indices to maintain stable sort
    const indexed = children.map((child, index) => ({
        child,
        index,
        zIndex: getNodeZIndex(child),
    }));
    
    // Sort by z-index, then by DOM order for equal z-index
    indexed.sort((a, b) => {
        if (a.zIndex !== b.zIndex) {
            return a.zIndex - b.zIndex;
        }
        return a.index - b.index; // Stable sort by DOM order
    });
    
    return indexed.map(item => item.child);
}

/**
 * Extract inherited text style properties from a computed style.
 */
function inheritTextStyle(style?: TextStyle): TextStyle | undefined {
    if (!style) return undefined;
    const next: TextStyle = {};
    const styleRecord = style as Record<string, unknown>;
    const nextRecord = next as Record<string, unknown>;
    for (const prop of INHERITED_TEXT_PROPS) {
        const value = styleRecord[prop];
        if (value !== undefined) {
            nextRecord[prop] = value;
        }
    }
    return next;
}

/**
 * Paint a node subtree within constrained bounds.
 * 
 * This is the key function for nested rendering. It allows any container
 * (table cells, fieldsets, scrollable areas, etc.) to paint arbitrary
 * content within a bounded rectangular area.
 * 
 * The node is painted at the specified position with proper clipping,
 * regardless of its original computed layout.
 * 
 * @param node - The node to paint.
 * @param ctx - The paint context.
 * @param bounds - The constrained bounds to paint within.
 */
export function paintConstrained(
    node: CliNode,
    ctx: PaintContext,
    bounds: { x: number; y: number; width: number; height: number }
): void {
    const constrainedClip = layoutToClip(bounds);
    const clippedBounds = intersectClip(ctx.clip, constrainedClip);
    
    if (!clippedBounds) {
        return;
    }
    
    const constrainedCtx = childContext(ctx, {
        layoutOverride: bounds,
        clip: clippedBounds,
        parentX: bounds.x,
        parentY: bounds.y,
    });
    
    paintNode(node, constrainedCtx);
}

/**
 * Paint a single child node using context.
 * Used by renderers that need to paint children at custom positions.
 * 
 * @param child - The child node to paint.
 * @param ctx - The paint context.
 */
export function paintChild(child: CliNode, ctx: PaintContext): void {
    paintNode(child, ctx);
}

/**
 * Paint the entire tree starting from the root node.
 * 
 * @param root - The root node of the tree.
 * @param grid - The render grid.
 */
export function paintTree(root: CliNode, grid: GridCell[][]): void {
    log('paintTree:enter');
    
    // Clear state from previous render
    clearRenderedImages();
    clearOcclusionZones();
    clearTopLayer();
    
    // Create root context with skipTopLayer=true for main tree pass
    const ctx = createRootContext(grid, true);

    // Paint main tree, skipping open popovers (they go on the top layer)
    log('paintTree:paintNode:start');
    paintNode(root, ctx);
    log('paintTree:paintNode:done');
    
    // Collect open popovers for the top layer
    log('paintTree:popovers:start');
    const openPopovers = getOpenPopovers();
    log('paintTree:popovers:count', { count: openPopovers.length });
    for (let i = 0; i < openPopovers.length; i++) {
        const popover = openPopovers[i];
        const bounds = getPopoverBounds(popover, ctx.viewport);
        if (bounds) {
            addPopoverToTopLayer(popover, bounds.x, bounds.y, bounds.width, bounds.height, i);
        }
    }
    
    // Collect open dialogs for the top layer
    log('paintTree:dialogs:start');
    const openDialogs = getOpenDialogs();
    log('paintTree:dialogs:count', { count: openDialogs.length });
    let nonModalIndex = 0;
    let modalIndex = 0;
    for (const dialog of openDialogs) {
        const bounds = getDialogBounds(dialog, ctx.viewport);
        if (bounds) {
            if (isDialogModal(dialog)) {
                // Get backdrop style from dialog's computed style
                const backdropStyle = getDialogBackdropStyle(dialog);
                addModalToTopLayer(dialog, bounds.x, bounds.y, bounds.width, bounds.height, modalIndex++, backdropStyle);
            } else {
                addDialogToTopLayer(dialog, bounds.x, bounds.y, bounds.width, bounds.height, nonModalIndex++);
            }
        }
    }
    
    // Render all top-layer elements in z-index order
    log('paintTree:topLayer:start');
    const topLayerElements = getTopLayerElements();
    log('paintTree:topLayer:count', { count: topLayerElements.length });
    for (const element of topLayerElements) {
        log('paintTree:topLayer:render', { type: element.type });
        renderTopLayerElement(element, grid, ctx.viewport);
    }
    log('paintTree:exit');
}

/**
 * Paint a single node and its children.
 * 
 * @param node - The node to paint.
 * @param ctx - The paint context.
 */
function paintNode(node: CliNode, ctx: PaintContext): void {
    if (!node.computedLayout) return;
    if (shouldHidePopover(node)) return;
    if (shouldHideDialog(node)) return;
    // Skip open popovers and dialogs during main tree paint - they render on the top layer
    if (ctx.skipTopLayer && isPopoverOpen(node)) return;
    if (ctx.skipTopLayer && isDialogOpen(node)) return;
    
    // Skip table parts - they're rendered by the table renderer
    const partTag = getNodeTag(node);
    if (['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'].includes(partTag)) return;

    const { grid, viewport, parentX, parentY, parentStyle, clip, containerBounds, skipTopLayer, layoutOverride } = ctx;
    
    // Use layout override if provided, otherwise use computed layout
    let left: number, top: number, width: number, height: number;
    if (layoutOverride) {
        left = 0;
        top = 0;
        width = layoutOverride.width;
        height = layoutOverride.height;
    } else {
        ({ left, top, width, height } = node.computedLayout);
    }
    
    const computedStyle = getComputedCliStyle(node, parentStyle);
    const resolvedPosition = readPosition(node);
    const isFixed = resolvedPosition === 'fixed';
    const anchored = node.__anchoredPosition;
    const leftOffset = isFixed ? readLayoutOffset(node, 'left') : undefined;
    const rightOffset = isFixed ? readLayoutOffset(node, 'right') : undefined;
    const topOffset = isFixed ? readLayoutOffset(node, 'top') : undefined;
    const bottomOffset = isFixed ? readLayoutOffset(node, 'bottom') : undefined;

    // Calculate absolute position
    let absX: number, absY: number;
    if (layoutOverride) {
        absX = layoutOverride.x;
        absY = layoutOverride.y;
    } else if (anchored) {
        absX = anchored.x;
        absY = anchored.y;
    } else if (isFixed) {
        absX = resolveFixedCoordinate(leftOffset, rightOffset, width, viewport.width, left);
        absY = resolveFixedCoordinate(topOffset, bottomOffset, height, viewport.height, top);
    } else {
        absX = parentX + left;
        absY = parentY + top;
    }
    
    // Ensure width/height are valid numbers (text nodes may have null/undefined)
    const safeWidth = typeof width === 'number' && !Number.isNaN(width) ? width : 0;
    const safeHeight = typeof height === 'number' && !Number.isNaN(height) ? height : 0;
    
    const nodeRect: ClipRect = {
        x1: absX,
        y1: absY,
        x2: absX + safeWidth,
        y2: absY + safeHeight,
    };
    const clipSource = isFixed ? viewport.clip : clip;
    let nodeClip = intersectClip(clipSource, nodeRect);
    if (!nodeClip) {
        if (clipSource && rectOverlapsClip(nodeRect, clipSource)) {
            nodeClip = clipSource;
        } else if (!clipSource) {
            nodeClip = nodeRect;
        } else {
            return;
        }
    }

    const isText = node.nodeType === TEXT_NODE || node.type === 'text';
    const tagName = isText ? '#text' : getNodeTag(node);
    const isFormControl = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || tagName === 'button';
    
    // Create node bounds for rendering utilities
    const nodeBounds: NodeBounds = {
        absX,
        absY,
        width,
        height,
        clip: nodeClip,
    };
    
    // Get element's z-index for occlusion checking
    const elementZIndex = getNodeZIndex(node);
    
    // Register occlusion for images with lower z-index
    // This ensures images are properly clipped when higher z-index elements paint over them
    if (safeWidth > 0 && safeHeight > 0 && !isText) {
        const imageBounds = getImageBounds();
        const elementRect = { x: absX, y: absY, width: safeWidth, height: safeHeight };
        
        for (const imgBound of imageBounds) {
            // If this element has higher z-index than the image and overlaps it,
            // register an occlusion zone so the image knows to clip
            if (elementZIndex > imgBound.zIndex && rectsOverlap(elementRect, imgBound)) {
                addOcclusionZone({
                    x: Math.max(absX, imgBound.x),
                    y: Math.max(absY, imgBound.y),
                    width: Math.min(absX + safeWidth, imgBound.x + imgBound.width) - Math.max(absX, imgBound.x),
                    height: Math.min(absY + safeHeight, imgBound.y + imgBound.height) - Math.max(absY, imgBound.y),
                    zIndex: elementZIndex,
                });
            }
        }
    }
    
    // Check for registered renderer first
    const registeredRenderer = getRenderer(tagName);
    
    // Determine if this element needs base rendering (background/border)
    // Form controls and text nodes handle their own rendering
    // Elements with registered renderers may handle their own base rendering
    const needsBaseRender = !isFormControl && !isText;
    const hasBorder = computedStyle.borderStyle && computedStyle.borderStyle !== 'none';
    
    // Render background for non-form-control, non-text elements without registered renderers
    // Elements with registered renderers handle their own background if needed
    if (needsBaseRender && !registeredRenderer) {
        renderElementBackground(grid, nodeBounds, computedStyle);
    }

    // For form controls, draw borders FIRST so content renders inside them
    if (isFormControl && hasBorder) {
        renderElementBorder(node, grid, nodeBounds, computedStyle);
    }
    
    if (registeredRenderer) {
        // Create render context with paint utilities
        // For text alignment, use the parent's container bounds if available
        const renderCtx: RenderContext = {
            grid,
            viewport,
            parentX: absX,
            parentY: absY,
            parentStyle: computedStyle,
            clip: nodeClip,
            containerBounds: containerBounds ?? {
                x: absX,
                width,
                clip: nodeClip,
            },
            skipTopLayer: skipTopLayer,
            paintChild: (child: CliNode, childCtx: PaintContext) => {
                paintNode(child, childCtx);
            },
            paintConstrained: (childNode: CliNode, childCtx: PaintContext, bounds: { x: number; y: number; width: number; height: number }) => {
                const constrainedClip = layoutToClip(bounds);
                const clippedBounds = intersectClip(childCtx.clip, constrainedClip);
                if (!clippedBounds) return;
                
                const constrainedCtx = childContext(childCtx, {
                    layoutOverride: bounds,
                    clip: clippedBounds,
                    parentX: bounds.x,
                    parentY: bounds.y,
                });
                paintNode(childNode, constrainedCtx);
            },
        };
        
        // Call the registered renderer
        registeredRenderer.render(node, renderCtx, nodeBounds, computedStyle);
        
        // If renderer handles its own children, we're done
        if (registeredRenderer.customChildren) {
            return;
        }
        
        // Otherwise, fall through to paint children
        // Calculate content area for text wrapping (same logic as non-registered path)
        let rendererContentX = absX;
        let rendererContentWidth = width;
        let rendererContentClip = nodeClip;
        
        if (node.yogaNode) {
            const paddingTop = node.yogaNode.getComputedPadding(Yoga.EDGE_TOP) || 0;
            const paddingRight = node.yogaNode.getComputedPadding(Yoga.EDGE_RIGHT) || 0;
            const paddingBottom = node.yogaNode.getComputedPadding(Yoga.EDGE_BOTTOM) || 0;
            const paddingLeft = node.yogaNode.getComputedPadding(Yoga.EDGE_LEFT) || 0;
            
            rendererContentX = absX + paddingLeft;
            rendererContentWidth = width - paddingLeft - paddingRight;
            
            if (paddingTop > 0 || paddingRight > 0 || paddingBottom > 0 || paddingLeft > 0) {
                const contentX1 = absX + paddingLeft;
                const contentY1 = absY + paddingTop;
                const contentX2 = absX + width - paddingRight;
                const contentY2 = absY + height - paddingBottom;
                
                if (contentX1 < contentX2 && contentY1 < contentY2) {
                    const contentRect: ClipRect = { x1: contentX1, y1: contentY1, x2: contentX2, y2: contentY2 };
                    rendererContentClip = intersectClip(nodeClip, contentRect) ?? nodeClip;
                }
            }
        }
        
        const childContainerBounds = {
            x: rendererContentX,
            width: rendererContentWidth,
            clip: rendererContentClip,
        };
        
        // Calculate content height and padding for scroll
        let rendererContentHeight = height;
        let rendererPaddingTop = 0;
        let rendererPaddingLeft = 0;
        if (node.yogaNode) {
            rendererPaddingTop = node.yogaNode.getComputedPadding(Yoga.EDGE_TOP) || 0;
            rendererPaddingLeft = node.yogaNode.getComputedPadding(Yoga.EDGE_LEFT) || 0;
            const pBottom = node.yogaNode.getComputedPadding(Yoga.EDGE_BOTTOM) || 0;
            rendererContentHeight = height - rendererPaddingTop - pBottom;
        }
        
        // Check if this is a scroll container
        const isRendererScrollable = isScrollContainer(node);
        let rendererScrollOffsetX = 0;
        let rendererScrollOffsetY = 0;

        if (isRendererScrollable) {
            initScrollState(node, rendererContentWidth, rendererContentHeight);
            const scrollState = getScrollState(node);
            rendererScrollOffsetX = scrollState.scrollLeft;
            rendererScrollOffsetY = scrollState.scrollTop;
        }
        
        const inheritedStyle = inheritTextStyle(computedStyle);
        const childCtx = childContext(ctx, {
            parentX: absX - rendererScrollOffsetX,
            parentY: absY - rendererScrollOffsetY,
            parentStyle: inheritedStyle,
            clip: rendererContentClip,
            containerBounds: childContainerBounds,
            scrollOffset: isRendererScrollable ? { x: rendererScrollOffsetX, y: rendererScrollOffsetY } : undefined,
        });
        
        // Get children and sort by z-index for proper stacking order
        const rendererRawChildren = getNodeChildren(node);
        const rendererValidChildren = rendererRawChildren.filter(
            (child): child is CliNode => child && typeof child === 'object'
        );
        const rendererSortedChildren = sortByZIndex(rendererValidChildren);
        
        for (const childNode of rendererSortedChildren) {
            // Virtualization for scroll containers
            if (isRendererScrollable && childNode.computedLayout) {
                // Child positions include padding offset, so we convert to content-relative
                const childRect = {
                    x: childNode.computedLayout.left - rendererPaddingLeft - rendererScrollOffsetX,
                    y: childNode.computedLayout.top - rendererPaddingTop - rendererScrollOffsetY,
                    width: childNode.computedLayout.width,
                    height: childNode.computedLayout.height,
                };
                const viewportRect = {
                    x: 0,
                    y: 0,
                    width: rendererContentWidth,
                    height: rendererContentHeight,
                };
                if (!rectsOverlap(childRect, viewportRect)) {
                    continue;
                }
            }
            
            paintNode(childNode, childCtx);
        }
        return;
    }

    // Render borders for non-form-control, non-text elements without registered renderers
    // These elements render borders after background (borders appear on top)
    if (needsBaseRender && !registeredRenderer && hasBorder) {
        renderElementBorder(node, grid, nodeBounds, computedStyle);
    }

    // Calculate content clip that excludes padding
    // Children should be clipped to the content area (inside padding), not the full node rect
    // Note: borders are drawn OVER the edge cells, not as additional insets - Yoga doesn't know about them
    let contentClip = nodeClip;
    let contentX = absX;
    let contentWidth = width;
    
    if (node.yogaNode) {
        const paddingTop = node.yogaNode.getComputedPadding(Yoga.EDGE_TOP) || 0;
        const paddingRight = node.yogaNode.getComputedPadding(Yoga.EDGE_RIGHT) || 0;
        const paddingBottom = node.yogaNode.getComputedPadding(Yoga.EDGE_BOTTOM) || 0;
        const paddingLeft = node.yogaNode.getComputedPadding(Yoga.EDGE_LEFT) || 0;
        
        // Calculate content area dimensions (for text wrapping)
        contentX = absX + paddingLeft;
        contentWidth = width - paddingLeft - paddingRight;
        
        // Only apply content clip if there's actual padding
        if (paddingTop > 0 || paddingRight > 0 || paddingBottom > 0 || paddingLeft > 0) {
            const contentX1 = absX + paddingLeft;
            const contentY1 = absY + paddingTop;
            const contentX2 = absX + width - paddingRight;
            const contentY2 = absY + height - paddingBottom;
            
            if (contentX1 < contentX2 && contentY1 < contentY2) {
                const contentRect: ClipRect = { x1: contentX1, y1: contentY1, x2: contentX2, y2: contentY2 };
                contentClip = intersectClip(nodeClip, contentRect) ?? nodeClip;
            }
        }
    }

    // Calculate container bounds for text alignment in children
    // Use content width (inside padding) for text wrapping calculations
    const childContainerBounds = {
        x: contentX,
        width: contentWidth,
        clip: contentClip,
    };

    // Calculate content height and padding for scroll calculations
    let contentHeight = height;
    let paddingTop = 0;
    let paddingLeft = 0;
    if (node.yogaNode) {
        paddingTop = node.yogaNode.getComputedPadding(Yoga.EDGE_TOP) || 0;
        paddingLeft = node.yogaNode.getComputedPadding(Yoga.EDGE_LEFT) || 0;
        const paddingBottom = node.yogaNode.getComputedPadding(Yoga.EDGE_BOTTOM) || 0;
        contentHeight = height - paddingTop - paddingBottom;
    }

    // Check if this is a scroll container
    const isScrollable = isScrollContainer(node);
    let scrollOffsetX = 0;
    let scrollOffsetY = 0;

    if (isScrollable) {
        // Initialize/update scroll state with current dimensions
        initScrollState(node, contentWidth, contentHeight);
        const scrollState = getScrollState(node);
        scrollOffsetX = scrollState.scrollLeft;
        scrollOffsetY = scrollState.scrollTop;
    }

    const inheritedStyle = inheritTextStyle(computedStyle);
    const childCtx = childContext(ctx, {
        parentX: absX - scrollOffsetX,
        parentY: absY - scrollOffsetY,
        parentStyle: inheritedStyle,
        clip: contentClip,
        containerBounds: childContainerBounds,
        scrollOffset: isScrollable ? { x: scrollOffsetX, y: scrollOffsetY } : undefined,
    });
    
    // Get children and sort by z-index for proper stacking order
    const rawChildren = getNodeChildren(node);
    const validChildren = rawChildren.filter(
        (child): child is CliNode => child && typeof child === 'object'
    );
    const sortedChildren = sortByZIndex(validChildren);
    
    // Check if this is a closed <details> element - only render <summary> children
    const isClosedDetails = tagName === 'details' && !isDetailsOpen(node);
    
    for (const childNode of sortedChildren) {
        // For closed <details>, only render <summary> children
        if (isClosedDetails && getNodeTag(childNode) !== 'summary') {
            continue;
        }
        
        // Skip children outside visible area when inside a scroll container (virtualization)
        if (isScrollable && childNode.computedLayout) {
            // Child positions include padding offset, so we convert to content-relative
            // by subtracting paddingTop/Left, then apply scroll offset
            const childRect = {
                x: childNode.computedLayout.left - paddingLeft - scrollOffsetX,
                y: childNode.computedLayout.top - paddingTop - scrollOffsetY,
                width: childNode.computedLayout.width,
                height: childNode.computedLayout.height,
            };
            const viewportRect = {
                x: 0,
                y: 0,
                width: contentWidth,
                height: contentHeight,
            };
            if (!rectsOverlap(childRect, viewportRect)) {
                continue; // Skip off-screen children
            }
        }
        
        paintNode(childNode, childCtx);
    }
    
    // Render scrollbar for scroll containers
    if (isScrollable) {
        const scrollState = getScrollState(node);
        const overflowStyle = computedStyle.overflow ?? computedStyle.overflowY;
        
        if (shouldShowVerticalScrollbar(scrollState, overflowStyle)) {
            const scrollbarStyle = getScrollbarStyleFromCSS(computedStyle);
            // Draw scrollbar just inside the border (border -> scrollbar -> padding -> content)
            // In CLI, borders are 1 char wide when present
            const borderWidth = hasBorder ? 1 : 0;
            const scrollbarX = absX + width - borderWidth - 1;
            const scrollbarY = absY + borderWidth;
            const scrollbarHeight = height - (borderWidth * 2);
            renderVerticalScrollbar(
                grid,
                scrollbarX,
                scrollbarY,
                scrollbarHeight,
                scrollState,
                scrollbarStyle,
                nodeClip
            );
        }
    }
}

/**
 * Calculate the absolute bounds of a popover node.
 */
function getPopoverBounds(
    popover: CliNode,
    viewport: Viewport
): { x: number; y: number; width: number; height: number } | null {
    if (!popover.computedLayout) return null;
    
    const { left, top, width, height } = popover.computedLayout;
    const stylesheetStyle = computeStylesheetStyle(popover);
    const isFixed = stylesheetStyle.position === 'fixed';
    const anchored = popover.__anchoredPosition;
    
    let absX: number, absY: number;
    if (anchored) {
        absX = anchored.x;
        absY = anchored.y;
    } else if (isFixed) {
        const leftOffset = typeof stylesheetStyle.left === 'number' ? stylesheetStyle.left : undefined;
        const topOffset = typeof stylesheetStyle.top === 'number' ? stylesheetStyle.top : undefined;
        const rightOffset = typeof stylesheetStyle.right === 'number' ? stylesheetStyle.right : undefined;
        const bottomOffset = typeof stylesheetStyle.bottom === 'number' ? stylesheetStyle.bottom : undefined;
        absX = leftOffset !== undefined ? leftOffset : 
               rightOffset !== undefined ? viewport.width - width - rightOffset : left;
        absY = topOffset !== undefined ? topOffset :
               bottomOffset !== undefined ? viewport.height - height - bottomOffset : top;
    } else {
        absX = left;
        absY = top;
    }
    
    return { x: absX, y: absY, width, height };
}

/**
 * Calculate the absolute bounds of a dialog node.
 * Dialogs default to centering in the viewport unless positioned.
 */
function getDialogBounds(
    dialog: CliNode,
    viewport: Viewport
): { x: number; y: number; width: number; height: number } | null {
    if (!dialog.computedLayout) return null;
    
    const { left, top, width, height } = dialog.computedLayout;
    const stylesheetStyle = computeStylesheetStyle(dialog);
    const isFixed = stylesheetStyle.position === 'fixed';
    const isAbsolute = stylesheetStyle.position === 'absolute';
    
    let absX: number, absY: number;
    
    if (isFixed || isAbsolute) {
        const leftOffset = typeof stylesheetStyle.left === 'number' ? stylesheetStyle.left : undefined;
        const topOffset = typeof stylesheetStyle.top === 'number' ? stylesheetStyle.top : undefined;
        const rightOffset = typeof stylesheetStyle.right === 'number' ? stylesheetStyle.right : undefined;
        const bottomOffset = typeof stylesheetStyle.bottom === 'number' ? stylesheetStyle.bottom : undefined;
        absX = leftOffset !== undefined ? leftOffset : 
               rightOffset !== undefined ? viewport.width - width - rightOffset :
               Math.floor((viewport.width - width) / 2); // Center horizontally
        absY = topOffset !== undefined ? topOffset :
               bottomOffset !== undefined ? viewport.height - height - bottomOffset :
               Math.floor((viewport.height - height) / 2); // Center vertically
    } else {
        // Default: center in viewport
        absX = Math.floor((viewport.width - width) / 2);
        absY = Math.floor((viewport.height - height) / 2);
    }
    
    return { x: absX, y: absY, width, height };
}

/**
 * Get the backdrop style for a modal dialog.
 * Reads from ::backdrop pseudo-element CSS.
 */
function getDialogBackdropStyle(dialog: CliNode): TextStyle | undefined {
    // Get ::backdrop pseudo-element styles
    const backdropStyle = computePseudoElementStyle(dialog, 'backdrop');
    
    if (backdropStyle.backgroundColor) {
        return { backgroundColor: backdropStyle.backgroundColor };
    }
    
    // Default dark backdrop (terminals don't support true transparency)
    return { backgroundColor: '#333333' };
}

/**
 * Render a top-layer element (popover, dropdown, modal, etc.).
 * Handles clearing, occlusion registration, and rendering.
 */
function renderTopLayerElement(
    element: TopLayerElement,
    grid: GridCell[][],
    viewport: Viewport
): void {
    const { x, y, width, height } = element;
    
    // Use custom renderer if provided (e.g., for dropdowns)
    // Custom renderers handle their own clearing and occlusion since they may
    // calculate different bounds than what's passed to addToTopLayer
    if (element.render) {
        element.render(element, grid, viewport);
        return;
    }
    
    // For modal dialogs, render backdrop first (covers entire viewport)
    if (element.type === 'modal') {
        const data = element.data as { backdropStyle?: TextStyle } | undefined;
        renderModalBackdrop(grid, viewport, data?.backdropStyle);
    }
    
    // Clear the area first - ensures content beneath is fully occluded
    clearGridArea(grid, x, y, width, height, viewport.clip);
    
    // Register as occlusion zone for image rendering
    registerTopLayerOcclusion(element);
    
    // Default rendering: paint the node and its children
    if (element.node) {
        // Create a fresh context for top-layer rendering with position override
        const topLayerCtx: PaintContext = {
            ...createRootContext(grid, false),
            layoutOverride: { x, y, width, height },
        };
        paintNode(element.node, topLayerCtx);
    }
}

/**
 * Render a modal backdrop (semi-transparent overlay covering the viewport).
 */
function renderModalBackdrop(
    grid: GridCell[][],
    viewport: Viewport,
    style?: TextStyle
): void {
    const backdropChar = ' ';
    const backdropStyle = style ?? { backgroundColor: 'rgba(0, 0, 0, 0.5)' };
    
    for (let row = 0; row < viewport.height && row < grid.length; row++) {
        const gridRow = grid[row];
        if (!gridRow) continue;
        for (let col = 0; col < viewport.width && col < gridRow.length; col++) {
            gridRow[col] = { char: backdropChar, style: backdropStyle };
        }
        }
    }

/**
 * Read the position property from a node's style.
 */
function readPosition(node: CliNode): string | undefined {
    const stylesheetStyle = computeStylesheetStyle(node);
    if (stylesheetStyle.position) {
        return stylesheetStyle.position as string;
    }
    const style = node.style;
    if (!style) return undefined;
    return style.position;
}

/**
 * Read a layout offset (left, right, top, bottom) from a node's style.
 */
function readLayoutOffset(node: CliNode, prop: 'left' | 'right' | 'top' | 'bottom'): number | undefined {
    const stylesheetStyle = computeStylesheetStyle(node);
    const cssValue = stylesheetStyle[prop];
    if (cssValue !== undefined) {
        if (typeof cssValue === 'number') return cssValue;
        if (typeof cssValue === 'string') {
            const parsed = parseFloat(cssValue);
            if (!Number.isNaN(parsed)) return parsed;
        }
    }
    const style = node.style;
    if (!style) return undefined;
    const value = style[prop];
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        if (!Number.isNaN(parsed)) return parsed;
    }
    return undefined;
}

/**
 * Resolve a fixed position coordinate.
 */
function resolveFixedCoordinate(
    startOffset: number | undefined,
    endOffset: number | undefined,
    size: number,
    viewportSize: number,
    fallback: number
): number {
    if (startOffset !== undefined) {
        return startOffset;
    }
    if (endOffset !== undefined) {
        return viewportSize - size - endOffset;
    }
    return fallback;
}

/**
 * Check if a rectangle overlaps with a clip region.
 */
function rectOverlapsClip(rect: ClipRect, clip: ClipRect): boolean {
    return rect.x1 < clip.x2 && rect.x2 > clip.x1 && rect.y1 < clip.y2 && rect.y2 > clip.y1;
}

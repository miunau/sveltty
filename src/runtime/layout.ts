/**
 * Yoga layout integration for DOM nodes
 */

import Yoga from 'yoga-layout';
import type { CliNode, StyleDimension } from './types.js';
import type { FlexStyle, Style } from './types.js';
import { computeStylesheetStyle } from './style/stylesheet.js';
import { shouldHidePopover } from './popover.js';
import { shouldHideDialog } from './dialog.js';
import { isDetailsOpen } from './render/details.js';
import { getNodeTag, getNodeChildren, getInputType } from './utils/node.js';
import { getListNestingLevel } from './render/list.js';
import { LAYOUT_DEFAULTS } from './style/defaults.js';
import { getTableDimensions } from './render/table.js';
import { isCalcValue, type CalcContext } from './style/calc.js';

interface EdgeInsets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

interface EdgeValues {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
}

/**
 * Current layout context used for resolving calc expressions.
 * Set during computeLayout and used by applyDimension.
 */
let currentLayoutContext: CalcContext = {
    containerWidth: 80,
    containerHeight: 24,
    axis: 'width',
};

const ZERO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Check if a node is a non-summary child of a closed <details> element.
 * Such children should be hidden from layout.
 */
function shouldHideDetailsChild(node: CliNode): boolean {
    const parent = node.parent;
    if (!parent) return false;
    
    const parentTag = getNodeTag(parent);
    if (parentTag !== 'details') return false;
    
    // If the details is open, don't hide children
    if (isDetailsOpen(parent)) return false;
    
    // Only show <summary> children when details is closed
    const nodeTag = getNodeTag(node);
    return nodeTag !== 'summary';
}

/**
 * Apply flexbox styles to a Yoga node
 */
export function applyStylesToYoga(node: CliNode): void {
    const cssStyle = (node.__cssStyle ?? {}) as Style;
    const inlineStyle = (node.style ?? {}) as Style;
    const style: Style = { ...cssStyle, ...inlineStyle };
    const tagName = getNodeTag(node);
    const inputType = getInputType(node);
    const isTextControl = tagName === 'input' || tagName === 'select' || tagName === 'textarea';
    const isButton = tagName === 'button';
    const isFormControl = isTextControl || isButton;
    const isList = tagName === 'ul' || tagName === 'ol';
    const isListItem = tagName === 'li';
    const isDetails = tagName === 'details';
    const isSummary = tagName === 'summary';
    const isProgress = tagName === 'progress';
    const isTableEl = tagName === 'table';
    const isTablePart = ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'].includes(tagName);

    // Form controls get default borders if not explicitly set
    if (isFormControl && style.borderStyle === undefined) {
        style.borderStyle = 'single';
    }
    
    const hasBorders = style.borderStyle && style.borderStyle !== 'none';
    const borderHeight = hasBorders ? 2 : 0; // top + bottom borders

    if (isTextControl && style.width === undefined) {
        if (tagName === 'input' && (inputType === 'checkbox' || inputType === 'radio')) {
            // Checkbox/radio: 1 character content + 2 border chars = 3
            const borderWidth = hasBorders ? 2 : 0;
            style.width = 3 + borderWidth;
        } else {
            style.width = LAYOUT_DEFAULTS.DEFAULT_INPUT_WIDTH;
        }
    }

    if (isTextControl && style.height === undefined) {
        if (tagName === 'input' && (inputType === 'checkbox' || inputType === 'radio')) {
            style.height = 1 + borderHeight;
        } else if (tagName === 'textarea') {
            const rows = Number(node.rows);
            const rowCount = Number.isFinite(rows) && rows > 0 ? Math.floor(rows) : 1;
            style.height = Math.max(rowCount + borderHeight, 1 + borderHeight);
        } else {
            style.height = 1 + borderHeight;
        }
    }

    // Only set default button height if no padding is specified
    // If padding is present, let Yoga calculate the height from content + padding + borders
    const hasPadding = style.padding !== undefined || 
                       style.paddingTop !== undefined || 
                       style.paddingBottom !== undefined ||
                       style.paddingY !== undefined;
    if (isButton && style.height === undefined && !hasPadding) {
        style.height = 1 + borderHeight;
    }
    
    // Store computed defaults back on node for rendering to access
    if (isFormControl) {
        if (!node.style) {
            node.style = {};
        }
        if (node.style.borderStyle === undefined && style.borderStyle) {
            node.style.borderStyle = style.borderStyle;
        }
    }

    // List elements: default to column layout, apply nesting margin
    if (isList) {
        if (style.flexDirection === undefined) {
            style.flexDirection = 'column';
        }
        // Default left margin for nested lists
        if (style.marginLeft === undefined && style.margin === undefined) {
            const nestingLevel = getListNestingLevel(node);
            if (nestingLevel > 0) {
                style.marginLeft = LAYOUT_DEFAULTS.LIST_INDENT_PER_LEVEL;
            }
        }
        // Default padding-left for marker space
        if (style.paddingLeft === undefined && style.padding === undefined) {
            style.paddingLeft = LAYOUT_DEFAULTS.LIST_MARKER_PADDING;
        }
    }

    // List items: row layout by default
    if (isListItem) {
        if (style.flexDirection === undefined) {
            style.flexDirection = 'row';
        }
    }

    // Details: column layout
    if (isDetails) {
        if (style.flexDirection === undefined) {
            style.flexDirection = 'column';
        }
    }

    // Summary: row layout for marker + text
    if (isSummary) {
        if (style.flexDirection === undefined) {
            style.flexDirection = 'row';
        }
        // Reserve space for the disclosure marker
        if (style.paddingLeft === undefined && style.padding === undefined) {
            style.paddingLeft = LAYOUT_DEFAULTS.SUMMARY_MARKER_PADDING;
        }
    }

    // Progress: default dimensions
    if (isProgress) {
        if (style.width === undefined) {
            style.width = LAYOUT_DEFAULTS.DEFAULT_PROGRESS_WIDTH;
        }
        if (style.height === undefined) {
            style.height = 1;
        }
    }

    // Meter: default dimensions (same as progress)
    const isMeter = tagName === 'meter';
    if (isMeter) {
        if (style.width === undefined) {
            style.width = LAYOUT_DEFAULTS.DEFAULT_PROGRESS_WIDTH;
        }
        if (style.height === undefined) {
            style.height = 1;
        }
    }

    // Table: calculate dimensions from content
    if (isTableEl) {
        const tableDims = getTableDimensions(node);
        if (style.width === undefined) {
            style.width = tableDims.width;
        }
        if (style.height === undefined) {
            style.height = tableDims.height;
        }
    }

    // Table parts (thead, tbody, tfoot, tr, td, th): hide from layout
    // They're handled by the table renderer
    if (isTablePart) {
        style.display = 'none';
    }
    
    const yogaNode = node.yogaNode;

    // Flex container properties
    if (style.flexDirection) {
        yogaNode.setFlexDirection(mapFlexDirection(style.flexDirection));
    }

    if (style.flexWrap) {
        yogaNode.setFlexWrap(mapFlexWrap(style.flexWrap));
    }

    if (style.flexGrow !== undefined) {
        yogaNode.setFlexGrow(style.flexGrow);
    }

    if (style.flexShrink !== undefined) {
        yogaNode.setFlexShrink(style.flexShrink);
    }

    if (style.flexBasis !== undefined) {
        applyDimension(
            yogaNode.setFlexBasis.bind(yogaNode),
            style.flexBasis,
            yogaNode.setFlexBasisPercent?.bind(yogaNode)
        );
    }

    // Dimensions
    if (style.width !== undefined) {
        applyDimension(
            yogaNode.setWidth.bind(yogaNode),
            style.width,
            yogaNode.setWidthPercent.bind(yogaNode)
        );
    }

    if (style.height !== undefined) {
        applyDimension(
            yogaNode.setHeight.bind(yogaNode),
            style.height,
            yogaNode.setHeightPercent.bind(yogaNode),
            'height'
        );
    }

    if (style.minWidth !== undefined) {
        applyDimension(
            yogaNode.setMinWidth.bind(yogaNode),
            style.minWidth,
            yogaNode.setMinWidthPercent?.bind(yogaNode),
            'width'
        );
    }

    if (style.minHeight !== undefined) {
        applyDimension(
            yogaNode.setMinHeight.bind(yogaNode),
            style.minHeight,
            yogaNode.setMinHeightPercent?.bind(yogaNode),
            'height'
        );
    }

    if (style.maxWidth !== undefined) {
        applyDimension(
            yogaNode.setMaxWidth.bind(yogaNode),
            style.maxWidth,
            yogaNode.setMaxWidthPercent?.bind(yogaNode),
            'width'
        );
    }

    if (style.maxHeight !== undefined) {
        applyDimension(
            yogaNode.setMaxHeight.bind(yogaNode),
            style.maxHeight,
            yogaNode.setMaxHeightPercent?.bind(yogaNode),
            'height'
        );
    }

    // Margins
    applyEdges(yogaNode, 'margin', style);

    // Padding + border thickness so content honors border-box semantics
    const borderInsets = getBorderInsetsForLayout(style);
    applyEdges(yogaNode, 'padding', style, borderInsets);

    // Alignment
    if (style.justifyContent) {
        yogaNode.setJustifyContent(mapJustifyContent(style.justifyContent));
    }

    if (style.alignItems) {
        yogaNode.setAlignItems(mapAlignItems(style.alignItems));
    }

    if (style.alignSelf) {
        yogaNode.setAlignSelf(mapAlignSelf(style.alignSelf));
    }

    if (style.alignContent) {
        yogaNode.setAlignContent(mapAlignContent(style.alignContent));
    }

    // Position
    if (style.position) {
        yogaNode.setPositionType(
            style.position === 'absolute' || style.position === 'fixed'
                ? Yoga.POSITION_TYPE_ABSOLUTE
                : Yoga.POSITION_TYPE_RELATIVE
        );
    }

    if (style.top !== undefined) {
        applyPositionValue(yogaNode, Yoga.EDGE_TOP, style.top, 'height');
    }

    if (style.right !== undefined) {
        applyPositionValue(yogaNode, Yoga.EDGE_RIGHT, style.right, 'width');
    }

    if (style.bottom !== undefined) {
        applyPositionValue(yogaNode, Yoga.EDGE_BOTTOM, style.bottom, 'height');
    }

    if (style.left !== undefined) {
        applyPositionValue(yogaNode, Yoga.EDGE_LEFT, style.left, 'width');
    }

    // Display
    let desiredDisplay: number | undefined;
    if (style.display === 'none') {
        desiredDisplay = Yoga.DISPLAY_NONE;
    } else if (style.display === 'flex') {
        desiredDisplay = Yoga.DISPLAY_FLEX;
    }

    if (shouldHidePopover(node) || shouldHideDialog(node)) {
        desiredDisplay = Yoga.DISPLAY_NONE;
    } else if (shouldHideDetailsChild(node)) {
        // Hide non-summary children of closed <details> elements
        desiredDisplay = Yoga.DISPLAY_NONE;
    } else if (desiredDisplay === undefined) {
        desiredDisplay = Yoga.DISPLAY_FLEX;
    }

    if (desiredDisplay !== undefined) {
        yogaNode.setDisplay(desiredDisplay);
    }

    // Overflow
    const overflow = style.overflow ?? 'hidden';
    const overflowY = style.overflowY ?? overflow;
    if (overflowY === 'visible') {
        yogaNode.setOverflow(Yoga.OVERFLOW_VISIBLE);
    } else if (overflowY === 'scroll' || overflowY === 'auto') {
        yogaNode.setOverflow(Yoga.OVERFLOW_SCROLL);
    } else {
        yogaNode.setOverflow(Yoga.OVERFLOW_HIDDEN);
    }

    // Gap
    const gapValue = normalizeGapValue(style.gap);
    if (gapValue !== undefined) {
        yogaNode.setGap(Yoga.GUTTER_ALL, gapValue);
    }

    const rowGapValue = normalizeGapValue(style.rowGap);
    if (rowGapValue !== undefined) {
        yogaNode.setGap(Yoga.GUTTER_ROW, rowGapValue);
    }

    const columnGapValue = normalizeGapValue(style.columnGap);
    if (columnGapValue !== undefined) {
        yogaNode.setGap(Yoga.GUTTER_COLUMN, columnGapValue);
    }

    // Recursively apply to children
    for (const child of getNodeChildren(node)) {
        applyStylesToYoga(child);
    }
}

/**
 * Compute layout for the entire tree
 */
export function computeLayout(
    root: CliNode,
    width?: number,
    height?: number
): void {
    // Set layout context for calc resolution
    currentLayoutContext = {
        containerWidth: width ?? 80,
        containerHeight: height ?? 24,
        axis: 'width',
    };
    
    hydrateStylesheetStyles(root);
    applyStylesToYoga(root);

    // Calculate layout
    root.yogaNode.calculateLayout(width, height, Yoga.DIRECTION_LTR);

    // Extract computed values
    extractComputedLayout(root);
    positionPopovers(root);
}

/**
 * Extract computed layout from Yoga into our nodes
 */
function extractComputedLayout(node: CliNode): void {
    const layout = node.yogaNode.getComputedLayout();

    node.computedLayout = {
        left: layout.left,
        top: layout.top,
        width: layout.width,
        height: layout.height,
    };

    // Recursively extract for children
    for (const child of getNodeChildren(node)) {
        extractComputedLayout(child);
    }
}

function hydrateStylesheetStyles(node: CliNode): void {
    node.__cssStyle = computeStylesheetStyle(node);
    for (const child of getNodeChildren(node)) {
        hydrateStylesheetStyles(child);
    }
}

function positionPopovers(root: CliNode): void {
    const registry: AnchorRegistry = {
        byId: new Map(),
        byName: new Map(),
    };
    collectAnchors(root, registry);
    applyPopoverPositions(root, registry);
}

interface AnchorRegistry {
    byId: Map<string, CliNode>;
    byName: Map<string, CliNode[]>;
}

function collectAnchors(node: CliNode, registry: AnchorRegistry): void {
    const nodeId = node.id;
    if (nodeId) {
        registry.byId.set(nodeId, node);
    }
    for (const name of getAnchorNames(node)) {
        if (!registry.byName.has(name)) {
            registry.byName.set(name, []);
        }
        registry.byName.get(name)!.push(node);
    }
    for (const child of getNodeChildren(node)) {
        collectAnchors(child, registry);
    }
}

function applyPopoverPositions(node: CliNode, registry: AnchorRegistry): void {
    const needsAnchor = hasAnchorReference(node);
    if (needsAnchor && node.computedLayout) {
        const anchorNode = resolveAnchorTarget(node, registry);
        if (anchorNode?.computedLayout) {
            const placement = resolvePlacement(node);
            const offset = resolveAnchorOffset(node);
            const anchorCoords = getAbsolutePosition(anchorNode);
            const anchorRect = anchorNode.computedLayout;
            const popRect = node.computedLayout;
            const anchoredPosition = computeAnchoredPosition(
                placement,
                offset,
                anchorCoords,
                anchorRect,
                popRect
            );
            node.__anchoredPosition = anchoredPosition;
        } else if (node.__anchoredPosition) {
            delete node.__anchoredPosition;
        }
    } else if (node.__anchoredPosition) {
        delete node.__anchoredPosition;
    }

    for (const child of getNodeChildren(node)) {
        applyPopoverPositions(child, registry);
    }
}

function hasAnchorReference(node: CliNode): boolean {
    if (node.anchor) return true;
    return getPositionAnchorNames(node).length > 0;
}

function resolveAnchorTarget(node: CliNode, registry: AnchorRegistry): CliNode | null {
    const anchorId = node.anchor;
    if (anchorId) {
        const byId = registry.byId.get(anchorId);
        if (byId) return byId;
    }
    const cssAnchors = getPositionAnchorNames(node);
    for (const name of cssAnchors) {
        const candidates = registry.byName.get(name);
        if (candidates?.length) {
            return candidates[candidates.length - 1];
        }
    }
    return null;
}

function getAnchorNames(node: CliNode): string[] {
    const value = getStyleValue(node, 'anchorName');
    return parseAnchorList(value);
}

function getPositionAnchorNames(node: CliNode): string[] {
    const value = getStyleValue(node, 'positionAnchor');
    return parseAnchorList(value);
}

function parseAnchorList(value: unknown): string[] {
    if (value === null || value === undefined) return [];
    const text = String(value).trim();
    if (!text || text.toLowerCase() === 'none' || text.toLowerCase() === 'auto') {
        return [];
    }
    return text
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .filter(token => token.startsWith('--'));
}

function resolvePlacement(node: CliNode): 'top' | 'bottom' | 'left' | 'right' {
    const cssArea = getStyleValue(node, 'positionArea');
    const cssPlacement = parsePlacement(cssArea);
    if (cssPlacement) {
        return cssPlacement;
    }
    const legacy = parsePlacement(node.popoverPlacement);
    return legacy ?? 'bottom';
}

function parsePlacement(value: unknown): 'top' | 'bottom' | 'left' | 'right' | undefined {
    if (value === null || value === undefined) return undefined;
    const text = String(value).toLowerCase();
    if (!text) return undefined;
    if (text.includes('top') || text.includes('block-start')) return 'top';
    if (text.includes('bottom') || text.includes('block-end')) return 'bottom';
    if (text.includes('right') || text.includes('inline-end')) return 'right';
    if (text.includes('left') || text.includes('inline-start')) return 'left';
    return undefined;
}

function resolveAnchorOffset(node: CliNode): number {
    const value = node.popoverOffset;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    return 0;
}

function getStyleValue(node: CliNode, key: keyof FlexStyle): unknown {
    const inline = (node.style as FlexStyle | undefined)?.[key];
    if (inline !== undefined) {
        return inline;
    }
    const cssStyle = node.__cssStyle as FlexStyle | undefined;
    if (cssStyle && cssStyle[key] !== undefined) {
        return cssStyle[key];
    }
    return undefined;
}

function computeAnchoredPosition(
    placement: string,
    offset: number,
    anchorCoords: { x: number; y: number },
    anchorRect: { width: number; height: number },
    popRect: { width: number; height: number }
): { x: number; y: number } {
    let x = anchorCoords.x;
    let y = anchorCoords.y;
    switch (placement) {
        case 'top':
            y = anchorCoords.y - popRect.height - offset;
            break;
        case 'left':
            x = anchorCoords.x - popRect.width - offset;
            break;
        case 'right':
            x = anchorCoords.x + anchorRect.width + offset;
            break;
        case 'bottom':
        default:
            y = anchorCoords.y + anchorRect.height + offset;
            break;
    }
    return {
        x: Math.max(0, x),
        y: Math.max(0, y),
    };
}

function getAbsolutePosition(node: CliNode): { x: number; y: number } {
    let current: CliNode | null = node;
    let x = 0;
    let y = 0;
    while (current && current.computedLayout) {
        x += current.computedLayout.left;
        y += current.computedLayout.top;
        current = current.parent;
    }
    return { x, y };
}

/**
 * Apply dimension value (number or percentage)
 */
function applyDimension(
    setter: (value: number) => void,
    value: StyleDimension,
    percentSetter?: (value: number) => void,
    axis: 'width' | 'height' = 'width'
): void {
    if (value === undefined || value === null) return;
    
    // Handle CalcValue - resolve with current layout context
    if (isCalcValue(value)) {
        const ctx = { ...currentLayoutContext, axis };
        const resolved = value.resolve(ctx);
        if (Number.isFinite(resolved)) {
            setter(resolved);
        }
        return;
    }
    
    if (typeof value === 'number' && Number.isFinite(value)) {
        setter(value);
        return;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return;
        if (trimmed.endsWith('%')) {
            const percent = parseFloat(trimmed);
            if (!Number.isNaN(percent)) {
                if (percentSetter) {
                    percentSetter(percent);
                } else {
                    setter(percent);
                }
            }
            return;
        }
        if (trimmed.endsWith('ch')) {
            const cols = parseFloat(trimmed.slice(0, -2));
            if (!Number.isNaN(cols)) {
                setter(cols);
            }
            return;
        }
        const numeric = Number(trimmed);
        if (!Number.isNaN(numeric)) {
            setter(numeric);
        }
    }
}

/**
 * Apply a position value (top, right, bottom, left) to a Yoga node.
 * Handles CalcValue by resolving with current layout context.
 */
function applyPositionValue(
    yogaNode: ReturnType<typeof Yoga.Node.create>,
    edge: number,
    value: StyleDimension,
    axis: 'width' | 'height'
): void {
    if (value === undefined || value === null) return;
    
    // Handle CalcValue
    if (isCalcValue(value)) {
        const ctx = { ...currentLayoutContext, axis };
        const resolved = value.resolve(ctx);
        if (Number.isFinite(resolved)) {
            yogaNode.setPosition(edge, resolved);
        }
        return;
    }
    
    if (typeof value === 'number' && Number.isFinite(value)) {
        yogaNode.setPosition(edge, value);
        return;
    }
    
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return;
        if (trimmed.endsWith('%')) {
            const percent = parseFloat(trimmed);
            if (!Number.isNaN(percent)) {
                yogaNode.setPositionPercent?.(edge, percent);
            }
            return;
        }
        if (trimmed.endsWith('ch')) {
            const cols = parseFloat(trimmed.slice(0, -2));
            if (!Number.isNaN(cols)) {
                yogaNode.setPosition(edge, cols);
            }
            return;
        }
        const numeric = Number(trimmed);
        if (!Number.isNaN(numeric)) {
            yogaNode.setPosition(edge, numeric);
        }
    }
}

/**
 * Apply edge values (margin/padding)
 */
function applyEdges(
    yogaNode: ReturnType<typeof Yoga.Node.create>,
    type: 'margin' | 'padding',
    style: FlexStyle,
    extra: EdgeInsets = ZERO_INSETS
): void {
    const setEdge =
        type === 'margin' ? yogaNode.setMargin.bind(yogaNode) : yogaNode.setPadding.bind(yogaNode);
    const values = resolveEdgeValues(style, type);

    applyEdgeValue(setEdge, Yoga.EDGE_TOP, values.top, extra.top);
    applyEdgeValue(setEdge, Yoga.EDGE_RIGHT, values.right, extra.right);
    applyEdgeValue(setEdge, Yoga.EDGE_BOTTOM, values.bottom, extra.bottom);
    applyEdgeValue(setEdge, Yoga.EDGE_LEFT, values.left, extra.left);
}

function resolveEdgeValues(style: FlexStyle, type: 'margin' | 'padding'): EdgeValues {
    const resolved: EdgeValues = {};
    const shorthand = normalizeEdgeValue(style[type]);
    if (shorthand !== undefined) {
        resolved.top = shorthand;
        resolved.right = shorthand;
        resolved.bottom = shorthand;
        resolved.left = shorthand;
    }

    const axisX = normalizeEdgeValue(style[`${type}X`]);
    if (axisX !== undefined) {
        resolved.left = axisX;
        resolved.right = axisX;
    }

    const axisY = normalizeEdgeValue(style[`${type}Y`]);
    if (axisY !== undefined) {
        resolved.top = axisY;
        resolved.bottom = axisY;
    }

    const top = normalizeEdgeValue(style[`${type}Top`]);
    if (top !== undefined) {
        resolved.top = top;
    }
    const right = normalizeEdgeValue(style[`${type}Right`]);
    if (right !== undefined) {
        resolved.right = right;
    }
    const bottom = normalizeEdgeValue(style[`${type}Bottom`]);
    if (bottom !== undefined) {
        resolved.bottom = bottom;
    }
    const left = normalizeEdgeValue(style[`${type}Left`]);
    if (left !== undefined) {
        resolved.left = left;
    }

    return resolved;
}

function applyEdgeValue(
    setter: (edge: number, value: number) => void,
    edge: number,
    base: number | undefined,
    extra: number | undefined
): void {
    const extraValue = extra ?? 0;
    if (base === undefined && extraValue === 0) {
        return;
    }
    const total = (base ?? 0) + extraValue;
    setter(edge, total);
}

function normalizeEdgeValue(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        if (trimmed.endsWith('ch')) {
            const cols = parseFloat(trimmed.slice(0, -2));
            return Number.isNaN(cols) ? undefined : cols;
        }
        const numeric = Number(trimmed);
        return Number.isNaN(numeric) ? undefined : numeric;
    }
    return undefined;
}

function normalizeGapValue(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        if (trimmed.endsWith('ch')) {
            const cols = parseFloat(trimmed.slice(0, -2));
            return Number.isNaN(cols) ? undefined : cols;
        }
        const numeric = Number(trimmed);
        return Number.isNaN(numeric) ? undefined : numeric;
    }
    return undefined;
}

// Mapping functions

function mapFlexDirection(value: FlexStyle['flexDirection']): number {
    switch (value) {
        case 'row': return Yoga.FLEX_DIRECTION_ROW;
        case 'column': return Yoga.FLEX_DIRECTION_COLUMN;
        case 'row-reverse': return Yoga.FLEX_DIRECTION_ROW_REVERSE;
        case 'column-reverse': return Yoga.FLEX_DIRECTION_COLUMN_REVERSE;
        default: return Yoga.FLEX_DIRECTION_ROW;
    }
}

function mapFlexWrap(value: FlexStyle['flexWrap']): number {
    switch (value) {
        case 'nowrap': return Yoga.WRAP_NO_WRAP;
        case 'wrap': return Yoga.WRAP_WRAP;
        case 'wrap-reverse': return Yoga.WRAP_WRAP_REVERSE;
        default: return Yoga.WRAP_NO_WRAP;
    }
}

function mapJustifyContent(value: FlexStyle['justifyContent']): number {
    switch (value) {
        case 'flex-start': return Yoga.JUSTIFY_FLEX_START;
        case 'flex-end': return Yoga.JUSTIFY_FLEX_END;
        case 'center': return Yoga.JUSTIFY_CENTER;
        case 'space-between': return Yoga.JUSTIFY_SPACE_BETWEEN;
        case 'space-around': return Yoga.JUSTIFY_SPACE_AROUND;
        case 'space-evenly': return Yoga.JUSTIFY_SPACE_EVENLY;
        default: return Yoga.JUSTIFY_FLEX_START;
    }
}

function mapAlignItems(value: FlexStyle['alignItems']): number {
    switch (value) {
        case 'flex-start': return Yoga.ALIGN_FLEX_START;
        case 'flex-end': return Yoga.ALIGN_FLEX_END;
        case 'center': return Yoga.ALIGN_CENTER;
        case 'stretch': return Yoga.ALIGN_STRETCH;
        case 'baseline': return Yoga.ALIGN_BASELINE;
        default: return Yoga.ALIGN_FLEX_START;
    }
}

function mapAlignSelf(value: FlexStyle['alignSelf']): number {
    switch (value) {
        case 'auto': return Yoga.ALIGN_AUTO;
        case 'flex-start': return Yoga.ALIGN_FLEX_START;
        case 'flex-end': return Yoga.ALIGN_FLEX_END;
        case 'center': return Yoga.ALIGN_CENTER;
        case 'stretch': return Yoga.ALIGN_STRETCH;
        case 'baseline': return Yoga.ALIGN_BASELINE;
        default: return Yoga.ALIGN_AUTO;
    }
}

function mapAlignContent(value: FlexStyle['alignContent']): number {
    switch (value) {
        case 'flex-start': return Yoga.ALIGN_FLEX_START;
        case 'flex-end': return Yoga.ALIGN_FLEX_END;
        case 'center': return Yoga.ALIGN_CENTER;
        case 'stretch': return Yoga.ALIGN_STRETCH;
        case 'space-between': return Yoga.ALIGN_SPACE_BETWEEN;
        case 'space-around': return Yoga.ALIGN_SPACE_AROUND;
        default: return Yoga.ALIGN_FLEX_START;
    }
}

function getBorderInsetsForLayout(style: Style): EdgeInsets {
    const borderStyle = style.borderStyle;
    if (!borderStyle || borderStyle === 'none') {
        return ZERO_INSETS;
    }
    const edgeEnabled = (flag: boolean | undefined): boolean => flag !== false;
    return {
        top: edgeEnabled(style.borderTop) ? 1 : 0,
        right: edgeEnabled(style.borderRight) ? 1 : 0,
        bottom: edgeEnabled(style.borderBottom) ? 1 : 0,
        left: edgeEnabled(style.borderLeft) ? 1 : 0,
    };
}

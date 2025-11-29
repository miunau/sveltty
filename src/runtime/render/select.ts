/**
 * Select element renderer for CLI.
 * 
 * Styling is driven by computed CSS styles. The user-agent stylesheet defines defaults,
 * and pseudo-classes (:focus, :disabled, :invalid) are resolved before rendering.
 */
import type { ClipRect, GridCell } from './types.js';
import type { CliNode, TextStyle, BorderStyle } from '../types.js';
import type { ElementRenderer } from './registry.js';
import type { TopLayerElement } from './top-layer.js';
import { registerRenderer } from './registry.js';
import { addDropdownToTopLayer, clearGridArea } from './top-layer.js';
import { addOcclusionZone } from './occlusion.js';
import { getDomNode } from '../dom/happy.js';
import { getPaddingInsets, getBorderInsets, resolveClip, setCell } from './utils.js';
import { getBorderChars } from './border.js';
import { getNodeTag, getNodeChildren } from '../utils/node.js';
import { getStringWidth, sliceByWidth } from './string-width.js';
import { renderVerticalScrollbar, getScrollbarStyleFromCSS } from './scrollbar.js';
import type { ScrollState } from '../scroll.js';
import { computePseudoElementStyle } from '../style/stylesheet.js';

export function renderSelect(
    node: CliNode,
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    isFocused: boolean,
    textStyle: TextStyle,
    clip?: ClipRect
): void {
    const resolvedClip = resolveClip(grid, clip);
    const domSelect = getDomNode(node as CliNode) as HTMLSelectElement | undefined;
    // Prefer CLI node for options - DOM node may have stale/empty text
    const opts = collectOptionsForRender(node);
    const multiple = Boolean(domSelect?.multiple ?? node.multiple);
    const selectedIndex = domSelect?.selectedIndex ?? node.selectedIndex ?? 0;
    const idx = Math.min(Math.max(selectedIndex, 0), Math.max(opts.length - 1, 0));
    const current = multiple
        ? (opts.filter((o: any) => o.selected).map((o: any) => o.label).join(', ') || (opts[idx]?.label ?? ''))
        : opts[idx]?.label ?? '';
    const baseX = Math.floor(x);
    const baseY = Math.floor(y);
    const frameWidth = Math.max(1, Math.floor(width) || 1);
    const frameHeight = Math.max(1, Math.floor(height) || 1);
    const padding = getPaddingInsets(node as CliNode);
    const clipX1 = Math.floor(resolvedClip.x1);
    const clipX2 = Math.ceil(resolvedClip.x2);
    const clipY1 = Math.floor(resolvedClip.y1);
    const clipY2 = Math.ceil(resolvedClip.y2);

    const disabled = domSelect?.disabled ?? node.disabled;

    // textStyle already has :focus/:disabled/:invalid styles applied by stylesheet
    const selectStyle: TextStyle = disabled 
        ? { ...textStyle, dim: textStyle.dim ?? true }
        : textStyle;

    const border = getBorderInsets(selectStyle);

    const innerLeft = baseX + border.left;
    const innerRight = Math.max(innerLeft, baseX + frameWidth - border.right - 1);
    const innerTop = baseY + border.top;
    const innerBottom = Math.max(innerTop, baseY + frameHeight - border.bottom - 1);

    const padLeft = padding.left;
    const padRight = padding.right;
    const padTop = padding.top;
    const padBottom = padding.bottom;

    let contentLeft = innerLeft + padLeft;
    let contentRight = innerRight - padRight;
    if (contentRight < contentLeft) {
        contentRight = contentLeft;
    }
    let contentTop = innerTop + padTop;
    let contentBottom = innerBottom - padBottom;
    if (contentBottom < contentTop) {
        contentBottom = contentTop;
    }

    const contentWidth = Math.max(1, contentRight - contentLeft + 1);
    const contentHeight = Math.max(1, contentBottom - contentTop + 1);

    const indicatorChar = multiple ? '' : Boolean(node.__dropdownOpen) && isFocused ? '↑' : '↓';
    const textSlotWidth = multiple ? contentWidth : Math.max(contentWidth - 1, 0);
    // Truncate value text by display width
    const valueText = sliceByWidth(current, textSlotWidth);

    // Calculate interior area (inside borders) for background fill
    const innerX = baseX + border.left;
    const innerY = baseY + border.top;
    const innerWidth = Math.max(1, frameWidth - border.left - border.right);
    const innerHeight = Math.max(1, frameHeight - border.top - border.bottom);
    
    // Fill entire inner area with background
    for (let row = 0; row < innerHeight; row++) {
        const gy = innerY + row;
        if (gy < clipY1 || gy >= clipY2) continue;
        for (let col = 0; col < innerWidth; col++) {
            const gx = innerX + col;
            if (gx < clipX1 || gx >= clipX2) continue;
            setCell(grid, gy, gx, ' ', selectStyle);
        }
    }

    // Draw the select value text on top (using display width)
    for (let row = 0; row < contentHeight; row++) {
        const gy = contentTop + row;
        if (gy < clipY1 || gy >= clipY2) continue;
        
        if (row === 0) {
            // Render value text with proper Unicode handling
            let col = 0;
            for (const char of valueText) {
                const charWidth = getStringWidth(char);
                if (charWidth === 0) continue;
                if (col >= textSlotWidth) break;
                const gx = contentLeft + col;
                if (gx >= clipX1 && gx < clipX2) {
                    setCell(grid, gy, gx, char, selectStyle);
                    if (charWidth === 2 && col + 1 < textSlotWidth && gx + 1 < clipX2) {
                        setCell(grid, gy, gx + 1, '', selectStyle);
                    }
                }
                col += charWidth;
            }
            // Pad space between value and indicator
            while (col < textSlotWidth) {
                const gx = contentLeft + col;
                if (gx >= clipX1 && gx < clipX2) {
                    setCell(grid, gy, gx, ' ', selectStyle);
                }
                col++;
            }
            // Draw indicator at the right edge (if not multiple select)
            if (indicatorChar && col < contentWidth) {
                const gx = contentLeft + col;
                if (gx >= clipX1 && gx < clipX2) {
                    setCell(grid, gy, gx, indicatorChar, selectStyle);
                }
            }
        } else {
            // Empty row - fill with spaces
            for (let col = 0; col < contentWidth; col++) {
            const gx = contentLeft + col;
                if (gx >= clipX1 && gx < clipX2) {
                    setCell(grid, gy, gx, ' ', selectStyle);
                }
            }
        }
    }
    // Dropdown is rendered as an overlay in paint.ts, not inline here
}

/** Represents an option or optgroup in the dropdown. */
export interface SelectItem {
    /** Display label */
    label: string;
    /** Option value (undefined for optgroups) */
    value?: any;
    /** Whether this option is selected */
    selected?: boolean;
    /** Whether this item is disabled */
    disabled?: boolean;
    /** Whether this is an optgroup header (not selectable) */
    isGroup?: boolean;
    /** Indentation level (0 for top-level, 1 for items in optgroups) */
    indent?: number;
}

/**
 * Collect options and optgroups from a select element for rendering.
 * Returns a flat list with optgroup headers marked as non-selectable.
 */
export function collectOptionsForRender(node: any): SelectItem[] {
    // Check for pre-populated options array (non-empty)
    if (node && Array.isArray(node.options) && node.options.length > 0) {
        // Legacy format - convert to SelectItem
        return node.options.map((opt: any) => ({
            label: opt.label ?? '',
            value: opt.value,
            selected: opt.selected,
            disabled: opt.disabled,
            isGroup: false,
            indent: 0,
        }));
    }
    
    // Fall back to iterating children for option and optgroup elements
    const result: SelectItem[] = [];
    
    function processChildren(parent: CliNode, indent: number, groupDisabled: boolean): void {
        for (const child of getNodeChildren(parent)) {
            const tag = getNodeTag(child);
            
            if (tag === 'optgroup') {
                // Add optgroup header
                const groupLabel = child.label ?? child.textContent ?? '';
                const isDisabled = groupDisabled || !!child.disabled;
                result.push({
                    label: String(groupLabel).trim(),
                    isGroup: true,
                    disabled: isDisabled,
                    indent: indent,
                });
                // Process options within the optgroup
                processChildren(child, indent + 1, isDisabled);
            } else if (tag === 'option') {
            const label = child.textContent ?? child.value ?? '';
            const value = child.value ?? label;
                result.push({
                    label: String(label).trim(),
                    value,
                    selected: child.selected,
                    disabled: groupDisabled || !!child.disabled,
                    isGroup: false,
                    indent: indent,
                });
        }
    }
    }
    
    processChildren(node, 0, false);
    return result;
}

/**
 * Select element renderer.
 * Registered with the element registry to handle <select> elements.
 */
export const selectRenderer: ElementRenderer = {
    tags: ['select'],
    customChildren: true,
    
    render(node, ctx, bounds, computedStyle) {
        const isFocused = node.__focusState === 'focused';
        renderSelect(
            node,
            ctx.grid,
            bounds.absX,
            bounds.absY,
            bounds.width,
            bounds.height,
            isFocused,
            computedStyle,
            bounds.clip
        );
        
        // Register dropdown for top-layer rendering if open
        if (isFocused && node.__dropdownOpen) {
            const selectBorderStyle = computedStyle.borderStyle ?? 'single';
            addDropdownToTopLayer(
                node,
                bounds.absX,
                bounds.absY,
                bounds.width,
                bounds.height,
                computedStyle,
                selectBorderStyle,
                renderDropdownOverlay
            );
        }
    },
};

/**
 * Renders a dropdown overlay for a select element.
 * Uses CSS styles from the select element.
 */
function renderDropdownOverlay(
    element: TopLayerElement,
    grid: GridCell[][],
    viewport: { width: number; height: number; clip: ClipRect }
): void {
    const { node, x, y, width, height, data } = element;
    const { style, borderStyle } = data as { style: TextStyle; borderStyle: BorderStyle['borderStyle'] };
    const domSelect = getDomNode(node) as HTMLSelectElement | undefined;
    // Prefer CLI node for options - DOM node may have empty text content
    const opts = collectOptionsForRender(node);
    if (opts.length === 0) return;

    // Find the selected option index (accounting for optgroups which aren't selectable)
    const selectableOpts = opts.filter(o => !o.isGroup);
    const idx = domSelect?.selectedIndex ?? node.selectedIndex ?? 0;
    const selectedValue = selectableOpts[Math.min(Math.max(idx, 0), selectableOpts.length - 1)]?.value;
    // Find the index in the full opts array that matches the selected value
    const selectedIdx = opts.findIndex(o => !o.isGroup && o.value === selectedValue);

    // Calculate dropdown dimensions (using display width for proper Unicode support)
    // Width = borders (2) + left padding (1) + indent + label width + right padding (1)
    const optionPadding = 1;
    const indentWidth = 2; // Characters per indent level
    const maxLabelWidth = Math.max(...opts.map(o => {
        const indent = (o.indent ?? 0) * indentWidth;
        return getStringWidth(o.label ?? '') + indent;
    }));
    const dropdownWidth = Math.max(width, maxLabelWidth + 2 + optionPadding * 2); // borders + padding

    // Determine available space above and below
    const spaceBelow = viewport.height - (y + height);
    const spaceAbove = y;
    const opensDown = spaceBelow >= spaceAbove;
    
    // Maximum dropdown height: whichever is smaller of:
    // - 10 options (reasonable default)
    // - Half the viewport height
    // - Available space in chosen direction minus 2 (for borders)
    const maxDropdownOptions = 10;
    const availableSpace = opensDown ? spaceBelow : spaceAbove;
    const maxBySpace = Math.max(1, availableSpace - 2); // -2 for borders
    const maxByViewport = Math.max(1, Math.floor(viewport.height / 2));
    const maxVisibleOptions = Math.min(opts.length, maxDropdownOptions, maxBySpace, maxByViewport);
    const optionCount = Math.max(1, maxVisibleOptions);
    const dropdownHeight = optionCount + 2; // +2 for borders

    let dropdownX = x;
    let dropdownY = opensDown ? y + height - 1 : y - dropdownHeight + 1;

    // Clamp to viewport
    dropdownX = Math.max(0, Math.min(dropdownX, viewport.width - dropdownWidth));
    dropdownY = Math.max(0, Math.min(dropdownY, viewport.height - dropdownHeight));

    // Clear the dropdown area and register occlusion with actual calculated bounds
    clearGridArea(grid, dropdownX, dropdownY, dropdownWidth, dropdownHeight, viewport.clip);
    addOcclusionZone({
        x: dropdownX,
        y: dropdownY,
        width: dropdownWidth,
        height: dropdownHeight,
        zIndex: element.zIndex,
    });

    // Calculate visible option range (scroll to keep selected visible)
    const visibleCount = optionCount;
    let scrollOffset = Math.max(0, selectedIdx - Math.floor(visibleCount / 2));
    scrollOffset = Math.min(scrollOffset, Math.max(0, opts.length - visibleCount));

    // Resolve dropdown styles from ::picker(select) pseudo-element, falling back to select styles
    const pickerStyle = computePseudoElementStyle(node, 'picker');
    const dropdownBg = pickerStyle.backgroundColor ?? style.backgroundColor;
    const dropdownBorderColor = pickerStyle.borderColor ?? style.borderColor ?? '#555555';
    const textColor = pickerStyle.color ?? style.color ?? 'white';
    
    // Option styles
    const optionBaseStyle: TextStyle = { 
        backgroundColor: dropdownBg,
        color: textColor,
    };
    // Selected option style - use cyan and bold
    const selectedOptionStyle: TextStyle = { 
        ...optionBaseStyle,
        color: 'cyan',
        bold: true,
    };
    // Disabled option style
    const disabledOptionStyle: TextStyle = {
        ...optionBaseStyle,
        dim: true,
    };
    // Optgroup header style - bold and slightly dimmed
    const optgroupStyle: TextStyle = {
        ...optionBaseStyle,
        bold: true,
        color: style.color ?? 'white',
    };
    // Disabled optgroup style
    const disabledOptgroupStyle: TextStyle = {
        ...optgroupStyle,
        dim: true,
    };

    const borderCellStyle: TextStyle = { color: dropdownBorderColor, backgroundColor: dropdownBg };
    const borderChars = getBorderChars(borderStyle);

    // Dropdown bounds
    const x1 = dropdownX;
    const x2 = dropdownX + dropdownWidth - 1;
    let contentStartY: number;
    let contentEndY: number;

    if (opensDown) {
        // Opening downward: shared top border, own bottom border
        const sharedY = dropdownY;
        const bottomY = dropdownY + dropdownHeight;
        contentStartY = sharedY + 1;
        contentEndY = bottomY - 1;

        // Draw connecting corners on the shared row (replacing select's bottom corners)
        if (sharedY >= 0 && sharedY < grid.length) {
            if (x1 >= 0 && x1 < grid[sharedY].length) {
                grid[sharedY][x1] = { char: borderChars.teeRight, style: borderCellStyle };
            }
            if (x2 >= 0 && x2 < grid[sharedY].length) {
                grid[sharedY][x2] = { char: borderChars.teeLeft, style: borderCellStyle };
            }
            // Draw horizontal line connecting the T-junctions
            for (let col = x1 + 1; col < x2; col++) {
                if (col >= 0 && col < grid[sharedY].length) {
                    grid[sharedY][col] = { char: borderChars.horizontal, style: borderCellStyle };
                }
            }
        }

        // Fill dropdown background
        for (let row = contentStartY; row <= contentEndY; row++) {
            if (row < 0 || row >= grid.length) continue;
            for (let col = x1; col <= x2; col++) {
                if (col < 0 || col >= grid[row].length) continue;
                grid[row][col] = { char: ' ', style: { backgroundColor: dropdownBg } };
            }
        }

        // Draw side borders for content area
        for (let row = contentStartY; row < contentEndY; row++) {
            if (row < 0 || row >= grid.length) continue;
            if (x1 >= 0 && x1 < grid[row].length) {
                grid[row][x1] = { char: borderChars.vertical, style: borderCellStyle };
            }
            if (x2 >= 0 && x2 < grid[row].length) {
                grid[row][x2] = { char: borderChars.vertical, style: borderCellStyle };
            }
        }

        // Draw bottom border
        if (contentEndY >= 0 && contentEndY < grid.length) {
            if (x1 >= 0 && x1 < grid[contentEndY].length) {
                grid[contentEndY][x1] = { char: borderChars.bottomLeft, style: borderCellStyle };
            }
            if (x2 >= 0 && x2 < grid[contentEndY].length) {
                grid[contentEndY][x2] = { char: borderChars.bottomRight, style: borderCellStyle };
            }
            for (let col = x1 + 1; col < x2; col++) {
                if (col >= 0 && col < grid[contentEndY].length) {
                    grid[contentEndY][col] = { char: borderChars.horizontal, style: borderCellStyle };
                }
            }
        }
    } else {
        // Opening upward: own top border, shared bottom border
        const topY = dropdownY;
        const sharedY = dropdownY + dropdownHeight - 1;
        contentStartY = topY + 1;
        contentEndY = sharedY;

        // Draw top border
        if (topY >= 0 && topY < grid.length) {
            if (x1 >= 0 && x1 < grid[topY].length) {
                grid[topY][x1] = { char: borderChars.topLeft, style: borderCellStyle };
            }
            if (x2 >= 0 && x2 < grid[topY].length) {
                grid[topY][x2] = { char: borderChars.topRight, style: borderCellStyle };
            }
            for (let col = x1 + 1; col < x2; col++) {
                if (col >= 0 && col < grid[topY].length) {
                    grid[topY][col] = { char: borderChars.horizontal, style: borderCellStyle };
                }
            }
        }

        // Fill dropdown background
        for (let row = contentStartY; row < contentEndY; row++) {
            if (row < 0 || row >= grid.length) continue;
            for (let col = x1; col <= x2; col++) {
                if (col < 0 || col >= grid[row].length) continue;
                grid[row][col] = { char: ' ', style: { backgroundColor: dropdownBg } };
            }
        }

        // Draw side borders for content area
        for (let row = contentStartY; row < contentEndY; row++) {
            if (row < 0 || row >= grid.length) continue;
            if (x1 >= 0 && x1 < grid[row].length) {
                grid[row][x1] = { char: borderChars.vertical, style: borderCellStyle };
            }
            if (x2 >= 0 && x2 < grid[row].length) {
                grid[row][x2] = { char: borderChars.vertical, style: borderCellStyle };
            }
        }

        // Draw connecting corners on the shared row (replacing select's top corners)
        if (sharedY >= 0 && sharedY < grid.length) {
            if (x1 >= 0 && x1 < grid[sharedY].length) {
                grid[sharedY][x1] = { char: borderChars.teeRight, style: borderCellStyle };
            }
            if (x2 >= 0 && x2 < grid[sharedY].length) {
                grid[sharedY][x2] = { char: borderChars.teeLeft, style: borderCellStyle };
            }
            // Draw horizontal line connecting the T-junctions
            for (let col = x1 + 1; col < x2; col++) {
                if (col >= 0 && col < grid[sharedY].length) {
                    grid[sharedY][col] = { char: borderChars.horizontal, style: borderCellStyle };
                }
            }
        }
    }

    // Get type-ahead buffer for highlighting matched prefix
    const typeaheadBuffer = (node.__typeaheadBuffer ?? '').toLowerCase();

    // Render options with padding to align with select value
    // Available width inside borders = dropdownWidth - 2
    // Label area = available width - left padding - right padding
    const innerWidth = dropdownWidth - 2; // Inside borders
    const labelWidth = innerWidth - optionPadding * 2; // Space for actual label text
    
    for (let i = 0; i < visibleCount; i++) {
        const optIdx = scrollOffset + i;
        if (optIdx >= opts.length) break;
        const opt = opts[optIdx];
        const isGroup = opt.isGroup ?? false;
        const isSelected = !isGroup && optIdx === selectedIdx;
        const isDisabled = opt.disabled ?? false;
        const indent = (opt.indent ?? 0) * indentWidth;
        
        // Determine style based on type and state
        let optStyle: TextStyle;
        if (isGroup) {
            optStyle = isDisabled ? disabledOptgroupStyle : optgroupStyle;
        } else if (isDisabled) {
            optStyle = disabledOptionStyle;
        } else if (isSelected) {
            optStyle = selectedOptionStyle;
        } else {
            optStyle = optionBaseStyle;
        }
        
        const rawLabel = opt.label ?? '';
        const labelLower = rawLabel.toLowerCase();
        const optY = contentStartY + i;
        
        // Check if this option matches the type-ahead buffer
        const matchesTypeahead = typeaheadBuffer.length > 0 && 
                                 !isGroup && 
                                 !isDisabled &&
                                 labelLower.startsWith(typeaheadBuffer);
        
        // Style for underlined (matched) portion
        const underlinedStyle: TextStyle = {
            ...optStyle,
            underline: true,
        };
        
        if (optY < 0 || optY >= grid.length) continue;
        
        // Fill left padding
        for (let p = 0; p < optionPadding; p++) {
            const padX = x1 + 1 + p;
            if (padX >= 0 && padX < grid[optY].length) {
                grid[optY][padX] = { char: ' ', style: optStyle };
            }
        }
        
        // Render indentation
        let col = 0;
        for (let ind = 0; ind < indent; ind++) {
            const indX = x1 + 1 + optionPadding + col;
            if (indX >= 0 && indX < grid[optY].length) {
                grid[optY][indX] = { char: ' ', style: optStyle };
            }
            col++;
        }
        
        // Track character index for type-ahead highlighting
        let charIdx = 0;
        
        // Render label using display width
        for (const char of rawLabel) {
            if (col >= labelWidth) break;
            const charWidth = getStringWidth(char);
            if (charWidth === 0) {
                charIdx++;
                continue;
            }
            
            // Determine if this character should be underlined
            const shouldUnderline = matchesTypeahead && charIdx < typeaheadBuffer.length;
            const charStyle = shouldUnderline ? underlinedStyle : optStyle;
            
            const optX = x1 + 1 + optionPadding + col;
            if (optX >= 0 && optX < grid[optY].length) {
                grid[optY][optX] = { char, style: charStyle };
                if (charWidth === 2 && col + 1 < labelWidth && optX + 1 < grid[optY].length) {
                    grid[optY][optX + 1] = { char: '', style: charStyle };
                }
            }
            col += charWidth;
            charIdx++;
        }
        
        // Pad remaining label space
        while (col < labelWidth) {
            const optX = x1 + 1 + optionPadding + col;
            if (optX >= 0 && optX < grid[optY].length) {
                grid[optY][optX] = { char: ' ', style: optStyle };
            }
            col++;
        }
        
        // Fill right padding
        for (let p = 0; p < optionPadding; p++) {
            const padX = x1 + 1 + optionPadding + labelWidth + p;
            if (padX >= 0 && padX < grid[optY].length) {
                grid[optY][padX] = { char: ' ', style: optStyle };
            }
        }
    }

    // Render scrollbar if there are more options than visible
    if (opts.length > visibleCount) {
        // Create a pseudo scroll state for the scrollbar
        const dropdownScrollState: ScrollState = {
            scrollTop: scrollOffset,
            scrollLeft: 0,
            scrollWidth: 1,
            scrollHeight: opts.length,
            clientWidth: 1,
            clientHeight: visibleCount,
        };
        
        // Get scrollbar style from CSS (uses same properties as scroll containers)
        const scrollbarStyle = getScrollbarStyleFromCSS(style);
        
        // Render scrollbar on the right edge of content area (inside the border)
        const scrollbarX = x2 - 1;
        const scrollbarY = contentStartY;
        const scrollbarHeight = visibleCount;
        
        renderVerticalScrollbar(
            grid,
            scrollbarX,
            scrollbarY,
            scrollbarHeight,
            dropdownScrollState,
            scrollbarStyle,
            viewport.clip
        );
    }
}

// Register the select renderer
registerRenderer(selectRenderer);

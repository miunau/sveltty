/**
 * List element renderer for CLI.
 * Handles <ul>, <ol>, and <li> elements with proper markers and nesting.
 * 
 * CSS properties supported:
 * - list-style-type: disc | circle | square | decimal | decimal-leading-zero | 
 *                    lower-alpha | upper-alpha | lower-roman | upper-roman | none
 * - list-style-position: inside | outside (default: outside)
 * - margin-left / padding-left: Controls indentation
 */

import type { GridCell } from './types.js';
import type { TextStyle, CliNode } from '../types.js';
import type { ElementRenderer } from './registry.js';
import { registerRenderer } from './registry.js';
import { setCell } from './utils.js';
import { getNodeTag } from '../utils/node.js';
import { getStringWidth } from './string-width.js';
import { computePseudoElementStyle } from '../style/stylesheet.js';

/** Default marker characters for unordered lists by nesting level */
const DEFAULT_UL_MARKERS = ['•', '◦', '▪', '▫'];

/** Convert number to Roman numerals */
function toRoman(num: number, upper: boolean): string {
    const romanNumerals: [number, string][] = [
        [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
        [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
        [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
    ];
    let result = '';
    for (const [value, symbol] of romanNumerals) {
        while (num >= value) {
            result += symbol;
            num -= value;
        }
    }
    return upper ? result : result.toLowerCase();
}

/** Convert number to alphabetic (a, b, c, ... z, aa, ab, ...) */
function toAlpha(num: number, upper: boolean): string {
    let result = '';
    while (num > 0) {
        num--;
        result = String.fromCharCode(97 + (num % 26)) + result;
        num = Math.floor(num / 26);
    }
    return upper ? result.toUpperCase() : result;
}

/**
 * Get the marker string for a list item.
 * @param listType - 'ul' or 'ol'
 * @param styleType - CSS list-style-type value
 * @param index - 1-based index of the item in the list
 * @param nestingLevel - How deeply nested this list is (0 = top level)
 */
export function getListMarker(
    listType: 'ul' | 'ol',
    styleType: string | undefined,
    index: number,
    nestingLevel: number = 0
): string {
    if (styleType === 'none') {
        return '';
    }

    if (listType === 'ul') {
        switch (styleType) {
            case 'disc':
                return '•';
            case 'circle':
                return '◦';
            case 'square':
                return '▪';
            default:
                // Cycle through markers based on nesting level
                return DEFAULT_UL_MARKERS[nestingLevel % DEFAULT_UL_MARKERS.length];
        }
    } else {
        // Ordered list
        switch (styleType) {
            case 'decimal-leading-zero':
                return String(index).padStart(2, '0') + '.';
            case 'lower-alpha':
                return toAlpha(index, false) + '.';
            case 'upper-alpha':
                return toAlpha(index, true) + '.';
            case 'lower-roman':
                return toRoman(index, false) + '.';
            case 'upper-roman':
                return toRoman(index, true) + '.';
            case 'decimal':
            default:
                return index + '.';
        }
    }
}

/**
 * Calculate the nesting level of a list element.
 */
export function getListNestingLevel(node: CliNode): number {
    let level = 0;
    let current = node.parent;
    while (current) {
        const tagName = getNodeTag(current);
        if (tagName === 'ul' || tagName === 'ol') {
            level++;
        }
        current = current.parent;
    }
    return level;
}

/**
 * Get the index of a list item within its parent list.
 * Respects the 'start' attribute on <ol> and 'value' attribute on <li>.
 */
export function getListItemIndex(node: CliNode): number {
    const parent = node.parent;
    if (!parent) return 1;

    const parentTag = getNodeTag(parent);
    const startAttr = parent.start;
    const startValue = typeof startAttr === 'number' ? startAttr : 
                       typeof startAttr === 'string' ? parseInt(startAttr, 10) : 1;
    const start = Number.isFinite(startValue) ? startValue : 1;

    // Check for explicit value attribute on the li
    const valueAttr = node.value;
    if (typeof valueAttr === 'number' && Number.isFinite(valueAttr)) {
        return valueAttr;
    }
    if (typeof valueAttr === 'string') {
        const parsed = parseInt(valueAttr, 10);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    // Count preceding li siblings
    const siblings = parent.children ?? [];
    let index = start;
    for (const sibling of siblings) {
        if (sibling === node) break;
        if (getNodeTag(sibling) === 'li') {
            // Check if sibling has explicit value
            const sibValue = sibling.value;
            if (typeof sibValue === 'number' && Number.isFinite(sibValue)) {
                index = sibValue + 1;
            } else if (typeof sibValue === 'string') {
                const parsed = parseInt(sibValue, 10);
                if (Number.isFinite(parsed)) {
                    index = parsed + 1;
                } else {
                    index++;
                }
            } else {
                index++;
            }
        }
    }
    return index;
}

/**
 * Get the list-style-type for a list or list item.
 */
export function getListStyleType(node: CliNode): string | undefined {
    // Check inline style first
    const inlineStyle = node.style?.listStyleType;
    if (inlineStyle) return inlineStyle;

    // Check CSS computed style
    const cssStyle = node.__cssStyle?.listStyleType;
    if (cssStyle) return cssStyle;

    // Check 'type' attribute (HTML standard)
    const typeAttr = node.type;
    if (typeAttr) {
        // Map HTML type attribute to CSS list-style-type
        const typeMap: Record<string, string> = {
            '1': 'decimal',
            'a': 'lower-alpha',
            'A': 'upper-alpha',
            'i': 'lower-roman',
            'I': 'upper-roman',
            'disc': 'disc',
            'circle': 'circle',
            'square': 'square',
        };
        return typeMap[typeAttr] ?? typeAttr;
    }

    return undefined;
}

/**
 * Render a list marker into the grid.
 */
export function renderListMarker(
    grid: GridCell[][],
    x: number,
    y: number,
    marker: string,
    style: TextStyle,
    clip: { x1: number; y1: number; x2: number; y2: number }
): void {
    if (y < clip.y1 || y >= clip.y2) return;

    let col = x;
    for (const char of marker) {
        const charWidth = getStringWidth(char);
        if (charWidth === 0) continue;
        if (col >= clip.x2) break;
        if (col >= clip.x1) {
            setCell(grid, y, col, char, style);
            if (charWidth === 2 && col + 1 < clip.x2) {
                setCell(grid, y, col + 1, '', style);
            }
        }
        col += charWidth;
    }
}

/**
 * List item element renderer.
 * Renders the list marker using ::marker pseudo-element styles.
 * Children are painted by the default mechanism.
 */
export const listItemRenderer: ElementRenderer = {
    tags: ['li'],
    customChildren: false, // Let default child rendering continue
    
    render(node, ctx, bounds, computedStyle) {
        const parent = node.parent;
        const parentTag = parent ? getNodeTag(parent) : '';
        const listType = (parentTag === 'ol' ? 'ol' : 'ul') as 'ul' | 'ol';
        const styleType = getListStyleType(parent ?? node);
        const index = getListItemIndex(node);
        const nestingLevel = getListNestingLevel(node);
        
        // Get ::marker pseudo-element styles
        const markerPseudoStyle = computePseudoElementStyle(node, 'marker');
        
        // Check for content: none to hide the marker
        if (markerPseudoStyle.content === 'none' || markerPseudoStyle.content === '""') {
            return;
        }
        
        // Use custom content if specified, otherwise compute default marker
        let marker: string;
        if (markerPseudoStyle.content && typeof markerPseudoStyle.content === 'string') {
            // Strip quotes from content value
            marker = markerPseudoStyle.content.replace(/^["']|["']$/g, '');
        } else {
            marker = getListMarker(listType, styleType, index, nestingLevel);
        }
        
        if (marker) {
            // Build marker style: inherit from element, then apply ::marker overrides
            // Fallback to listMarkerColor for backwards compatibility
            const markerColor = markerPseudoStyle.color ?? computedStyle.listMarkerColor ?? 'cyan';
            const markerStyle: TextStyle = { 
                ...computedStyle, 
                ...markerPseudoStyle,
                color: markerColor,
            };
            
            // Render marker to the left of the content (in the padding area)
            const markerWidth = getStringWidth(marker);
            const markerX = Math.floor(bounds.absX) - markerWidth - 1;
            const markerY = Math.floor(bounds.absY);
            renderListMarker(ctx.grid, markerX, markerY, marker, markerStyle, bounds.clip);
        }
    },
};

// Register the list item renderer
registerRenderer(listItemRenderer);

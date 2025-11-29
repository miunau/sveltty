/**
 * Scrollbar Rendering
 * 
 * Renders vertical and horizontal scrollbars for scroll containers.
 * Scrollbars are drawn on the rightmost column (vertical) or bottommost row (horizontal)
 * of a scroll container when content exceeds the viewport.
 * 
 * Styling is controlled via CSS custom properties:
 * - --scrollbar-track-color: Color of the scrollbar track
 * - --scrollbar-thumb-color: Color of the scrollbar thumb
 * - --scrollbar-track-char: Character used for the track (default: │)
 * - --scrollbar-thumb-char: Character used for the thumb (default: █)
 */

import type { ClipRect, GridCell } from './types.js';
import type { ScrollState } from '../scroll.js';
import { setCell } from './utils.js';

/**
 * Style options for scrollbar rendering.
 */
export interface ScrollbarStyle {
    /** Color of the scrollbar track. */
    trackColor?: string;
    /** Color of the scrollbar thumb. */
    thumbColor?: string;
    /** Character used for the track. */
    trackChar?: string;
    /** Character used for the thumb. */
    thumbChar?: string;
}

/**
 * Default scrollbar style values.
 */
const DEFAULT_STYLE: Required<ScrollbarStyle> = {
    trackColor: '#333333',
    thumbColor: '#888888',
    trackChar: '│',
    thumbChar: '█',
};

/**
 * Default horizontal scrollbar style values.
 */
const DEFAULT_HORIZONTAL_STYLE: Required<ScrollbarStyle> = {
    trackColor: '#333333',
    thumbColor: '#888888',
    trackChar: '─',
    thumbChar: '█',
};

/**
 * Render a vertical scrollbar.
 * 
 * @param grid - The render grid.
 * @param x - X position of the scrollbar (rightmost column of container).
 * @param y - Y position of the scrollbar start.
 * @param height - Height of the scrollbar track.
 * @param scrollState - Current scroll state.
 * @param style - Scrollbar style options.
 * @param clip - Clip region for rendering.
 */
export function renderVerticalScrollbar(
    grid: GridCell[][],
    x: number,
    y: number,
    height: number,
    scrollState: ScrollState,
    style: ScrollbarStyle = {},
    clip: ClipRect
): void {
    // Merge with defaults
    const trackChar = style.trackChar ?? DEFAULT_STYLE.trackChar;
    const thumbChar = style.thumbChar ?? DEFAULT_STYLE.thumbChar;
    const trackColor = style.trackColor ?? DEFAULT_STYLE.trackColor;
    const thumbColor = style.thumbColor ?? DEFAULT_STYLE.thumbColor;
    
    // Cannot scroll if content fits in viewport
    if (scrollState.scrollHeight <= scrollState.clientHeight) {
        return;
    }
    
    // Calculate thumb position and size
    const contentRatio = scrollState.clientHeight / scrollState.scrollHeight;
    const thumbHeight = Math.max(1, Math.floor(height * contentRatio));
    const maxScrollTop = scrollState.scrollHeight - scrollState.clientHeight;
    const scrollRatio = maxScrollTop > 0 ? scrollState.scrollTop / maxScrollTop : 0;
    const thumbTop = Math.floor(scrollRatio * (height - thumbHeight));
    
    for (let row = 0; row < height; row++) {
        const gy = y + row;
        
        // Clip check
        if (gy < clip.y1 || gy >= clip.y2) continue;
        if (x < clip.x1 || x >= clip.x2) continue;
        if (gy < 0 || gy >= grid.length) continue;
        if (x < 0 || x >= grid[gy].length) continue;
        
        const isThumb = row >= thumbTop && row < thumbTop + thumbHeight;
        const char = isThumb ? thumbChar : trackChar;
        const color = isThumb ? thumbColor : trackColor;
        
        setCell(grid, gy, x, char, { color });
    }
}

/**
 * Render a horizontal scrollbar.
 * 
 * @param grid - The render grid.
 * @param x - X position of the scrollbar start.
 * @param y - Y position of the scrollbar (bottommost row of container).
 * @param width - Width of the scrollbar track.
 * @param scrollState - Current scroll state.
 * @param style - Scrollbar style options.
 * @param clip - Clip region for rendering.
 */
export function renderHorizontalScrollbar(
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    scrollState: ScrollState,
    style: ScrollbarStyle = {},
    clip: ClipRect
): void {
    // Merge with defaults
    const trackChar = style.trackChar ?? DEFAULT_HORIZONTAL_STYLE.trackChar;
    const thumbChar = style.thumbChar ?? DEFAULT_HORIZONTAL_STYLE.thumbChar;
    const trackColor = style.trackColor ?? DEFAULT_HORIZONTAL_STYLE.trackColor;
    const thumbColor = style.thumbColor ?? DEFAULT_HORIZONTAL_STYLE.thumbColor;
    
    // Cannot scroll if content fits in viewport
    if (scrollState.scrollWidth <= scrollState.clientWidth) {
        return;
    }
    
    // Calculate thumb position and size
    const contentRatio = scrollState.clientWidth / scrollState.scrollWidth;
    const thumbWidth = Math.max(1, Math.floor(width * contentRatio));
    const maxScrollLeft = scrollState.scrollWidth - scrollState.clientWidth;
    const scrollRatio = maxScrollLeft > 0 ? scrollState.scrollLeft / maxScrollLeft : 0;
    const thumbLeft = Math.floor(scrollRatio * (width - thumbWidth));
    
    // Clip check for row
    if (y < clip.y1 || y >= clip.y2) return;
    if (y < 0 || y >= grid.length) return;
    
    for (let col = 0; col < width; col++) {
        const gx = x + col;
        
        // Clip check
        if (gx < clip.x1 || gx >= clip.x2) continue;
        if (gx < 0 || gx >= grid[y].length) continue;
        
        const isThumb = col >= thumbLeft && col < thumbLeft + thumbWidth;
        const char = isThumb ? thumbChar : trackChar;
        const color = isThumb ? thumbColor : trackColor;
        
        setCell(grid, y, gx, char, { color });
    }
}

/**
 * Determine if a vertical scrollbar should be shown.
 * 
 * @param scrollState - Current scroll state.
 * @param overflow - CSS overflow value.
 * @returns True if scrollbar should be displayed.
 */
export function shouldShowVerticalScrollbar(
    scrollState: ScrollState,
    overflow: 'visible' | 'hidden' | 'scroll' | 'auto' | undefined
): boolean {
    if (overflow === 'scroll') {
        return true;
    }
    if (overflow === 'auto') {
        return scrollState.scrollHeight > scrollState.clientHeight;
    }
    return false;
}

/**
 * Determine if a horizontal scrollbar should be shown.
 * 
 * @param scrollState - Current scroll state.
 * @param overflow - CSS overflow value.
 * @returns True if scrollbar should be displayed.
 */
export function shouldShowHorizontalScrollbar(
    scrollState: ScrollState,
    overflow: 'visible' | 'hidden' | 'scroll' | 'auto' | undefined
): boolean {
    if (overflow === 'scroll') {
        return true;
    }
    if (overflow === 'auto') {
        return scrollState.scrollWidth > scrollState.clientWidth;
    }
    return false;
}

/**
 * Get scrollbar style from computed CSS style.
 * 
 * @param computedStyle - The computed style object.
 * @returns ScrollbarStyle object with any CSS-defined values.
 */
export function getScrollbarStyleFromCSS(computedStyle: Record<string, any>): ScrollbarStyle {
    return {
        trackColor: computedStyle.scrollbarTrackColor,
        thumbColor: computedStyle.scrollbarThumbColor,
        trackChar: computedStyle.scrollbarTrackChar,
        thumbChar: computedStyle.scrollbarThumbChar,
    };
}


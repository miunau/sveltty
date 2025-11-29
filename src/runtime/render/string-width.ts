/**
 * String Width Utilities
 * 
 * Re-exports the string-width package for calculating display width of strings
 * in terminal environments, accounting for Unicode characters that may display
 * as double-width (e.g., CJK characters, emojis) or zero-width (e.g., combining marks).
 */

import stringWidth from 'string-width';

/**
 * Calculate the display width of a string in terminal columns.
 * 
 * This accounts for:
 * - Double-width characters (CJK, emojis)
 * - Zero-width characters (combining marks, ZWJ)
 * - ANSI escape codes (ignored)
 * 
 * @param str - The string to measure
 * @returns The display width in terminal columns
 */
export function getStringWidth(str: string): number {
    if (!str || str.length === 0) return 0;
    return stringWidth(str);
}

/**
 * Slice a string by display width, not by character count.
 * Useful for truncating strings to fit in a fixed-width column.
 * 
 * @param str - The string to slice
 * @param maxWidth - Maximum display width
 * @returns The sliced string that fits within maxWidth columns
 */
export function sliceByWidth(str: string, maxWidth: number): string {
    if (!str || maxWidth <= 0) return '';
    
    let width = 0;
    let result = '';
    
    for (const char of str) {
        const charWidth = stringWidth(char);
        if (width + charWidth > maxWidth) break;
        
        result += char;
        width += charWidth;
    }
    
    return result;
}

/**
 * Get the index in the string where the display width reaches a target.
 * 
 * @param str - The string to measure
 * @param targetWidth - The target display width
 * @returns The character index, or -1 if the string is shorter than targetWidth
 */
export function indexAtWidth(str: string, targetWidth: number): number {
    if (!str || targetWidth <= 0) return 0;
    
    let width = 0;
    let index = 0;
    
    for (const char of str) {
        if (width >= targetWidth) return index;
        
        width += stringWidth(char);
        index += char.length; // Handle surrogate pairs
    }
    
    return width >= targetWidth ? index : -1;
}

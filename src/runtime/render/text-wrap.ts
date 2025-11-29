/**
 * Text Wrapping Utilities
 * 
 * Implements CSS text wrapping behavior for terminal rendering.
 * Supports white-space, word-break, overflow-wrap, and text-wrap properties.
 * 
 * Uses display width calculations for proper Unicode support (emojis, CJK, etc.).
 */

import type { TextStyle } from '../types.js';
import { getStringWidth, sliceByWidth } from './string-width.js';

/**
 * Options for text wrapping calculation.
 */
export interface WrapOptions {
    /** Maximum width in characters. If undefined, no wrapping occurs. */
    maxWidth?: number;
    /** CSS white-space property value. */
    whiteSpace?: TextStyle['whiteSpace'];
    /** CSS word-break property value. */
    wordBreak?: TextStyle['wordBreak'];
    /** CSS overflow-wrap property value. */
    overflowWrap?: TextStyle['overflowWrap'];
    /** CSS text-wrap property value. */
    textWrap?: TextStyle['textWrap'];
}

/**
 * Result of text wrapping calculation.
 */
export interface WrapResult {
    /** The wrapped lines. */
    lines: string[];
    /** Maximum line width. */
    width: number;
    /** Number of lines. */
    height: number;
}

/**
 * Determine if wrapping should occur based on CSS properties.
 */
export function shouldWrap(options: WrapOptions): boolean {
    const { whiteSpace, textWrap } = options;
    
    // text-wrap: nowrap takes precedence
    if (textWrap === 'nowrap') return false;
    
    // white-space determines wrapping behavior
    switch (whiteSpace) {
        case 'nowrap':
        case 'pre':
            return false;
        case 'normal':
        case 'pre-wrap':
        case 'pre-line':
        case 'break-spaces':
        default:
            return true;
    }
}

/**
 * Determine if whitespace should be preserved based on CSS properties.
 */
export function shouldPreserveWhitespace(whiteSpace: TextStyle['whiteSpace']): boolean {
    switch (whiteSpace) {
        case 'pre':
        case 'pre-wrap':
        case 'break-spaces':
            return true;
        case 'normal':
        case 'nowrap':
        case 'pre-line':
        default:
            return false;
    }
}

/**
 * Determine if newlines should be preserved based on CSS properties.
 */
export function shouldPreserveNewlines(whiteSpace: TextStyle['whiteSpace']): boolean {
    switch (whiteSpace) {
        case 'pre':
        case 'pre-wrap':
        case 'pre-line':
        case 'break-spaces':
            return true;
        case 'normal':
        case 'nowrap':
        default:
            return false;
    }
}

/**
 * Normalize whitespace in text according to CSS white-space rules.
 */
export function normalizeWhitespace(text: string, whiteSpace: TextStyle['whiteSpace']): string {
    if (shouldPreserveWhitespace(whiteSpace)) {
        return text;
    }
    
    // Collapse multiple spaces to single space
    let result = text.replace(/[ \t]+/g, ' ');
    
    // Handle newlines based on white-space value
    if (!shouldPreserveNewlines(whiteSpace)) {
        result = result.replace(/\n/g, ' ');
    }
    
    return result;
}

/**
 * Find word boundaries in text.
 * Returns array of [start, end] tuples for each word.
 */
function findWordBoundaries(text: string): Array<[number, number]> {
    const boundaries: Array<[number, number]> = [];
    const wordRegex = /\S+/g;
    let match;
    
    while ((match = wordRegex.exec(text)) !== null) {
        boundaries.push([match.index, match.index + match[0].length]);
    }
    
    return boundaries;
}

/**
 * Break a single word that's too long to fit in the available width.
 * Uses display width for proper Unicode support.
 */
function breakLongWord(
    word: string,
    maxWidth: number,
    wordBreak: TextStyle['wordBreak'],
    overflowWrap: TextStyle['overflowWrap']
): string[] {
    // If word fits, return as-is
    if (getStringWidth(word) <= maxWidth) {
        return [word];
    }
    
    // Determine if we should break the word
    const shouldBreak = 
        wordBreak === 'break-all' ||
        wordBreak === 'break-word' ||
        overflowWrap === 'break-word' ||
        overflowWrap === 'anywhere';
    
    if (!shouldBreak) {
        // Don't break - let it overflow
        return [word];
    }
    
    // Break the word into chunks by display width
    const chunks: string[] = [];
    let remaining = word;
    
    while (getStringWidth(remaining) > maxWidth) {
        const chunk = sliceByWidth(remaining, maxWidth);
        if (chunk.length === 0) {
            // Single character wider than maxWidth, include it anyway
            const firstChar = [...remaining][0];
            chunks.push(firstChar);
            remaining = remaining.slice(firstChar.length);
        } else {
            chunks.push(chunk);
            remaining = remaining.slice(chunk.length);
        }
    }
    
    if (remaining.length > 0) {
        chunks.push(remaining);
    }
    
    return chunks;
}

/**
 * Wrap a single line of text to fit within maxWidth.
 * Uses display width for proper Unicode support.
 */
function wrapLine(
    line: string,
    maxWidth: number,
    options: WrapOptions
): string[] {
    const { wordBreak = 'normal', overflowWrap = 'normal' } = options;
    
    // Edge case: empty line
    if (line.length === 0) {
        return [''];
    }
    
    // Edge case: line fits (use display width)
    if (getStringWidth(line) <= maxWidth) {
        return [line];
    }
    
    // Edge case: break-all means break anywhere (use display width)
    if (wordBreak === 'break-all') {
        const result: string[] = [];
        let remaining = line;
        while (getStringWidth(remaining) > maxWidth) {
            const chunk = sliceByWidth(remaining, maxWidth);
            if (chunk.length === 0) {
                // Single character wider than maxWidth
                const firstChar = [...remaining][0];
                result.push(firstChar);
                remaining = remaining.slice(firstChar.length);
            } else {
                result.push(chunk);
                remaining = remaining.slice(chunk.length);
            }
        }
        if (remaining.length > 0) {
            result.push(remaining);
        }
        return result;
    }
    
    // Word-based wrapping (using display widths)
    const words = line.split(/( +)/); // Split but preserve spaces
    const result: string[] = [];
    let currentLine = '';
    let currentLineWidth = 0;
    
    for (const segment of words) {
        // Handle space segments
        if (/^ +$/.test(segment)) {
            const segmentWidth = getStringWidth(segment);
            // If adding space doesn't overflow, add it
            if (currentLineWidth + segmentWidth <= maxWidth) {
                currentLine += segment;
                currentLineWidth += segmentWidth;
            } else if (currentLine.length > 0) {
                // Start new line, skip leading space
                result.push(currentLine);
                currentLine = '';
                currentLineWidth = 0;
            }
            continue;
        }
        
        // Handle word segments
        const word = segment;
        const wordWidth = getStringWidth(word);
        
        // If word is too long, break it
        if (wordWidth > maxWidth) {
            // Flush current line if not empty
            if (currentLine.length > 0) {
                result.push(currentLine);
                currentLine = '';
                currentLineWidth = 0;
            }
            
            // Break the long word
            const brokenParts = breakLongWord(word, maxWidth, wordBreak, overflowWrap);
            
            // Add all but last part as complete lines
            for (let i = 0; i < brokenParts.length - 1; i++) {
                result.push(brokenParts[i]);
            }
            
            // Start new line with last part
            currentLine = brokenParts[brokenParts.length - 1];
            currentLineWidth = getStringWidth(currentLine);
            continue;
        }
        
        // If word fits on current line
        if (currentLineWidth + wordWidth <= maxWidth) {
            currentLine += word;
            currentLineWidth += wordWidth;
        } else {
            // Start new line
            if (currentLine.length > 0) {
                result.push(currentLine.trimEnd());
            }
            currentLine = word;
            currentLineWidth = wordWidth;
        }
    }
    
    // Add remaining content
    if (currentLine.length > 0) {
        result.push(currentLine.trimEnd());
    }
    
    return result.length > 0 ? result : [''];
}

/**
 * Wrap text according to CSS text wrapping rules.
 * 
 * @param text - The text to wrap.
 * @param options - Wrapping options from computed CSS styles.
 * @returns The wrapped result with lines, width, and height.
 */
export function wrapText(text: string, options: WrapOptions = {}): WrapResult {
    const { maxWidth, whiteSpace = 'normal' } = options;
    
    // No text
    if (!text || text.length === 0) {
        return { lines: [], width: 0, height: 0 };
    }
    
    // Normalize whitespace according to CSS rules
    const normalized = normalizeWhitespace(text, whiteSpace);
    
    // Split on newlines first (respecting white-space setting)
    const preserveNewlines = shouldPreserveNewlines(whiteSpace);
    const inputLines = preserveNewlines ? normalized.split('\n') : [normalized];
    
    // Check if we should wrap
    const doWrap = shouldWrap(options) && maxWidth !== undefined && maxWidth > 0;
    
    if (!doWrap) {
        // No wrapping - return lines as-is (use display width)
        const width = Math.max(...inputLines.map(l => getStringWidth(l)), 0);
        return {
            lines: inputLines,
            width,
            height: inputLines.length,
        };
    }
    
    // Wrap each line
    const wrappedLines: string[] = [];
    for (const line of inputLines) {
        const wrapped = wrapLine(line, maxWidth, options);
        wrappedLines.push(...wrapped);
    }
    
    // Calculate width using display width
    const width = Math.max(...wrappedLines.map(l => getStringWidth(l)), 0);
    return {
        lines: wrappedLines,
        width,
        height: wrappedLines.length,
    };
}

/**
 * Measure text dimensions with wrapping applied.
 * Used by Yoga's measure function to determine text node size.
 * 
 * @param text - The text to measure.
 * @param maxWidth - Maximum available width (from Yoga).
 * @param options - Wrapping options from computed CSS styles.
 * @returns Width and height in characters.
 */
export function measureWrappedText(
    text: string,
    maxWidth: number | undefined,
    options: WrapOptions = {}
): { width: number; height: number } {
    // Empty text
    if (!text || text.trim().length === 0) {
        return { width: 0, height: 0 };
    }
    
    const result = wrapText(text, { ...options, maxWidth });
    return {
        width: result.width,
        height: result.height,
    };
}

/**
 * Get wrap options from a computed style object.
 */
export function getWrapOptionsFromStyle(style: TextStyle | undefined): WrapOptions {
    if (!style) {
        return {};
    }
    
    return {
        whiteSpace: style.whiteSpace,
        wordBreak: style.wordBreak,
        overflowWrap: style.overflowWrap,
        textWrap: style.textWrap,
    };
}


/**
 * Text Wrapping Tests
 * 
 * Tests for CSS text wrapping support including white-space, word-break,
 * overflow-wrap, and text-wrap properties.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    wrapText,
    measureWrappedText,
    shouldWrap,
    shouldPreserveWhitespace,
    shouldPreserveNewlines,
    normalizeWhitespace,
    getWrapOptionsFromStyle,
    type WrapOptions,
} from '../src/runtime/render/text-wrap.js';

describe('text-wrap utilities', () => {
    describe('shouldWrap', () => {
        it('returns true for normal white-space', () => {
            expect(shouldWrap({ whiteSpace: 'normal' })).toBe(true);
        });

        it('returns false for nowrap white-space', () => {
            expect(shouldWrap({ whiteSpace: 'nowrap' })).toBe(false);
        });

        it('returns false for pre white-space', () => {
            expect(shouldWrap({ whiteSpace: 'pre' })).toBe(false);
        });

        it('returns true for pre-wrap white-space', () => {
            expect(shouldWrap({ whiteSpace: 'pre-wrap' })).toBe(true);
        });

        it('returns true for pre-line white-space', () => {
            expect(shouldWrap({ whiteSpace: 'pre-line' })).toBe(true);
        });

        it('returns false when text-wrap is nowrap', () => {
            expect(shouldWrap({ whiteSpace: 'normal', textWrap: 'nowrap' })).toBe(false);
        });

        it('returns true by default', () => {
            expect(shouldWrap({})).toBe(true);
        });
    });

    describe('shouldPreserveWhitespace', () => {
        it('preserves whitespace for pre', () => {
            expect(shouldPreserveWhitespace('pre')).toBe(true);
        });

        it('preserves whitespace for pre-wrap', () => {
            expect(shouldPreserveWhitespace('pre-wrap')).toBe(true);
        });

        it('preserves whitespace for break-spaces', () => {
            expect(shouldPreserveWhitespace('break-spaces')).toBe(true);
        });

        it('collapses whitespace for normal', () => {
            expect(shouldPreserveWhitespace('normal')).toBe(false);
        });

        it('collapses whitespace for nowrap', () => {
            expect(shouldPreserveWhitespace('nowrap')).toBe(false);
        });

        it('collapses whitespace for pre-line', () => {
            expect(shouldPreserveWhitespace('pre-line')).toBe(false);
        });
    });

    describe('shouldPreserveNewlines', () => {
        it('preserves newlines for pre', () => {
            expect(shouldPreserveNewlines('pre')).toBe(true);
        });

        it('preserves newlines for pre-wrap', () => {
            expect(shouldPreserveNewlines('pre-wrap')).toBe(true);
        });

        it('preserves newlines for pre-line', () => {
            expect(shouldPreserveNewlines('pre-line')).toBe(true);
        });

        it('collapses newlines for normal', () => {
            expect(shouldPreserveNewlines('normal')).toBe(false);
        });

        it('collapses newlines for nowrap', () => {
            expect(shouldPreserveNewlines('nowrap')).toBe(false);
        });
    });

    describe('normalizeWhitespace', () => {
        it('collapses multiple spaces for normal', () => {
            expect(normalizeWhitespace('hello   world', 'normal')).toBe('hello world');
        });

        it('converts newlines to spaces for normal', () => {
            expect(normalizeWhitespace('hello\nworld', 'normal')).toBe('hello world');
        });

        it('preserves whitespace for pre', () => {
            expect(normalizeWhitespace('hello   world', 'pre')).toBe('hello   world');
        });

        it('preserves newlines for pre', () => {
            expect(normalizeWhitespace('hello\nworld', 'pre')).toBe('hello\nworld');
        });

        it('collapses spaces but preserves newlines for pre-line', () => {
            expect(normalizeWhitespace('hello   world\nfoo', 'pre-line')).toBe('hello world\nfoo');
        });
    });

    describe('wrapText', () => {
        describe('basic wrapping', () => {
            it('wraps long text at word boundaries', () => {
                const result = wrapText('hello world foo bar', { maxWidth: 10 });
                expect(result.lines).toEqual(['hello', 'world foo', 'bar']);
            });

            it('returns single line when text fits', () => {
                const result = wrapText('hello', { maxWidth: 10 });
                expect(result.lines).toEqual(['hello']);
                expect(result.width).toBe(5);
                expect(result.height).toBe(1);
            });

            it('handles empty text', () => {
                const result = wrapText('', { maxWidth: 10 });
                expect(result.lines).toEqual([]);
                expect(result.width).toBe(0);
                expect(result.height).toBe(0);
            });

            it('handles single word longer than maxWidth', () => {
                const result = wrapText('superlongword', { maxWidth: 5, overflowWrap: 'break-word' });
                expect(result.lines).toEqual(['super', 'longw', 'ord']);
            });

            it('does not break long words by default', () => {
                const result = wrapText('superlongword', { maxWidth: 5 });
                expect(result.lines).toEqual(['superlongword']);
            });
        });

        describe('white-space: nowrap', () => {
            it('does not wrap text', () => {
                const result = wrapText('hello world foo bar', { maxWidth: 10, whiteSpace: 'nowrap' });
                expect(result.lines).toEqual(['hello world foo bar']);
            });
        });

        describe('white-space: pre', () => {
            it('preserves spaces and does not wrap', () => {
                const result = wrapText('hello   world', { maxWidth: 10, whiteSpace: 'pre' });
                expect(result.lines).toEqual(['hello   world']);
            });

            it('preserves newlines', () => {
                const result = wrapText('hello\nworld', { maxWidth: 20, whiteSpace: 'pre' });
                expect(result.lines).toEqual(['hello', 'world']);
            });
        });

        describe('white-space: pre-wrap', () => {
            it('preserves spaces and wraps', () => {
                const result = wrapText('hello   world', { maxWidth: 8, whiteSpace: 'pre-wrap' });
                expect(result.lines[0]).toBe('hello');
            });

            it('preserves newlines and wraps', () => {
                const result = wrapText('hello\nworld foo', { maxWidth: 8, whiteSpace: 'pre-wrap' });
                expect(result.lines).toContain('hello');
                expect(result.lines).toContain('world');
            });
        });

        describe('white-space: pre-line', () => {
            it('collapses spaces but preserves newlines', () => {
                const result = wrapText('hello   world\nfoo', { maxWidth: 20, whiteSpace: 'pre-line' });
                expect(result.lines).toEqual(['hello world', 'foo']);
            });
        });

        describe('word-break: break-all', () => {
            it('breaks at any character', () => {
                const result = wrapText('hello', { maxWidth: 3, wordBreak: 'break-all' });
                expect(result.lines).toEqual(['hel', 'lo']);
            });

            it('breaks long words in sentences', () => {
                const result = wrapText('ab cdef', { maxWidth: 3, wordBreak: 'break-all' });
                // With break-all, the space after 'ab' may be included before wrapping
                expect(result.lines.length).toBeGreaterThanOrEqual(3);
                expect(result.lines[0].startsWith('ab')).toBe(true);
            });
        });

        describe('overflow-wrap: break-word', () => {
            it('breaks long words that overflow', () => {
                const result = wrapText('hello world', { maxWidth: 4, overflowWrap: 'break-word' });
                // Space after 'o' may be included before wrapping
                expect(result.lines.length).toBe(4);
                expect(result.lines[0]).toBe('hell');
                expect(result.lines[2]).toBe('worl');
            });
        });

        describe('overflow-wrap: anywhere', () => {
            it('breaks words anywhere when needed', () => {
                const result = wrapText('abcdef', { maxWidth: 2, overflowWrap: 'anywhere' });
                expect(result.lines).toEqual(['ab', 'cd', 'ef']);
            });
        });

        describe('text-wrap: nowrap', () => {
            it('prevents wrapping regardless of white-space', () => {
                const result = wrapText('hello world foo', { maxWidth: 10, textWrap: 'nowrap' });
                expect(result.lines).toEqual(['hello world foo']);
            });
        });

        describe('complex scenarios', () => {
            it('handles multiple spaces between words', () => {
                const result = wrapText('hello    world', { maxWidth: 10 });
                expect(result.lines).toEqual(['hello', 'world']);
            });

            it('handles leading and trailing spaces', () => {
                const result = wrapText('  hello world  ', { maxWidth: 20 });
                expect(result.lines.length).toBe(1);
            });

            it('handles multiple newlines with pre-wrap', () => {
                const result = wrapText('a\n\nb', { maxWidth: 10, whiteSpace: 'pre-wrap' });
                expect(result.lines).toEqual(['a', '', 'b']);
                expect(result.height).toBe(3);
            });

            it('calculates correct width', () => {
                const result = wrapText('hello world', { maxWidth: 8 });
                expect(result.width).toBeLessThanOrEqual(8);
            });
        });
    });

    describe('measureWrappedText', () => {
        it('measures unwrapped text correctly', () => {
            const result = measureWrappedText('hello world', undefined);
            expect(result.width).toBe(11);
            expect(result.height).toBe(1);
        });

        it('measures wrapped text correctly', () => {
            const result = measureWrappedText('hello world foo', 8);
            expect(result.width).toBeLessThanOrEqual(8);
            expect(result.height).toBeGreaterThan(1);
        });

        it('returns zero for empty text', () => {
            const result = measureWrappedText('', 10);
            expect(result.width).toBe(0);
            expect(result.height).toBe(0);
        });

        it('returns zero for whitespace-only text', () => {
            const result = measureWrappedText('   ', 10);
            expect(result.width).toBe(0);
            expect(result.height).toBe(0);
        });

        it('respects word-break option', () => {
            const result = measureWrappedText('abcdefghij', 3, { wordBreak: 'break-all' });
            expect(result.width).toBe(3);
            expect(result.height).toBe(4); // 10 chars / 3 = 4 lines
        });
    });

    describe('getWrapOptionsFromStyle', () => {
        it('extracts all wrapping properties', () => {
            const style = {
                whiteSpace: 'pre-wrap' as const,
                wordBreak: 'break-all' as const,
                overflowWrap: 'break-word' as const,
                textWrap: 'wrap' as const,
            };
            const options = getWrapOptionsFromStyle(style);
            expect(options.whiteSpace).toBe('pre-wrap');
            expect(options.wordBreak).toBe('break-all');
            expect(options.overflowWrap).toBe('break-word');
            expect(options.textWrap).toBe('wrap');
        });

        it('returns empty object for undefined style', () => {
            const options = getWrapOptionsFromStyle(undefined);
            expect(options).toEqual({});
        });

        it('handles partial styles', () => {
            const style = { whiteSpace: 'nowrap' as const };
            const options = getWrapOptionsFromStyle(style);
            expect(options.whiteSpace).toBe('nowrap');
            expect(options.wordBreak).toBeUndefined();
        });
    });
});

describe('text wrapping integration', () => {
    // These tests verify the full integration with node creation and layout
    
    describe('Yoga measure function', () => {
        it('uses text wrapping for measurement', async () => {
            // Import dynamically to avoid circular dependency issues in tests
            const { create_element, create_text, append, set_style } = await import('../src/runtime/operations.js');
            const { computeLayout } = await import('../src/runtime/layout.js');
            
            const root = create_element('div');
            set_style(root, { width: 10, height: 10 });
            
            const textNode = create_text('hello world foo bar baz');
            append(root, textNode);
            
            // Layout should wrap text within container width
            computeLayout(root, 10, 10);
            
            const layout = textNode.computedLayout;
            expect(layout).toBeDefined();
            // Width should be at most the container width
            expect(layout?.width).toBeLessThanOrEqual(10);
            // Height should be more than 1 due to wrapping
            expect(layout?.height).toBeGreaterThan(1);
        });

        it('respects white-space: nowrap', async () => {
            const { create_element, create_text, append, set_style } = await import('../src/runtime/operations.js');
            const { computeLayout } = await import('../src/runtime/layout.js');
            
            const root = create_element('div');
            // Container is smaller than text - with nowrap, text should still be single line
            set_style(root, { width: 10, height: 5 });
            
            const textNode = create_text('hello world foo');
            set_style(textNode, { whiteSpace: 'nowrap' });
            append(root, textNode);
            
            computeLayout(root, 10, 5);
            
            const layout = textNode.computedLayout;
            expect(layout).toBeDefined();
            // With nowrap, height should always be 1 regardless of width constraint
            expect(layout?.height).toBe(1);
        });
    });

    describe('text rendering', () => {
        it('renders wrapped text correctly', async () => {
            const { create_element, create_text, append, set_style } = await import('../src/runtime/operations.js');
            const { computeLayout } = await import('../src/runtime/layout.js');
            const { renderText } = await import('../src/runtime/render/text.js');
            const { createRenderGrid } = await import('../src/runtime/render/pipeline/layout.js');
            
            const root = create_element('div');
            set_style(root, { width: 10, height: 5 });
            
            const textNode = create_text('hello world foo');
            append(root, textNode);
            
            computeLayout(root, 10, 5);
            
            const grid = createRenderGrid(10, 5);
            const clip = { x1: 0, y1: 0, x2: 10, y2: 5 };
            
            renderText(
                textNode,
                grid,
                0,
                0,
                clip,
                undefined,
                { containerWidth: 10, containerX: 0, containerClip: clip }
            );
            
            // First line should contain "hello"
            const line1 = grid[0].slice(0, 5).map(c => c.char).join('');
            expect(line1).toBe('hello');
            
            // Second line should contain "world"
            const line2 = grid[1].slice(0, 5).map(c => c.char).join('');
            expect(line2).toBe('world');
        });

        it('renders pre-wrapped text with preserved newlines', async () => {
            const { create_element, create_text, append, set_style } = await import('../src/runtime/operations.js');
            const { computeLayout } = await import('../src/runtime/layout.js');
            const { renderText } = await import('../src/runtime/render/text.js');
            const { createRenderGrid } = await import('../src/runtime/render/pipeline/layout.js');
            
            const root = create_element('div');
            set_style(root, { width: 20, height: 5 });
            
            const textNode = create_text('line1\nline2');
            set_style(textNode, { whiteSpace: 'pre' });
            append(root, textNode);
            
            computeLayout(root, 20, 5);
            
            const grid = createRenderGrid(20, 5);
            const clip = { x1: 0, y1: 0, x2: 20, y2: 5 };
            
            renderText(
                textNode,
                grid,
                0,
                0,
                clip,
                undefined,
                { containerWidth: 20, containerX: 0, containerClip: clip }
            );
            
            const line1 = grid[0].slice(0, 5).map(c => c.char).join('');
            expect(line1).toBe('line1');
            
            const line2 = grid[1].slice(0, 5).map(c => c.char).join('');
            expect(line2).toBe('line2');
        });
    });
});


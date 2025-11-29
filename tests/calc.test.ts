/**
 * Tests for CSS calc(), min(), max(), clamp() functions.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    parseCalcNode,
    compileCalcExpr,
    isCalcValue,
    resolveStyleValue,
    parseAndCompileCalc,
    type CalcExpr,
    type CalcContext,
    type CalcValue,
} from '../src/runtime/style/calc.js';
import * as csstree from 'css-tree';

/**
 * Helper to parse CSS value and extract the first child node.
 */
function parseCssValue(css: string): csstree.CssNode | null {
    const ast = csstree.parse(`test { width: ${css}; }`, { context: 'stylesheet' });
    let result: csstree.CssNode | null = null;
    
    csstree.walk(ast, {
        enter(node) {
            if (node.type === 'Declaration' && node.property === 'width') {
                if (node.value && node.value.type === 'Value' && node.value.children) {
                    const first = node.value.children.first;
                    if (first) {
                        result = first;
                    }
                }
            }
        }
    });
    
    return result;
}

/**
 * Helper to parse and compile a CSS calc expression.
 */
function parseAndCompile(css: string): CalcValue | null {
    const node = parseCssValue(css);
    if (!node) return null;
    return parseAndCompileCalc(node, css);
}

/**
 * Default calc context for testing.
 */
const defaultContext: CalcContext = {
    containerWidth: 100,
    containerHeight: 50,
    axis: 'width',
};

describe('calc expression parsing', () => {
    describe('simple values', () => {
        it('parses plain numbers', () => {
            const node = parseCssValue('42');
            expect(node).not.toBeNull();
            
            const expr = parseCalcNode(node!);
            expect(expr).toEqual({
                type: 'value',
                value: 42,
                unit: 'none',
            });
        });

        it('parses ch units', () => {
            const node = parseCssValue('10ch');
            expect(node).not.toBeNull();
            
            const expr = parseCalcNode(node!);
            expect(expr).toEqual({
                type: 'value',
                value: 10,
                unit: 'ch',
            });
        });

        it('parses percentages', () => {
            const node = parseCssValue('50%');
            expect(node).not.toBeNull();
            
            const expr = parseCalcNode(node!);
            expect(expr).toEqual({
                type: 'value',
                value: 50,
                unit: '%',
            });
        });
    });

    describe('calc() function', () => {
        it('parses calc with simple addition', () => {
            const calc = parseAndCompile('calc(10ch + 5ch)');
            expect(calc).not.toBeNull();
            expect(calc!.type).toBe('calc');
            
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(15);
        });

        it('parses calc with subtraction', () => {
            const calc = parseAndCompile('calc(20ch - 5ch)');
            expect(calc).not.toBeNull();
            
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(15);
        });

        it('parses calc with multiplication', () => {
            const calc = parseAndCompile('calc(5ch * 3)');
            expect(calc).not.toBeNull();
            
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(15);
        });

        it('parses calc with division', () => {
            const calc = parseAndCompile('calc(30ch / 2)');
            expect(calc).not.toBeNull();
            
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(15);
        });

        it('handles division by zero', () => {
            const calc = parseAndCompile('calc(10ch / 0)');
            expect(calc).not.toBeNull();
            
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(0); // Should return 0, not Infinity or NaN
        });

        it('parses calc with percentage', () => {
            const calc = parseAndCompile('calc(50%)');
            expect(calc).not.toBeNull();
            
            // Width axis: 50% of 100 = 50
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(50);
            
            // Height axis: 50% of 50 = 25
            const heightResult = calc!.resolve({ ...defaultContext, axis: 'height' });
            expect(heightResult).toBe(25);
        });

        it('parses calc with mixed units', () => {
            const calc = parseAndCompile('calc(100% - 10ch)');
            expect(calc).not.toBeNull();
            
            // Width axis: 100% of 100 - 10 = 90
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(90);
        });

        it('parses calc with complex expression', () => {
            const calc = parseAndCompile('calc(50% + 10ch - 5)');
            expect(calc).not.toBeNull();
            
            // 50% of 100 + 10 - 5 = 50 + 10 - 5 = 55
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(55);
        });
    });

    describe('min() function', () => {
        it('returns minimum of two values', () => {
            const calc = parseAndCompile('min(20ch, 10ch)');
            expect(calc).not.toBeNull();
            
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(10);
        });

        it('returns minimum of three values', () => {
            const calc = parseAndCompile('min(30ch, 10ch, 20ch)');
            expect(calc).not.toBeNull();
            
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(10);
        });

        it('works with percentages', () => {
            const calc = parseAndCompile('min(100%, 80ch)');
            expect(calc).not.toBeNull();
            
            // min(100, 80) = 80
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(80);
        });

        it('works with mixed percentage and absolute', () => {
            const calc = parseAndCompile('min(50%, 80ch)');
            expect(calc).not.toBeNull();
            
            // min(50, 80) = 50
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(50);
        });
    });

    describe('max() function', () => {
        it('returns maximum of two values', () => {
            const calc = parseAndCompile('max(20ch, 10ch)');
            expect(calc).not.toBeNull();
            
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(20);
        });

        it('returns maximum of three values', () => {
            const calc = parseAndCompile('max(10ch, 30ch, 20ch)');
            expect(calc).not.toBeNull();
            
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(30);
        });

        it('works with percentages', () => {
            const calc = parseAndCompile('max(50%, 80ch)');
            expect(calc).not.toBeNull();
            
            // max(50, 80) = 80
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(80);
        });
    });

    describe('clamp() function', () => {
        it('clamps value between min and max', () => {
            // clamp(min, val, max) - value is clamped between min and max
            const calc = parseAndCompile('clamp(10ch, 50ch, 30ch)');
            expect(calc).not.toBeNull();
            
            // clamp(10, 50, 30) = 30 (value exceeds max)
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(30);
        });

        it('returns value when within range', () => {
            const calc = parseAndCompile('clamp(10ch, 20ch, 30ch)');
            expect(calc).not.toBeNull();
            
            // clamp(10, 20, 30) = 20 (value is within range)
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(20);
        });

        it('returns min when value is below', () => {
            const calc = parseAndCompile('clamp(10ch, 5ch, 30ch)');
            expect(calc).not.toBeNull();
            
            // clamp(10, 5, 30) = 10 (value is below min)
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(10);
        });

        it('works with percentages', () => {
            const calc = parseAndCompile('clamp(5ch, 50%, 20ch)');
            expect(calc).not.toBeNull();
            
            // clamp(5, 50, 20) = 20 (50% of 100 = 50, clamped to max 20)
            const result = calc!.resolve(defaultContext);
            expect(result).toBe(20);
        });

        it('works with responsive layout', () => {
            const calc = parseAndCompile('clamp(10ch, 50%, 80ch)');
            expect(calc).not.toBeNull();
            
            // Small container: clamp(10, 50% of 10, 80) = clamp(10, 5, 80) = 10
            const smallResult = calc!.resolve({ ...defaultContext, containerWidth: 10 });
            expect(smallResult).toBe(10);
            
            // Medium container: clamp(10, 50% of 100, 80) = clamp(10, 50, 80) = 50
            const medResult = calc!.resolve({ ...defaultContext, containerWidth: 100 });
            expect(medResult).toBe(50);
            
            // Large container: clamp(10, 50% of 200, 80) = clamp(10, 100, 80) = 80
            const largeResult = calc!.resolve({ ...defaultContext, containerWidth: 200 });
            expect(largeResult).toBe(80);
        });
    });
});

describe('resolveStyleValue', () => {
    it('returns undefined for undefined', () => {
        expect(resolveStyleValue(undefined, defaultContext)).toBeUndefined();
    });

    it('returns number as-is', () => {
        expect(resolveStyleValue(42, defaultContext)).toBe(42);
    });

    it('resolves percentage string', () => {
        expect(resolveStyleValue('50%', defaultContext)).toBe(50);
        expect(resolveStyleValue('50%', { ...defaultContext, axis: 'height' })).toBe(25);
    });

    it('resolves ch string', () => {
        expect(resolveStyleValue('20ch', defaultContext)).toBe(20);
    });

    it('resolves plain number string', () => {
        expect(resolveStyleValue('15', defaultContext)).toBe(15);
    });

    it('resolves CalcValue', () => {
        const calc = parseAndCompile('calc(100% - 10ch)');
        expect(calc).not.toBeNull();
        
        const result = resolveStyleValue(calc!, defaultContext);
        expect(result).toBe(90);
    });
});

describe('isCalcValue', () => {
    it('returns true for CalcValue', () => {
        const calc = parseAndCompile('calc(10ch + 5ch)');
        expect(isCalcValue(calc)).toBe(true);
    });

    it('returns false for number', () => {
        expect(isCalcValue(42)).toBe(false);
    });

    it('returns false for string', () => {
        expect(isCalcValue('10ch')).toBe(false);
    });

    it('returns false for null', () => {
        expect(isCalcValue(null)).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(isCalcValue(undefined)).toBe(false);
    });

    it('returns false for plain object', () => {
        expect(isCalcValue({ type: 'calc' })).toBe(false);
    });
});

describe('expression compilation', () => {
    it('compiles value expression', () => {
        const expr: CalcExpr = { type: 'value', value: 42, unit: 'none' };
        const resolver = compileCalcExpr(expr);
        expect(resolver(defaultContext)).toBe(42);
    });

    it('compiles percentage expression', () => {
        const expr: CalcExpr = { type: 'value', value: 50, unit: '%' };
        const resolver = compileCalcExpr(expr);
        expect(resolver(defaultContext)).toBe(50);
        expect(resolver({ ...defaultContext, axis: 'height' })).toBe(25);
    });

    it('compiles addition expression', () => {
        const expr: CalcExpr = {
            type: 'add',
            left: { type: 'value', value: 10, unit: 'none' },
            right: { type: 'value', value: 5, unit: 'none' },
        };
        const resolver = compileCalcExpr(expr);
        expect(resolver(defaultContext)).toBe(15);
    });

    it('compiles subtraction expression', () => {
        const expr: CalcExpr = {
            type: 'sub',
            left: { type: 'value', value: 20, unit: 'none' },
            right: { type: 'value', value: 5, unit: 'none' },
        };
        const resolver = compileCalcExpr(expr);
        expect(resolver(defaultContext)).toBe(15);
    });

    it('compiles multiplication expression', () => {
        const expr: CalcExpr = {
            type: 'mul',
            left: { type: 'value', value: 5, unit: 'none' },
            right: { type: 'value', value: 3, unit: 'none' },
        };
        const resolver = compileCalcExpr(expr);
        expect(resolver(defaultContext)).toBe(15);
    });

    it('compiles division expression', () => {
        const expr: CalcExpr = {
            type: 'div',
            left: { type: 'value', value: 30, unit: 'none' },
            right: { type: 'value', value: 2, unit: 'none' },
        };
        const resolver = compileCalcExpr(expr);
        expect(resolver(defaultContext)).toBe(15);
    });

    it('compiles min expression', () => {
        const expr: CalcExpr = {
            type: 'min',
            args: [
                { type: 'value', value: 20, unit: 'none' },
                { type: 'value', value: 10, unit: 'none' },
                { type: 'value', value: 15, unit: 'none' },
            ],
        };
        const resolver = compileCalcExpr(expr);
        expect(resolver(defaultContext)).toBe(10);
    });

    it('compiles max expression', () => {
        const expr: CalcExpr = {
            type: 'max',
            args: [
                { type: 'value', value: 20, unit: 'none' },
                { type: 'value', value: 10, unit: 'none' },
                { type: 'value', value: 15, unit: 'none' },
            ],
        };
        const resolver = compileCalcExpr(expr);
        expect(resolver(defaultContext)).toBe(20);
    });

    it('compiles clamp expression', () => {
        const expr: CalcExpr = {
            type: 'clamp',
            min: { type: 'value', value: 10, unit: 'none' },
            val: { type: 'value', value: 50, unit: 'none' },
            max: { type: 'value', value: 30, unit: 'none' },
        };
        const resolver = compileCalcExpr(expr);
        expect(resolver(defaultContext)).toBe(30);
    });

    it('compiles nested expressions', () => {
        // calc(min(100%, 80ch) - 10ch)
        const expr: CalcExpr = {
            type: 'sub',
            left: {
                type: 'min',
                args: [
                    { type: 'value', value: 100, unit: '%' },
                    { type: 'value', value: 80, unit: 'none' },
                ],
            },
            right: { type: 'value', value: 10, unit: 'none' },
        };
        const resolver = compileCalcExpr(expr);
        // min(100, 80) - 10 = 70
        expect(resolver(defaultContext)).toBe(70);
    });
});

describe('CSS integration', () => {
    it('stores original CSS for debugging', () => {
        const calc = parseAndCompile('calc(100% - 10ch)');
        expect(calc).not.toBeNull();
        expect(calc!.original).toBe('calc(100% - 10ch)');
    });

    it('handles whitespace in calc', () => {
        const calc = parseAndCompile('calc( 100%  -  10ch )');
        expect(calc).not.toBeNull();
        
        const result = calc!.resolve(defaultContext);
        expect(result).toBe(90);
    });

    it('returns null for invalid function', () => {
        // This should return null since 'invalid' is not a recognized calc function
        const node = parseCssValue('invalid(10ch)');
        if (node) {
            const calc = parseAndCompileCalc(node, 'invalid(10ch)');
            expect(calc).toBeNull();
        }
    });
});

describe('nested functions', () => {
    it('handles min() inside calc()', () => {
        const calc = parseAndCompile('calc(min(100%, 80ch) - 10ch)');
        expect(calc).not.toBeNull();
        expect(isCalcValue(calc)).toBe(true);
        
        // min(100, 80) - 10 = 70
        const result = calc!.resolve(defaultContext);
        expect(result).toBe(70);
    });

    it('handles max() inside calc()', () => {
        const calc = parseAndCompile('calc(max(50%, 30ch) + 10ch)');
        expect(calc).not.toBeNull();
        
        // max(50, 30) + 10 = 60
        const result = calc!.resolve(defaultContext);
        expect(result).toBe(60);
    });

    it('handles clamp() inside calc()', () => {
        const calc = parseAndCompile('calc(clamp(10ch, 50%, 80ch) * 2)');
        expect(calc).not.toBeNull();
        
        // clamp(10, 50, 80) * 2 = 50 * 2 = 100
        const result = calc!.resolve(defaultContext);
        expect(result).toBe(100);
    });

    it('handles nested calc() inside calc()', () => {
        const calc = parseAndCompile('calc(calc(50% + 20ch) - 10ch)');
        expect(calc).not.toBeNull();
        
        // (50 + 20) - 10 = 60
        const result = calc!.resolve(defaultContext);
        expect(result).toBe(60);
    });

    it('handles deeply nested functions', () => {
        const calc = parseAndCompile('calc(min(max(20ch, 50%), 80ch) + 5ch)');
        expect(calc).not.toBeNull();
        
        // min(max(20, 50), 80) + 5 = min(50, 80) + 5 = 50 + 5 = 55
        const result = calc!.resolve(defaultContext);
        expect(result).toBe(55);
    });

    it('handles min() with calc() argument', () => {
        const calc = parseAndCompile('min(calc(100% - 10ch), 80ch)');
        expect(calc).not.toBeNull();
        
        // min(90, 80) = 80
        const result = calc!.resolve(defaultContext);
        expect(result).toBe(80);
    });

    it('handles max() with multiple calc() arguments', () => {
        const calc = parseAndCompile('max(calc(50% - 10ch), calc(30% + 5ch))');
        expect(calc).not.toBeNull();
        
        // max(40, 35) = 40
        const result = calc!.resolve(defaultContext);
        expect(result).toBe(40);
    });

    it('handles clamp() with calc() arguments', () => {
        const calc = parseAndCompile('clamp(calc(10% + 5ch), 50%, calc(80% - 10ch))');
        expect(calc).not.toBeNull();
        
        // clamp(15, 50, 70) = 50
        const result = calc!.resolve(defaultContext);
        expect(result).toBe(50);
    });
});

describe('stylesheet integration with var()', () => {
    it('resolves var() before calc parsing', async () => {
        // Import the stylesheet functions
        const { registerStylesheet, resetStylesheets, computeStylesheetStyle } = 
            await import('../src/runtime/style/stylesheet.js');
        
        resetStylesheets();
        
        const css = `
            :root {
                --spacing: 10ch;
                --content-width: 80ch;
            }
            
            .test {
                width: calc(100% - var(--spacing));
                max-width: var(--content-width);
            }
        `;
        
        registerStylesheet('test', css);
        
        const node = {
            nodeType: 1,
            nodeName: 'div',
            classList: { contains: (c: string) => c === 'test' },
            className: 'test',
        };
        
        const style = computeStylesheetStyle(node);
        
        // width should be a CalcValue
        expect(isCalcValue(style.width)).toBe(true);
        if (isCalcValue(style.width)) {
            const ctx = { containerWidth: 100, containerHeight: 50, axis: 'width' as const };
            expect(style.width.resolve(ctx)).toBe(90); // 100% - 10ch = 90
        }
        
        // max-width should be a plain number (80ch = 80)
        expect(style.maxWidth).toBe(80);
    });

    it('resolves nested var() in calc', async () => {
        const { registerStylesheet, resetStylesheets, computeStylesheetStyle } = 
            await import('../src/runtime/style/stylesheet.js');
        
        resetStylesheets();
        
        const css = `
            :root {
                --gutter: 2ch;
                --sidebar: 20ch;
            }
            
            .main {
                width: calc(100% - var(--sidebar) - var(--gutter) * 2);
            }
        `;
        
        registerStylesheet('test', css);
        
        const node = {
            nodeType: 1,
            nodeName: 'div',
            classList: { contains: (c: string) => c === 'main' },
            className: 'main',
        };
        
        const style = computeStylesheetStyle(node);
        
        expect(isCalcValue(style.width)).toBe(true);
        if (isCalcValue(style.width)) {
            const ctx = { containerWidth: 100, containerHeight: 50, axis: 'width' as const };
            // 100% - 20ch - 2ch * 2 = 100 - 20 - 4 = 76
            expect(style.width.resolve(ctx)).toBe(76);
        }
    });

    it('handles var() fallback values', async () => {
        const { registerStylesheet, resetStylesheets, computeStylesheetStyle } = 
            await import('../src/runtime/style/stylesheet.js');
        
        resetStylesheets();
        
        const css = `
            .test {
                width: calc(100% - var(--undefined-var, 15ch));
            }
        `;
        
        registerStylesheet('test', css);
        
        const node = {
            nodeType: 1,
            nodeName: 'div',
            classList: { contains: (c: string) => c === 'test' },
            className: 'test',
        };
        
        const style = computeStylesheetStyle(node);
        
        expect(isCalcValue(style.width)).toBe(true);
        if (isCalcValue(style.width)) {
            const ctx = { containerWidth: 100, containerHeight: 50, axis: 'width' as const };
            // 100% - 15ch (fallback) = 85
            expect(style.width.resolve(ctx)).toBe(85);
        }
    });
});

describe('complex real-world patterns', () => {
    it('responsive container width', () => {
        // Common pattern: container that's 100% on small screens, 
        // but has max-width with gutters on large screens
        const calc = parseAndCompile('clamp(20ch, 100%, 80ch)');
        expect(calc).not.toBeNull();
        
        // Small container (10ch): clamp(20, 10, 80) = 20 (min)
        expect(calc!.resolve({ containerWidth: 10, containerHeight: 10, axis: 'width' })).toBe(20);
        
        // Medium container (50ch): clamp(20, 50, 80) = 50 (value)
        expect(calc!.resolve({ containerWidth: 50, containerHeight: 50, axis: 'width' })).toBe(50);
        
        // Large container (100ch): clamp(20, 100, 80) = 80 (max)
        expect(calc!.resolve({ containerWidth: 100, containerHeight: 100, axis: 'width' })).toBe(80);
    });

    it('sidebar layout calculation', () => {
        // Main content = 100% - sidebar - gutters
        const calc = parseAndCompile('calc(100% - 25ch - 2ch)');
        expect(calc).not.toBeNull();
        
        // 80ch viewport: 80 - 25 - 2 = 53
        expect(calc!.resolve({ containerWidth: 80, containerHeight: 24, axis: 'width' })).toBe(53);
    });

    it('fluid typography scaling', () => {
        // Fluid sizing: min size + percentage of container
        const calc = parseAndCompile('calc(10ch + 10%)');
        expect(calc).not.toBeNull();
        
        // 50ch container: 10 + 5 = 15
        expect(calc!.resolve({ containerWidth: 50, containerHeight: 24, axis: 'width' })).toBe(15);
        
        // 100ch container: 10 + 10 = 20
        expect(calc!.resolve({ containerWidth: 100, containerHeight: 24, axis: 'width' })).toBe(20);
    });

    it('aspect ratio-based height', () => {
        // Height based on width percentage (simulating aspect ratio)
        const calc = parseAndCompile('calc(100% * 0.5625)'); // 16:9 aspect ratio
        expect(calc).not.toBeNull();
        
        // Height axis with 100ch container height: 100 * 0.5625 = 56.25
        const result = calc!.resolve({ containerWidth: 100, containerHeight: 100, axis: 'height' });
        expect(result).toBeCloseTo(56.25, 2);
    });

    it('grid gap compensation', () => {
        // Width accounting for gaps: (100% - total gaps) / columns
        const calc = parseAndCompile('calc((100% - 4ch) / 3)');
        expect(calc).not.toBeNull();
        
        // 100ch container: (100 - 4) / 3 = 32
        expect(calc!.resolve({ containerWidth: 100, containerHeight: 24, axis: 'width' })).toBe(32);
    });

    it('safe area insets', () => {
        // Content width minus safe areas on both sides
        const calc = parseAndCompile('calc(100% - min(10ch, 10%) * 2)');
        expect(calc).not.toBeNull();
        
        // Small screen (50ch): 50 - min(10, 5) * 2 = 50 - 10 = 40
        expect(calc!.resolve({ containerWidth: 50, containerHeight: 24, axis: 'width' })).toBe(40);
        
        // Large screen (200ch): 200 - min(10, 20) * 2 = 200 - 20 = 180
        expect(calc!.resolve({ containerWidth: 200, containerHeight: 24, axis: 'width' })).toBe(180);
    });
});


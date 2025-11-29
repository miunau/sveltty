import { describe, it, expect } from 'vitest';
import {
    parseGradient,
    getLinearGradientPosition,
    getRadialGradientPosition,
    getConicGradientPosition,
    getGradientColorAt,
    isGradient,
    type LinearGradient,
    type RadialGradient,
    type ConicGradient,
} from '../src/runtime/style/gradient.js';

describe('gradient parsing', () => {
    describe('isGradient', () => {
        it('detects linear-gradient', () => {
            expect(isGradient('linear-gradient(red, blue)')).toBe(true);
        });

        it('detects radial-gradient', () => {
            expect(isGradient('radial-gradient(red, blue)')).toBe(true);
        });

        it('detects conic-gradient', () => {
            expect(isGradient('conic-gradient(red, blue)')).toBe(true);
        });

        it('detects repeating gradients', () => {
            expect(isGradient('repeating-linear-gradient(red, blue)')).toBe(true);
            expect(isGradient('repeating-radial-gradient(red, blue)')).toBe(true);
            expect(isGradient('repeating-conic-gradient(red, blue)')).toBe(true);
        });

        it('rejects non-gradients', () => {
            expect(isGradient('red')).toBe(false);
            expect(isGradient('#ff0000')).toBe(false);
            expect(isGradient('rgb(255, 0, 0)')).toBe(false);
        });
    });

    describe('parseGradient - linear', () => {
        it('parses linear-gradient with default direction', () => {
            const gradient = parseGradient('linear-gradient(red, blue)');
            expect(gradient).not.toBeNull();
            expect(gradient!.type).toBe('linear');
            expect((gradient as LinearGradient).angle).toBe(180); // default: to bottom
            expect(gradient!.stops).toHaveLength(2);
            expect((gradient as LinearGradient).repeating).toBe(false);
        });

        it('parses linear-gradient with to direction', () => {
            const gradient = parseGradient('linear-gradient(to right, red, blue)');
            expect(gradient).not.toBeNull();
            expect((gradient as LinearGradient).angle).toBe(90);
        });

        it('parses linear-gradient with angle', () => {
            const gradient = parseGradient('linear-gradient(45deg, red, blue)');
            expect(gradient).not.toBeNull();
            expect((gradient as LinearGradient).angle).toBe(45);
        });

        it('parses repeating-linear-gradient', () => {
            const gradient = parseGradient('repeating-linear-gradient(red 0%, blue 10%)');
            expect(gradient).not.toBeNull();
            expect(gradient!.type).toBe('linear');
            expect((gradient as LinearGradient).repeating).toBe(true);
        });

        it('parses color stops with positions', () => {
            const gradient = parseGradient('linear-gradient(red 0%, blue 100%)');
            expect(gradient).not.toBeNull();
            expect(gradient!.stops[0].position).toBe(0);
            expect(gradient!.stops[1].position).toBe(1);
        });
    });

    describe('parseGradient - radial', () => {
        it('parses radial-gradient with default shape', () => {
            const gradient = parseGradient('radial-gradient(red, blue)');
            expect(gradient).not.toBeNull();
            expect(gradient!.type).toBe('radial');
            expect((gradient as RadialGradient).shape).toBe('ellipse');
            expect((gradient as RadialGradient).repeating).toBe(false);
        });

        it('parses radial-gradient with circle shape', () => {
            const gradient = parseGradient('radial-gradient(circle, red, blue)');
            expect(gradient).not.toBeNull();
            expect((gradient as RadialGradient).shape).toBe('circle');
        });

        it('parses radial-gradient with position', () => {
            const gradient = parseGradient('radial-gradient(at top left, red, blue)');
            expect(gradient).not.toBeNull();
            expect((gradient as RadialGradient).position.x).toBe(0);
            expect((gradient as RadialGradient).position.y).toBe(0);
        });

        it('parses radial-gradient with circle at position', () => {
            const gradient = parseGradient('radial-gradient(circle at 25% 75%, red, blue)');
            expect(gradient).not.toBeNull();
            expect((gradient as RadialGradient).shape).toBe('circle');
            expect((gradient as RadialGradient).position.x).toBeCloseTo(0.25);
            expect((gradient as RadialGradient).position.y).toBeCloseTo(0.75);
        });

        it('parses repeating-radial-gradient', () => {
            const gradient = parseGradient('repeating-radial-gradient(red 0%, blue 10%)');
            expect(gradient).not.toBeNull();
            expect(gradient!.type).toBe('radial');
            expect((gradient as RadialGradient).repeating).toBe(true);
        });

        it('parses position keywords', () => {
            const tests: Array<{ input: string; x: number; y: number }> = [
                { input: 'at center', x: 0.5, y: 0.5 },
                { input: 'at top', x: 0.5, y: 0 },
                { input: 'at bottom', x: 0.5, y: 1 },
                { input: 'at left', x: 0, y: 0.5 },
                { input: 'at right', x: 1, y: 0.5 },
                { input: 'at top left', x: 0, y: 0 },
                { input: 'at bottom right', x: 1, y: 1 },
            ];

            for (const test of tests) {
                const gradient = parseGradient(`radial-gradient(${test.input}, red, blue)`);
                expect(gradient).not.toBeNull();
                expect((gradient as RadialGradient).position.x).toBeCloseTo(test.x, 1);
                expect((gradient as RadialGradient).position.y).toBeCloseTo(test.y, 1);
            }
        });
    });

    describe('parseGradient - conic', () => {
        it('parses conic-gradient with default settings', () => {
            const gradient = parseGradient('conic-gradient(red, blue)');
            expect(gradient).not.toBeNull();
            expect(gradient!.type).toBe('conic');
            expect((gradient as ConicGradient).angle).toBe(0);
            expect((gradient as ConicGradient).position.x).toBe(0.5);
            expect((gradient as ConicGradient).position.y).toBe(0.5);
            expect((gradient as ConicGradient).repeating).toBe(false);
        });

        it('parses conic-gradient with from angle', () => {
            const gradient = parseGradient('conic-gradient(from 45deg, red, blue)');
            expect(gradient).not.toBeNull();
            expect((gradient as ConicGradient).angle).toBe(45);
        });

        it('parses conic-gradient with position', () => {
            const gradient = parseGradient('conic-gradient(at top left, red, blue)');
            expect(gradient).not.toBeNull();
            expect((gradient as ConicGradient).position.x).toBe(0);
            expect((gradient as ConicGradient).position.y).toBe(0);
        });

        it('parses conic-gradient with from angle and position', () => {
            const gradient = parseGradient('conic-gradient(from 90deg at 25% 75%, red, blue)');
            expect(gradient).not.toBeNull();
            expect((gradient as ConicGradient).angle).toBe(90);
            expect((gradient as ConicGradient).position.x).toBeCloseTo(0.25);
            expect((gradient as ConicGradient).position.y).toBeCloseTo(0.75);
        });

        it('parses repeating-conic-gradient', () => {
            const gradient = parseGradient('repeating-conic-gradient(red 0deg, blue 30deg)');
            expect(gradient).not.toBeNull();
            expect(gradient!.type).toBe('conic');
            expect((gradient as ConicGradient).repeating).toBe(true);
        });
    });
});

describe('linear gradient position', () => {
    const createLinear = (angle: number, repeating = false): LinearGradient => ({
        type: 'linear',
        angle,
        stops: [
            { color: 'red', position: 0 },
            { color: 'blue', position: 1 },
        ],
        repeating,
    });

    it('calculates position for to-bottom (180deg)', () => {
        const gradient = createLinear(180);
        // Top edge should be 0, bottom edge should be 1
        expect(getLinearGradientPosition(gradient, 0, 0, 10, 10)).toBeCloseTo(0);
        expect(getLinearGradientPosition(gradient, 0, 9, 10, 10)).toBeCloseTo(1);
        expect(getLinearGradientPosition(gradient, 0, 4.5, 10, 10)).toBeCloseTo(0.5);
    });

    it('calculates position for to-right (90deg)', () => {
        const gradient = createLinear(90);
        // Left edge should be 0, right edge should be 1
        expect(getLinearGradientPosition(gradient, 0, 0, 10, 10)).toBeCloseTo(0);
        expect(getLinearGradientPosition(gradient, 9, 0, 10, 10)).toBeCloseTo(1);
        expect(getLinearGradientPosition(gradient, 4.5, 0, 10, 10)).toBeCloseTo(0.5);
    });

    it('calculates position for to-top (0deg)', () => {
        const gradient = createLinear(0);
        // Bottom edge should be 0, top edge should be 1
        expect(getLinearGradientPosition(gradient, 0, 9, 10, 10)).toBeCloseTo(0);
        expect(getLinearGradientPosition(gradient, 0, 0, 10, 10)).toBeCloseTo(1);
    });

    it('calculates position for to-left (270deg)', () => {
        const gradient = createLinear(270);
        // Right edge should be 0, left edge should be 1
        expect(getLinearGradientPosition(gradient, 9, 0, 10, 10)).toBeCloseTo(0);
        expect(getLinearGradientPosition(gradient, 0, 0, 10, 10)).toBeCloseTo(1);
    });

    it('handles non-square dimensions', () => {
        const gradient = createLinear(180);
        // 20 wide, 5 tall - gradient should still go top to bottom
        expect(getLinearGradientPosition(gradient, 0, 0, 20, 5)).toBeCloseTo(0);
        expect(getLinearGradientPosition(gradient, 0, 4, 20, 5)).toBeCloseTo(1);
        expect(getLinearGradientPosition(gradient, 10, 2, 20, 5)).toBeCloseTo(0.5);
    });
});

describe('radial gradient position', () => {
    const createRadial = (
        shape: 'circle' | 'ellipse',
        position = { x: 0.5, y: 0.5 },
        repeating = false
    ): RadialGradient => ({
        type: 'radial',
        shape,
        position,
        stops: [
            { color: 'red', position: 0 },
            { color: 'blue', position: 1 },
        ],
        repeating,
    });

    describe('centered gradient', () => {
        it('calculates position at center as 0', () => {
            const gradient = createRadial('ellipse');
            // Center of 10x10 is at (4.5, 4.5)
            expect(getRadialGradientPosition(gradient, 4.5, 4.5, 10, 10)).toBeCloseTo(0);
        });

        it('calculates position at horizontal edge as 1', () => {
            const gradient = createRadial('ellipse');
            // Right edge of 10x10 is at x=9, center y=4.5
            expect(getRadialGradientPosition(gradient, 9, 4.5, 10, 10)).toBeCloseTo(1);
            // Left edge
            expect(getRadialGradientPosition(gradient, 0, 4.5, 10, 10)).toBeCloseTo(1);
        });

        it('calculates position at vertical edge as 1', () => {
            const gradient = createRadial('ellipse');
            // Bottom edge of 10x10 is at y=9, center x=4.5
            expect(getRadialGradientPosition(gradient, 4.5, 9, 10, 10)).toBeCloseTo(1);
            // Top edge
            expect(getRadialGradientPosition(gradient, 4.5, 0, 10, 10)).toBeCloseTo(1);
        });

        it('scales correctly for non-square containers', () => {
            const gradient = createRadial('ellipse');
            // 20 wide, 10 tall
            const centerX = (20 - 1) / 2; // 9.5
            const centerY = (10 - 1) / 2; // 4.5
            
            expect(getRadialGradientPosition(gradient, centerX, centerY, 20, 10)).toBeCloseTo(0);
            // Right edge should be 1
            expect(getRadialGradientPosition(gradient, 19, centerY, 20, 10)).toBeCloseTo(1);
            // Bottom edge should be 1
            expect(getRadialGradientPosition(gradient, centerX, 9, 20, 10)).toBeCloseTo(1);
        });
    });

    describe('off-center gradient', () => {
        it('calculates position from top-left corner', () => {
            const gradient = createRadial('ellipse', { x: 0, y: 0 });
            // At origin (top-left), should be 0
            expect(getRadialGradientPosition(gradient, 0, 0, 10, 10)).toBeCloseTo(0);
            // At right edge (farthest x), should be 1
            expect(getRadialGradientPosition(gradient, 9, 0, 10, 10)).toBeCloseTo(1);
            // At bottom edge (farthest y), should be 1
            expect(getRadialGradientPosition(gradient, 0, 9, 10, 10)).toBeCloseTo(1);
            // At diagonal corner, should be sqrt(2) ≈ 1.414 (beyond the edge)
            expect(getRadialGradientPosition(gradient, 9, 9, 10, 10)).toBeCloseTo(Math.SQRT2);
        });

        it('calculates position from bottom-right corner', () => {
            const gradient = createRadial('ellipse', { x: 1, y: 1 });
            // At bottom-right, should be 0
            expect(getRadialGradientPosition(gradient, 9, 9, 10, 10)).toBeCloseTo(0);
            // At left edge (farthest x), should be 1
            expect(getRadialGradientPosition(gradient, 0, 9, 10, 10)).toBeCloseTo(1);
            // At top edge (farthest y), should be 1
            expect(getRadialGradientPosition(gradient, 9, 0, 10, 10)).toBeCloseTo(1);
            // At diagonal corner, should be sqrt(2) ≈ 1.414 (beyond the edge)
            expect(getRadialGradientPosition(gradient, 0, 0, 10, 10)).toBeCloseTo(Math.SQRT2);
        });

        it('calculates position from 25% 75%', () => {
            const gradient = createRadial('ellipse', { x: 0.25, y: 0.75 });
            // Center at 25% x, 75% y
            const cx = 0.25 * 9; // 2.25
            const cy = 0.75 * 9; // 6.75
            expect(getRadialGradientPosition(gradient, cx, cy, 10, 10)).toBeCloseTo(0);
        });
    });
});

describe('conic gradient position', () => {
    const createConic = (
        angle = 0,
        position = { x: 0.5, y: 0.5 },
        repeating = false
    ): ConicGradient => ({
        type: 'conic',
        angle,
        position,
        stops: [
            { color: 'red', position: 0 },
            { color: 'blue', position: 1 },
        ],
        repeating,
    });

    it('calculates position at top as 0 (default angle)', () => {
        const gradient = createConic(0);
        const centerX = 4.5;
        const centerY = 4.5;
        // Point directly above center
        const pos = getConicGradientPosition(gradient, centerX, 0, 10, 10);
        expect(pos).toBeCloseTo(0, 1);
    });

    it('calculates position at right as 0.25 (90deg / 360deg)', () => {
        const gradient = createConic(0);
        const centerX = 4.5;
        const centerY = 4.5;
        // Point directly to the right of center
        const pos = getConicGradientPosition(gradient, 9, centerY, 10, 10);
        expect(pos).toBeCloseTo(0.25, 1);
    });

    it('calculates position at bottom as 0.5 (180deg / 360deg)', () => {
        const gradient = createConic(0);
        const centerX = 4.5;
        const centerY = 4.5;
        // Point directly below center
        const pos = getConicGradientPosition(gradient, centerX, 9, 10, 10);
        expect(pos).toBeCloseTo(0.5, 1);
    });

    it('calculates position at left as 0.75 (270deg / 360deg)', () => {
        const gradient = createConic(0);
        const centerX = 4.5;
        const centerY = 4.5;
        // Point directly to the left of center
        const pos = getConicGradientPosition(gradient, 0, centerY, 10, 10);
        expect(pos).toBeCloseTo(0.75, 1);
    });

    it('respects starting angle offset', () => {
        const gradient = createConic(90); // Start at 90deg (right side)
        const centerX = 4.5;
        const centerY = 4.5;
        // Point at the right should now be 0
        const pos = getConicGradientPosition(gradient, 9, centerY, 10, 10);
        expect(pos).toBeCloseTo(0, 1);
    });

    it('handles off-center position', () => {
        const gradient = createConic(0, { x: 0, y: 0 }); // Center at top-left
        // Point to the right of top-left corner
        const pos = getConicGradientPosition(gradient, 9, 0, 10, 10);
        expect(pos).toBeCloseTo(0.25, 1); // 90deg from top
    });
});

describe('getGradientColorAt', () => {
    it('returns first color at position 0', () => {
        const gradient: LinearGradient = {
            type: 'linear',
            angle: 180,
            stops: [
                { color: 'red', position: 0 },
                { color: 'blue', position: 1 },
            ],
            repeating: false,
        };
        expect(getGradientColorAt(gradient, 0)).toBe('rgb(255, 0, 0)');
    });

    it('returns last color at position 1', () => {
        const gradient: LinearGradient = {
            type: 'linear',
            angle: 180,
            stops: [
                { color: 'red', position: 0 },
                { color: 'blue', position: 1 },
            ],
            repeating: false,
        };
        expect(getGradientColorAt(gradient, 1)).toBe('rgb(0, 0, 255)');
    });

    it('interpolates colors at middle positions', () => {
        const gradient: LinearGradient = {
            type: 'linear',
            angle: 180,
            stops: [
                { color: 'rgb(0, 0, 0)', position: 0 },
                { color: 'rgb(100, 100, 100)', position: 1 },
            ],
            repeating: false,
        };
        expect(getGradientColorAt(gradient, 0.5)).toBe('rgb(50, 50, 50)');
    });

    describe('repeating gradients', () => {
        it('repeats colors beyond stop range', () => {
            const gradient: LinearGradient = {
                type: 'linear',
                angle: 180,
                stops: [
                    { color: 'rgb(0, 0, 0)', position: 0 },
                    { color: 'rgb(100, 100, 100)', position: 0.5 },
                ],
                repeating: true,
            };
            // Position 0.75 should map to 0.25 in the repeating pattern
            const colorAt75 = getGradientColorAt(gradient, 0.75);
            const colorAt25 = getGradientColorAt(gradient, 0.25);
            expect(colorAt75).toBe(colorAt25);
        });

        it('clamps non-repeating gradients', () => {
            const gradient: LinearGradient = {
                type: 'linear',
                angle: 180,
                stops: [
                    { color: 'red', position: 0 },
                    { color: 'blue', position: 1 },
                ],
                repeating: false,
            };
            // Position beyond 1 should clamp to 1
            expect(getGradientColorAt(gradient, 1.5)).toBe('rgb(0, 0, 255)');
            // Position below 0 should clamp to 0
            expect(getGradientColorAt(gradient, -0.5)).toBe('rgb(255, 0, 0)');
        });
    });
});

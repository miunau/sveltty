/**
 * Tests for the occlusion system.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    clearOcclusionZones,
    addOcclusionZone,
    getOcclusionZones,
    isPointOccluded,
    isRectOccluded,
    isRectFullyOccluded,
    getVisibleRegions,
    rectsOverlap,
} from '../src/runtime/render/occlusion.js';

describe('occlusion system', () => {
    beforeEach(() => {
        clearOcclusionZones();
    });

    describe('rectsOverlap', () => {
        it('returns true for overlapping rectangles', () => {
            const a = { x: 0, y: 0, width: 10, height: 10 };
            const b = { x: 5, y: 5, width: 10, height: 10 };
            expect(rectsOverlap(a, b)).toBe(true);
        });

        it('returns false for non-overlapping rectangles', () => {
            const a = { x: 0, y: 0, width: 10, height: 10 };
            const b = { x: 20, y: 20, width: 10, height: 10 };
            expect(rectsOverlap(a, b)).toBe(false);
        });

        it('returns false for adjacent rectangles', () => {
            const a = { x: 0, y: 0, width: 10, height: 10 };
            const b = { x: 10, y: 0, width: 10, height: 10 };
            expect(rectsOverlap(a, b)).toBe(false);
        });

        it('returns true when one rect contains the other', () => {
            const outer = { x: 0, y: 0, width: 20, height: 20 };
            const inner = { x: 5, y: 5, width: 5, height: 5 };
            expect(rectsOverlap(outer, inner)).toBe(true);
            expect(rectsOverlap(inner, outer)).toBe(true);
        });
    });

    describe('occlusion zone management', () => {
        it('starts with no zones', () => {
            expect(getOcclusionZones()).toHaveLength(0);
        });

        it('can add zones', () => {
            addOcclusionZone({ x: 0, y: 0, width: 10, height: 10, zIndex: 0 });
            expect(getOcclusionZones()).toHaveLength(1);
        });

        it('clears zones', () => {
            addOcclusionZone({ x: 0, y: 0, width: 10, height: 10, zIndex: 0 });
            clearOcclusionZones();
            expect(getOcclusionZones()).toHaveLength(0);
        });
    });

    describe('isPointOccluded', () => {
        it('returns false when no zones exist', () => {
            expect(isPointOccluded(5, 5)).toBe(false);
        });

        it('returns true for point inside zone', () => {
            addOcclusionZone({ x: 0, y: 0, width: 10, height: 10, zIndex: 0 });
            expect(isPointOccluded(5, 5)).toBe(true);
        });

        it('returns false for point outside zone', () => {
            addOcclusionZone({ x: 0, y: 0, width: 10, height: 10, zIndex: 0 });
            expect(isPointOccluded(15, 15)).toBe(false);
        });

        it('returns false for point on zone boundary', () => {
            addOcclusionZone({ x: 0, y: 0, width: 10, height: 10, zIndex: 0 });
            expect(isPointOccluded(10, 10)).toBe(false);
        });
    });

    describe('isRectOccluded', () => {
        it('returns false when no zones exist', () => {
            expect(isRectOccluded({ x: 0, y: 0, width: 5, height: 5 })).toBe(false);
        });

        it('returns true for overlapping rect', () => {
            addOcclusionZone({ x: 0, y: 0, width: 10, height: 10, zIndex: 0 });
            expect(isRectOccluded({ x: 5, y: 5, width: 10, height: 10 })).toBe(true);
        });

        it('returns false for non-overlapping rect', () => {
            addOcclusionZone({ x: 0, y: 0, width: 10, height: 10, zIndex: 0 });
            expect(isRectOccluded({ x: 20, y: 20, width: 10, height: 10 })).toBe(false);
        });
    });

    describe('isRectFullyOccluded', () => {
        it('returns true when rect is fully inside a zone', () => {
            addOcclusionZone({ x: 0, y: 0, width: 20, height: 20, zIndex: 0 });
            expect(isRectFullyOccluded({ x: 5, y: 5, width: 5, height: 5 })).toBe(true);
        });

        it('returns false when rect is only partially covered', () => {
            addOcclusionZone({ x: 0, y: 0, width: 10, height: 10, zIndex: 0 });
            expect(isRectFullyOccluded({ x: 5, y: 5, width: 10, height: 10 })).toBe(false);
        });

        it('returns false when rect is not covered', () => {
            addOcclusionZone({ x: 0, y: 0, width: 10, height: 10, zIndex: 0 });
            expect(isRectFullyOccluded({ x: 20, y: 20, width: 10, height: 10 })).toBe(false);
        });
    });

    describe('getVisibleRegions', () => {
        it('returns full rect when no occlusion', () => {
            const rect = { x: 0, y: 0, width: 10, height: 10 };
            const regions = getVisibleRegions(rect);
            expect(regions).toHaveLength(1);
            expect(regions[0]).toEqual({ x: 0, y: 0, width: 10, height: 10, srcX: 0, srcY: 0 });
        });

        it('returns empty array when fully occluded', () => {
            addOcclusionZone({ x: 0, y: 0, width: 20, height: 20, zIndex: 0 });
            const rect = { x: 5, y: 5, width: 5, height: 5 };
            const regions = getVisibleRegions(rect);
            expect(regions).toHaveLength(0);
        });

        it('returns visible regions when partially occluded from left', () => {
            addOcclusionZone({ x: 0, y: 0, width: 5, height: 20, zIndex: 0 });
            const rect = { x: 0, y: 0, width: 10, height: 10 };
            const regions = getVisibleRegions(rect);
            // Should have the right portion visible
            expect(regions.length).toBeGreaterThan(0);
            const totalArea = regions.reduce((sum, r) => sum + r.width * r.height, 0);
            expect(totalArea).toBe(50); // Half the rect (5 * 10)
        });

        it('returns visible regions when partially occluded from center', () => {
            addOcclusionZone({ x: 3, y: 3, width: 4, height: 4, zIndex: 0 });
            const rect = { x: 0, y: 0, width: 10, height: 10 };
            const regions = getVisibleRegions(rect);
            // Should have multiple regions around the center hole
            expect(regions.length).toBeGreaterThan(0);
            const totalArea = regions.reduce((sum, r) => sum + r.width * r.height, 0);
            expect(totalArea).toBe(100 - 16); // Full rect minus the center hole
        });

        it('includes correct source offsets', () => {
            addOcclusionZone({ x: 0, y: 0, width: 5, height: 10, zIndex: 0 });
            const rect = { x: 0, y: 0, width: 10, height: 10 };
            const regions = getVisibleRegions(rect);
            // The visible region should be the right half
            const rightRegion = regions.find(r => r.x === 5);
            expect(rightRegion).toBeDefined();
            expect(rightRegion!.srcX).toBe(5); // Source offset matches position delta
            expect(rightRegion!.srcY).toBe(0);
        });
    });
});


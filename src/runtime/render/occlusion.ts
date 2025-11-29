/**
 * Occlusion System
 * 
 * Manages top-layer elements and computes visibility for rendering.
 * Used for popovers, modals, dropdowns, and other overlay content
 * that should occlude elements beneath them.
 */

/** A rectangular region. */
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** An occlusion zone that blocks content beneath it. */
export interface OcclusionZone extends Rect {
    /** Z-index for ordering overlays. */
    zIndex: number;
}

/** Tracks occlusion zones for the current render frame. */
let occlusionZones: OcclusionZone[] = [];

/**
 * Clear all occlusion zones. Called at start of each render frame.
 */
export function clearOcclusionZones(): void {
    occlusionZones = [];
}

/**
 * Register an occlusion zone for a top-layer element.
 * @param zone - The rectangular zone that occludes content.
 */
export function addOcclusionZone(zone: OcclusionZone): void {
    occlusionZones.push(zone);
}

/**
 * Get all registered occlusion zones.
 */
export function getOcclusionZones(): OcclusionZone[] {
    return occlusionZones;
}

/**
 * Check if a point is occluded by any zone.
 */
export function isPointOccluded(x: number, y: number): boolean {
    for (const zone of occlusionZones) {
        if (
            x >= zone.x &&
            x < zone.x + zone.width &&
            y >= zone.y &&
            y < zone.y + zone.height
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Check if a rectangle overlaps with any occlusion zone.
 */
export function isRectOccluded(rect: Rect): boolean {
    for (const zone of occlusionZones) {
        if (rectsOverlap(rect, zone)) {
            return true;
        }
    }
    return false;
}

/**
 * Check if a rectangle is fully occluded (completely covered).
 */
export function isRectFullyOccluded(rect: Rect): boolean {
    for (const zone of occlusionZones) {
        if (
            rect.x >= zone.x &&
            rect.y >= zone.y &&
            rect.x + rect.width <= zone.x + zone.width &&
            rect.y + rect.height <= zone.y + zone.height
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Compute the visible regions of a rectangle after subtracting occlusion zones.
 * Returns an array of non-overlapping rectangles that represent the visible parts.
 * 
 * For simplicity, this uses a greedy algorithm that may produce more rectangles
 * than strictly necessary, but is efficient and correct.
 * 
 * @param rect - The rectangle to check visibility for.
 * @returns Array of visible rectangular regions, or empty if fully occluded.
 */
export function getVisibleRegions(rect: Rect): VisibleRegion[] {
    // Sort zones by z-index (highest first) so higher overlays take priority
    const sortedZones = [...occlusionZones].sort((a, b) => b.zIndex - a.zIndex);
    
    // Start with the full rectangle as potentially visible
    let regions: Rect[] = [rect];
    
    // Subtract each occlusion zone
    for (const zone of sortedZones) {
        const newRegions: Rect[] = [];
        for (const region of regions) {
            const visible = subtractRect(region, zone);
            newRegions.push(...visible);
        }
        regions = newRegions;
    }
    
    // Convert to visible regions with source offsets
    return regions.map(r => ({
        // Display position
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        // Source offset (how far into the original rect this region starts)
        srcX: r.x - rect.x,
        srcY: r.y - rect.y,
    }));
}

/**
 * A visible region with source offset information.
 * Used for partial image rendering.
 */
export interface VisibleRegion extends Rect {
    /** X offset into the source image. */
    srcX: number;
    /** Y offset into the source image. */
    srcY: number;
}

/**
 * Check if two rectangles overlap.
 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

/**
 * Subtract rectangle B from rectangle A.
 * Returns an array of rectangles that represent A - B.
 */
function subtractRect(a: Rect, b: Rect): Rect[] {
    // If no overlap, return A unchanged
    if (!rectsOverlap(a, b)) {
        return [a];
    }
    
    // If B fully contains A, return empty
    if (
        b.x <= a.x &&
        b.y <= a.y &&
        b.x + b.width >= a.x + a.width &&
        b.y + b.height >= a.y + a.height
    ) {
        return [];
    }
    
    const result: Rect[] = [];
    
    // Calculate the intersection
    const ix1 = Math.max(a.x, b.x);
    const iy1 = Math.max(a.y, b.y);
    const ix2 = Math.min(a.x + a.width, b.x + b.width);
    const iy2 = Math.min(a.y + a.height, b.y + b.height);
    
    // Top strip (above the intersection)
    if (iy1 > a.y) {
        result.push({
            x: a.x,
            y: a.y,
            width: a.width,
            height: iy1 - a.y,
        });
    }
    
    // Bottom strip (below the intersection)
    if (iy2 < a.y + a.height) {
        result.push({
            x: a.x,
            y: iy2,
            width: a.width,
            height: a.y + a.height - iy2,
        });
    }
    
    // Left strip (between top and bottom, to the left of intersection)
    if (ix1 > a.x) {
        result.push({
            x: a.x,
            y: iy1,
            width: ix1 - a.x,
            height: iy2 - iy1,
        });
    }
    
    // Right strip (between top and bottom, to the right of intersection)
    if (ix2 < a.x + a.width) {
        result.push({
            x: ix2,
            y: iy1,
            width: a.x + a.width - ix2,
            height: iy2 - iy1,
        });
    }
    
    // Filter out degenerate rectangles
    return result.filter(r => r.width > 0 && r.height > 0);
}


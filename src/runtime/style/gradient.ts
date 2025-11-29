/**
 * CSS Gradient parsing and rendering for CLI.
 * Supports linear-gradient(), radial-gradient(), and conic-gradient()
 * with 24-bit color interpolation.
 * 
 * Also supports repeating variants of all gradient types.
 */

import { parseColorToRgb, interpolateColor, rgbToString } from './colors.js';

// Re-export for convenience
export { parseColorToRgb, interpolateColor } from './colors.js';

/**
 * Parsed color stop with position
 */
export interface ColorStop {
    color: string;
    position: number; // 0-1 normalized position
}

/**
 * Position specification for gradients
 */
export interface GradientPosition {
    x: number; // 0-1 normalized (0 = left, 0.5 = center, 1 = right)
    y: number; // 0-1 normalized (0 = top, 0.5 = center, 1 = bottom)
}

/**
 * Parsed linear gradient
 */
export interface LinearGradient {
    type: 'linear';
    angle: number; // degrees, 0 = to top, 90 = to right
    stops: ColorStop[];
    repeating: boolean;
}

/**
 * Parsed radial gradient
 */
export interface RadialGradient {
    type: 'radial';
    shape: 'circle' | 'ellipse';
    position: GradientPosition;
    stops: ColorStop[];
    repeating: boolean;
}

/**
 * Parsed conic gradient
 */
export interface ConicGradient {
    type: 'conic';
    angle: number; // starting angle in degrees (0 = up/north)
    position: GradientPosition;
    stops: ColorStop[];
    repeating: boolean;
}

export type Gradient = LinearGradient | RadialGradient | ConicGradient;

/** Default center position */
const CENTER_POSITION: GradientPosition = { x: 0.5, y: 0.5 };

/**
 * Check if a value is a gradient function
 */
export function isGradient(value: string): boolean {
    const trimmed = value.trim().toLowerCase();
    return trimmed.startsWith('linear-gradient(') || 
           trimmed.startsWith('radial-gradient(') ||
           trimmed.startsWith('conic-gradient(') ||
           trimmed.startsWith('repeating-linear-gradient(') ||
           trimmed.startsWith('repeating-radial-gradient(') ||
           trimmed.startsWith('repeating-conic-gradient(');
}

/**
 * Parse a CSS gradient string into a Gradient object
 */
export function parseGradient(value: string): Gradient | null {
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    
    if (lower.startsWith('linear-gradient(') || lower.startsWith('repeating-linear-gradient(')) {
        return parseLinearGradient(trimmed);
    }
    
    if (lower.startsWith('radial-gradient(') || lower.startsWith('repeating-radial-gradient(')) {
        return parseRadialGradient(trimmed);
    }
    
    if (lower.startsWith('conic-gradient(') || lower.startsWith('repeating-conic-gradient(')) {
        return parseConicGradient(trimmed);
    }
    
    return null;
}

/**
 * Parse linear-gradient() syntax
 */
function parseLinearGradient(value: string): LinearGradient | null {
    const lower = value.toLowerCase();
    const repeating = lower.startsWith('repeating-');
    
    // Extract content between parentheses
    const match = value.match(/^(?:repeating-)?linear-gradient\s*\(\s*(.*)\s*\)$/is);
    if (!match) return null;
    
    const content = match[1];
    const parts = splitGradientParts(content);
    if (parts.length < 2) return null;
    
    let angle = 180; // default: to bottom
    let startIndex = 0;
    
    // Check if first part is a direction
    const firstPart = parts[0].trim().toLowerCase();
    if (firstPart.startsWith('to ')) {
        angle = parseDirection(firstPart);
        startIndex = 1;
    } else if (firstPart.match(/^-?\d+(\.\d+)?(deg|rad|turn|grad)?$/)) {
        angle = parseAngle(firstPart);
        startIndex = 1;
    }
    
    const stops = parseColorStops(parts.slice(startIndex));
    if (stops.length < 2) return null;
    
    return { type: 'linear', angle, stops, repeating };
}

/**
 * Parse radial-gradient() syntax
 */
function parseRadialGradient(value: string): RadialGradient | null {
    const lower = value.toLowerCase();
    const repeating = lower.startsWith('repeating-');
    
    const match = value.match(/^(?:repeating-)?radial-gradient\s*\(\s*(.*)\s*\)$/is);
    if (!match) return null;
    
    const content = match[1];
    const parts = splitGradientParts(content);
    if (parts.length < 2) return null;
    
    let shape: 'circle' | 'ellipse' = 'ellipse';
    let position: GradientPosition = { ...CENTER_POSITION };
    let startIndex = 0;
    
    // Check if first part is shape/size/position specification
    const firstPart = parts[0].trim().toLowerCase();
    
    // Parse shape and position from first part
    const shapeAndPosition = parseRadialShapeAndPosition(firstPart);
    if (shapeAndPosition.consumed) {
        shape = shapeAndPosition.shape;
        position = shapeAndPosition.position;
        startIndex = 1;
    }
    
    const stops = parseColorStops(parts.slice(startIndex));
    if (stops.length < 2) return null;
    
    return { type: 'radial', shape, position, stops, repeating };
}

/**
 * Parse conic-gradient() syntax
 */
function parseConicGradient(value: string): ConicGradient | null {
    const lower = value.toLowerCase();
    const repeating = lower.startsWith('repeating-');
    
    const match = value.match(/^(?:repeating-)?conic-gradient\s*\(\s*(.*)\s*\)$/is);
    if (!match) return null;
    
    const content = match[1];
    const parts = splitGradientParts(content);
    if (parts.length < 2) return null;
    
    let angle = 0; // default: starts at top (0deg)
    let position: GradientPosition = { ...CENTER_POSITION };
    let startIndex = 0;
    
    // Check if first part contains angle or position
    const firstPart = parts[0].trim().toLowerCase();
    const conicConfig = parseConicConfig(firstPart);
    if (conicConfig.consumed) {
        angle = conicConfig.angle;
        position = conicConfig.position;
        startIndex = 1;
    }
    
    const stops = parseColorStops(parts.slice(startIndex));
    if (stops.length < 2) return null;
    
    return { type: 'conic', angle, position, stops, repeating };
}

/**
 * Parse shape and position from radial gradient first argument
 */
function parseRadialShapeAndPosition(part: string): {
    shape: 'circle' | 'ellipse';
    position: GradientPosition;
    consumed: boolean;
} {
    let shape: 'circle' | 'ellipse' = 'ellipse';
    let position: GradientPosition = { ...CENTER_POSITION };
    let consumed = false;
    
    // Check for shape
    if (part.startsWith('circle')) {
        shape = 'circle';
        consumed = true;
    } else if (part.startsWith('ellipse')) {
        shape = 'ellipse';
        consumed = true;
    }
    
    // Check for position (at X Y)
    const atMatch = part.match(/at\s+(.+)$/i);
    if (atMatch) {
        position = parsePositionKeywords(atMatch[1].trim());
        consumed = true;
    }
    
    // Also check for size keywords that indicate this is a config line
    const sizeKeywords = ['closest-side', 'closest-corner', 'farthest-side', 'farthest-corner'];
    for (const keyword of sizeKeywords) {
        if (part.includes(keyword)) {
            consumed = true;
            break;
        }
    }
    
    return { shape, position, consumed };
}

/**
 * Parse conic gradient configuration (from angle, at position)
 */
function parseConicConfig(part: string): {
    angle: number;
    position: GradientPosition;
    consumed: boolean;
} {
    let angle = 0;
    let position: GradientPosition = { ...CENTER_POSITION };
    let consumed = false;
    
    // Check for "from <angle>"
    const fromMatch = part.match(/from\s+(-?\d+(?:\.\d+)?)(deg|rad|turn|grad)?/i);
    if (fromMatch) {
        angle = parseAngle(fromMatch[1] + (fromMatch[2] || 'deg'));
        consumed = true;
    }
    
    // Check for "at <position>"
    const atMatch = part.match(/at\s+(.+)$/i);
    if (atMatch) {
        position = parsePositionKeywords(atMatch[1].trim());
        consumed = true;
    }
    
    return { angle, position, consumed };
}

/**
 * Parse position keywords or percentages
 * Supports: center, top, bottom, left, right, and percentage/length values
 */
function parsePositionKeywords(posStr: string): GradientPosition {
    const lower = posStr.toLowerCase().trim();
    
    // Single keyword
    const singleKeywords: Record<string, GradientPosition> = {
        'center': { x: 0.5, y: 0.5 },
        'top': { x: 0.5, y: 0 },
        'bottom': { x: 0.5, y: 1 },
        'left': { x: 0, y: 0.5 },
        'right': { x: 1, y: 0.5 },
    };
    
    if (singleKeywords[lower]) {
        return singleKeywords[lower];
    }
    
    // Two values (e.g., "left top", "50% 25%", "center top")
    const parts = lower.split(/\s+/);
    if (parts.length >= 2) {
        return {
            x: parsePositionValue(parts[0], 'x'),
            y: parsePositionValue(parts[1], 'y'),
        };
    }
    
    // Single percentage/length
    const val = parsePositionValue(lower, 'x');
    return { x: val, y: 0.5 };
}

/**
 * Parse a single position value (keyword, percentage, or length)
 */
function parsePositionValue(value: string, axis: 'x' | 'y'): number {
    const lower = value.toLowerCase().trim();
    
    // Keywords
    if (lower === 'center') return 0.5;
    if (lower === 'left' || lower === 'top') return 0;
    if (lower === 'right' || lower === 'bottom') return 1;
    
    // Percentage
    if (lower.endsWith('%')) {
        const percent = parseFloat(lower);
        if (!Number.isNaN(percent)) {
            return percent / 100;
        }
    }
    
    // Plain number (treat as percentage)
    const num = parseFloat(lower);
    if (!Number.isNaN(num)) {
        // If it's a small number, treat as normalized (0-1)
        // Otherwise treat as percentage
        return num > 1 ? num / 100 : num;
    }
    
    return 0.5; // default to center
}

/**
 * Split gradient content by commas, respecting parentheses
 */
function splitGradientParts(content: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    
    for (const char of content) {
        if (char === '(') {
            depth++;
            current += char;
        } else if (char === ')') {
            depth--;
            current += char;
        } else if (char === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    if (current.trim()) {
        parts.push(current.trim());
    }
    
    return parts;
}

/**
 * Parse direction keywords like "to right", "to bottom left"
 */
function parseDirection(direction: string): number {
    const lower = direction.toLowerCase().replace(/^to\s+/, '');
    
    const directions: Record<string, number> = {
        'top': 0,
        'right': 90,
        'bottom': 180,
        'left': 270,
        'top right': 45,
        'right top': 45,
        'bottom right': 135,
        'right bottom': 135,
        'bottom left': 225,
        'left bottom': 225,
        'top left': 315,
        'left top': 315,
    };
    
    return directions[lower] ?? 180;
}

/**
 * Parse angle value (deg, rad, turn, grad)
 */
function parseAngle(value: string): number {
    const match = value.match(/^(-?\d+(?:\.\d+)?)(deg|rad|turn|grad)?$/i);
    if (!match) return 180;
    
    const num = parseFloat(match[1]);
    const unit = (match[2] || 'deg').toLowerCase();
    
    switch (unit) {
        case 'rad':
            return (num * 180) / Math.PI;
        case 'turn':
            return num * 360;
        case 'grad':
            return num * 0.9;
        default:
            return num;
    }
}

/**
 * Parse color stops from parts
 */
function parseColorStops(parts: string[]): ColorStop[] {
    const stops: ColorStop[] = [];
    
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part) continue;
        
        // Try to extract color and optional position
        const { color, position } = parseColorStop(part, i, parts.length);
        if (color) {
            stops.push({ color, position });
        }
    }
    
    // Normalize positions - fill in missing ones
    normalizeStopPositions(stops);
    
    return stops;
}

/**
 * Parse a single color stop
 */
function parseColorStop(part: string, index: number, total: number): { color: string | null; position: number } {
    // Check for position at end (e.g., "red 50%", "#ff0000 25%")
    const posMatch = part.match(/^(.+?)\s+(\d+(?:\.\d+)?%?)$/);
    
    if (posMatch) {
        const color = posMatch[1].trim();
        const posStr = posMatch[2];
        const position = posStr.endsWith('%') 
            ? parseFloat(posStr) / 100 
            : parseFloat(posStr) / 100;
        return { color, position };
    }
    
    // No explicit position - will be calculated during normalization
    return { color: part, position: -1 };
}

/**
 * Fill in missing positions for color stops
 */
function normalizeStopPositions(stops: ColorStop[]): void {
    if (stops.length === 0) return;
    
    // First stop defaults to 0
    if (stops[0].position < 0) {
        stops[0].position = 0;
    }
    
    // Last stop defaults to 1
    if (stops[stops.length - 1].position < 0) {
        stops[stops.length - 1].position = 1;
    }
    
    // Fill in gaps
    let lastPos = 0;
    let gapStart = -1;
    
    for (let i = 0; i < stops.length; i++) {
        if (stops[i].position < 0) {
            if (gapStart < 0) gapStart = i;
        } else {
            if (gapStart >= 0) {
                // Fill the gap
                const gapEnd = i;
                const startPos = stops[gapStart - 1]?.position ?? 0;
                const endPos = stops[gapEnd].position;
                const gapCount = gapEnd - gapStart;
                
                for (let j = gapStart; j < gapEnd; j++) {
                    stops[j].position = startPos + ((endPos - startPos) * (j - gapStart + 1)) / (gapCount + 1);
                }
                gapStart = -1;
            }
            lastPos = stops[i].position;
        }
    }
}

/**
 * Get color at a position along the gradient.
 * For repeating gradients, the position wraps based on the stop range.
 */
export function getGradientColorAt(gradient: Gradient, position: number): string {
    const stops = gradient.stops;
    if (stops.length === 0) return '#000000';
    if (stops.length === 1) return stops[0].color;
    
    let t = position;
    
    // Handle repeating gradients
    if (gradient.repeating) {
        const firstStop = stops[0].position;
        const lastStop = stops[stops.length - 1].position;
        const range = lastStop - firstStop;
        
        if (range > 0) {
            // Normalize position to repeat within the stop range
            t = firstStop + ((t - firstStop) % range + range) % range;
        }
    } else {
        // Clamp position for non-repeating
        t = Math.max(0, Math.min(1, t));
    }
    
    // Find surrounding stops
    let lower = stops[0];
    let upper = stops[stops.length - 1];
    
    for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i].position && t <= stops[i + 1].position) {
            lower = stops[i];
            upper = stops[i + 1];
            break;
        }
    }
    
    // Parse colors
    const lowerRgb = parseColorToRgb(lower.color);
    const upperRgb = parseColorToRgb(upper.color);
    
    if (!lowerRgb || !upperRgb) {
        return lower.color;
    }
    
    // Interpolate
    const range = upper.position - lower.position;
    const localT = range > 0 ? (t - lower.position) / range : 0;
    const result = interpolateColor(lowerRgb, upperRgb, localT);
    
    return rgbToString(result);
}

/**
 * Calculate gradient position for a cell in linear gradient.
 * 
 * CSS gradient angles:
 * - 0deg = to top (bottom to top)
 * - 90deg = to right (left to right)
 * - 180deg = to bottom (top to bottom)
 * - 270deg = to left (right to left)
 */
export function getLinearGradientPosition(
    gradient: LinearGradient,
    x: number,
    y: number,
    width: number,
    height: number
): number {
    if (width <= 1 && height <= 1) return 0;
    
    // CSS angles: 0deg = to top, 90deg = to right, 180deg = to bottom, 270deg = to left
    const angle = gradient.angle;
    
    // Normalize coordinates to 0-1 range
    // Use (dimension - 1) to ensure the last pixel maps to exactly 1.0
    const nx = width > 1 ? x / (width - 1) : 0.5;
    const ny = height > 1 ? y / (height - 1) : 0.5;
    
    // Handle common angles directly for precision
    const normalizedAngle = ((angle % 360) + 360) % 360;
    
    if (normalizedAngle === 0) {
        // to top: position increases from bottom (1) to top (0)
        return 1 - ny;
    } else if (normalizedAngle === 90) {
        // to right: position increases from left (0) to right (1)
        return nx;
    } else if (normalizedAngle === 180) {
        // to bottom: position increases from top (0) to bottom (1)
        return ny;
    } else if (normalizedAngle === 270) {
        // to left: position increases from right (1) to left (0)
        return 1 - nx;
    }
    
    // For arbitrary angles, project point onto gradient line
    // Convert CSS angle to standard math angle (counterclockwise from east)
    // CSS: 0deg = north (up), clockwise
    // Math: 0rad = east (right), counterclockwise
    const angleRad = ((90 - angle) * Math.PI) / 180;
    
    // Direction vector of the gradient
    const dx = Math.cos(angleRad);
    const dy = -Math.sin(angleRad); // Negative because Y increases downward
    
    // Calculate the gradient line length through the rectangle
    // The gradient spans from one corner to the opposite corner along the angle
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    // Project the point onto the gradient direction
    // Center the coordinate system
    const cx = nx - 0.5;
    const cy = ny - 0.5;
    
    // Project onto gradient direction and normalize
    const projection = cx * dx + cy * dy;
    
    // The maximum projection distance for a unit square
    const maxProjection = (absDx + absDy) / 2;
    
    // Normalize to 0-1 range
    const position = maxProjection > 0 ? (projection / maxProjection + 1) / 2 : 0.5;
    
    return Math.max(0, Math.min(1, position));
}

/**
 * Calculate gradient position for a cell in radial gradient.
 * 
 * CSS radial gradients default to "farthest-corner" sizing, meaning:
 * - The gradient extends from the center to the farthest corner
 * - For "circle", the radius is the distance to the farthest corner
 * - For "ellipse", the ellipse is sized to reach the farthest corner
 * 
 * For terminal rendering, we use ellipse-like scaling for both shapes
 * to ensure the gradient fills the entire container (matching browser behavior
 * for background gradients that should cover the element).
 * 
 * The gradient center can be positioned using the `position` property.
 */
export function getRadialGradientPosition(
    gradient: RadialGradient,
    x: number,
    y: number,
    width: number,
    height: number
): number {
    if (width <= 0 || height <= 0) return 0;
    
    // Calculate center based on gradient position
    const pos = gradient.position ?? CENTER_POSITION;
    const cx = pos.x * (width - 1);
    const cy = pos.y * (height - 1);
    
    // Distance from center
    const dx = x - cx;
    const dy = y - cy;
    
    // Calculate the maximum distance to any edge from the center
    // This ensures the gradient covers the entire element
    const maxDistX = Math.max(cx, (width - 1) - cx);
    const maxDistY = Math.max(cy, (height - 1) - cy);
    
    const rx = maxDistX > 0 ? maxDistX : 1;
    const ry = maxDistY > 0 ? maxDistY : 1;
    
    // Normalized distance (1.0 at farthest edge)
    const distance = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    
    return distance;
}

/**
 * Calculate gradient position for a cell in conic gradient.
 * 
 * Conic gradients rotate around a center point, with colors distributed
 * along the angle. The starting angle can be specified with `from <angle>`.
 * 
 * @returns Position from 0-1 representing the angle around the center
 */
export function getConicGradientPosition(
    gradient: ConicGradient,
    x: number,
    y: number,
    width: number,
    height: number
): number {
    if (width <= 0 || height <= 0) return 0;
    
    // Calculate center based on gradient position
    const pos = gradient.position ?? CENTER_POSITION;
    const cx = pos.x * (width - 1);
    const cy = pos.y * (height - 1);
    
    // Distance from center
    const dx = x - cx;
    const dy = y - cy;
    
    // Calculate angle from center (atan2 gives -PI to PI)
    // CSS conic gradients start at the top (12 o'clock) and go clockwise
    // atan2(y, x) gives angle from positive x-axis, counterclockwise
    // We need to convert: rotate 90 degrees and flip direction
    let angle = Math.atan2(dx, -dy); // This gives 0 at top, positive clockwise
    
    // Convert to degrees and add starting angle
    let angleDeg = (angle * 180) / Math.PI;
    angleDeg = angleDeg - gradient.angle;
    
    // Normalize to 0-360 range
    angleDeg = ((angleDeg % 360) + 360) % 360;
    
    // Convert to 0-1 range
    return angleDeg / 360;
}

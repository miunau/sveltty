/**
 * Image Element Rendering
 * 
 * Renders <img> elements using terminal graphics protocols (Kitty, Sixel, iTerm2).
 * Falls back to placeholder rendering when graphics are not supported.
 * 
 * Images are loaded eagerly when src is set and cached on the node.
 * During render, if the encoded image is available, it's included in the output.
 */

import type { CliNode, TextStyle } from '../types.js';
import type { GridCell, ClipRect } from './types.js';
import type { ElementRenderer } from './registry.js';
import { registerRenderer } from './registry.js';
import { setCell } from './utils.js';
import { getStringWidth } from './string-width.js';
import {
    detectGraphicsCapabilities,
    encodeImage,
    clearKittyImages,
    type ImageData,
    type GraphicsProtocol,
} from './graphics.js';
import { markRowsDirty } from './pipeline/diff.js';
import { loadImageForTerminal, type ObjectFit } from './image-loader.js';
import { parseNumericAttribute } from '../utils/attributes.js';
import { log } from '../logger.js';

/** Symbol for storing image state on nodes. */
const IMAGE_STATE = Symbol('cli.image.state');

/** Image loading/encoding state stored on nodes. */
interface ImageState {
    /** Source URL/path. */
    src: string;
    /** Loading promise. */
    loading: Promise<void> | null;
    /** Raw RGBA image data for partial rendering. */
    rawData: ImageData | null;
    /** Full encoded image (for non-occluded rendering). */
    encoded: string | null;
    /** Cell dimensions after loading. */
    cellWidth: number;
    cellHeight: number;
    /** Pixel dimensions of the loaded image. */
    pixelWidth: number;
    pixelHeight: number;
    /** Error if loading failed. */
    error: Error | null;
    /** Protocol used for encoding. */
    protocol: GraphicsProtocol;
}

/** Get or create image state on a node. */
function getImageState(node: CliNode): ImageState | undefined {
    return (node as unknown as Record<symbol, ImageState | undefined>)[IMAGE_STATE];
}

/** Set image state on a node. */
function setImageState(node: CliNode, state: ImageState): void {
    (node as unknown as Record<symbol, ImageState>)[IMAGE_STATE] = state;
}

/**
 * Start loading an image for a node.
 * Called when src attribute is set on an <img> element.
 * @param node - The image node.
 * @param src - Image source URL or path.
 * @param scheduleRender - Function to schedule a re-render when image loads.
 */
export function loadImageForNode(
    node: CliNode,
    src: string,
    scheduleRender: () => void
): void {
    const caps = detectGraphicsCapabilities();
    
    // If no graphics support, don't bother loading
    if (caps.protocol === 'none') {
        setImageState(node, {
            src,
            loading: null,
            rawData: null,
            encoded: null,
            cellWidth: 0,
            cellHeight: 0,
            pixelWidth: 0,
            pixelHeight: 0,
            error: null,
            protocol: 'none',
        });
        return;
    }

    // Get target dimensions from node style or attributes (default to reasonable size)
    const style = node.style || {};
    const attrWidth = parseNumericAttribute(node.width, 0);
    const attrHeight = parseNumericAttribute(node.height, 0);
    const styleWidth = parseNumericAttribute(style.width, 0);
    const styleHeight = parseNumericAttribute(style.height, 0);
    const targetWidth = styleWidth || attrWidth || 20;
    const targetHeight = styleHeight || attrHeight || 10;
    
    // Get object-fit from style (default to 'fill' like browsers)
    const objectFit: ObjectFit = style.objectFit || 'fill';

    const state: ImageState = {
        src,
        loading: null,
        rawData: null,
        encoded: null,
        cellWidth: targetWidth,
        cellHeight: targetHeight,
        pixelWidth: 0,
        pixelHeight: 0,
        error: null,
        protocol: caps.protocol,
    };

    // Start async loading
    state.loading = (async () => {
        try {
            const imageData = await loadImageForTerminal(
                src,
                targetWidth,
                targetHeight,
                8,
                16,
                objectFit
            );

            // Store raw data for partial rendering
            state.rawData = imageData;
            state.pixelWidth = imageData.width;
            state.pixelHeight = imageData.height;

            // Encode full image for non-occluded rendering
            const encoded = encodeImage(imageData, {
                cellWidth: imageData.cellWidth,
                cellHeight: imageData.cellHeight,
                protocol: caps.protocol,
            });

            state.encoded = encoded;
            state.cellWidth = imageData.cellWidth;
            state.cellHeight = imageData.cellHeight;
            state.loading = null;

            // Trigger re-render now that image is ready
            scheduleRender();
        } catch (error) {
            state.error = error as Error;
            state.loading = null;
            log('loadImageForNode:error', { src, error });
        }
    })();

    setImageState(node, state);
}

/**
 * Check if an image node has a loaded, encoded image ready.
 */
export function isImageReady(node: CliNode): boolean {
    const state = getImageState(node);
    return state !== undefined && state.encoded !== null;
}

/**
 * Get the encoded image data for a node, if available.
 */
export function getEncodedImage(node: CliNode): string | null {
    const state = getImageState(node);
    return state?.encoded ?? null;
}

/**
 * Get the cell dimensions of a loaded image.
 */
export function getImageCellDimensions(node: CliNode): { width: number; height: number } | null {
    const state = getImageState(node);
    if (!state || !state.encoded) return null;
    return { width: state.cellWidth, height: state.cellHeight };
}

/** Rendered images for the current frame. */
interface RenderedImage {
    /** Display position X (in cells) - clipped to visible area. */
    x: number;
    /** Display position Y (in cells) - clipped to visible area. */
    y: number;
    /** Display width (in cells) - clipped to visible area. */
    width: number;
    /** Display height (in cells) - clipped to visible area. */
    height: number;
    /** Full encoded image (for non-occluded rendering). */
    encoded: string;
    /** Raw RGBA data for partial rendering. */
    rawData: ImageData | null;
    /** Pixel width of raw data. */
    pixelWidth: number;
    /** Pixel height of raw data. */
    pixelHeight: number;
    /** Protocol to use for encoding. */
    protocol: GraphicsProtocol;
    /** Z-index for stacking order. */
    zIndex: number;
    /** Source X offset (cells clipped from left). */
    srcOffsetX?: number;
    /** Source Y offset (cells clipped from top). */
    srcOffsetY?: number;
    /** Original width before clipping. */
    originalWidth?: number;
    /** Original height before clipping. */
    originalHeight?: number;
}

let renderedImages: RenderedImage[] = [];

/** Previous frame's image positions for diff-based clearing. */
let previousImagePositions: Map<string, { x: number; y: number; width: number; height: number }> = new Map();

/**
 * Get registered image bounds for occlusion checking.
 * Returns array of {x, y, width, height, zIndex} for all queued images.
 */
export function getImageBounds(): Array<{ x: number; y: number; width: number; height: number; zIndex: number }> {
    return renderedImages.map(img => ({
        x: img.x,
        y: img.y,
        width: img.width,
        height: img.height,
        zIndex: img.zIndex,
    }));
}

/**
 * Clear rendered images (called at start of each render).
 */
export function clearRenderedImages(): void {
    renderedImages = [];
}

/**
 * Get images that need to be output after the grid.
 */
export function getRenderedImages(): RenderedImage[] {
    return renderedImages;
}

/**
 * Render an <img> element.
 * If the image is loaded, queues it for output after the grid row.
 * Otherwise renders a placeholder.
 * 
 * Image cells are marked with `isImageCell: true` so the grid serializer skips them.
 * This preserves the terminal's existing content, allowing PNG transparency to work.
 */
export function renderImage(
    node: CliNode,
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    clip: ClipRect,
    zIndex: number = 0
): void {
    log('renderImage:enter', { 
        x, y, width, height, 
        clipX1: clip?.x1, clipY1: clip?.y1, clipX2: clip?.x2, clipY2: clip?.y2,
        gridRows: grid?.length, 
        gridCols: grid?.[0]?.length,
        hasGrid: !!grid,
        firstRowExists: !!grid?.[0]
    });
    
    const state = getImageState(node);
    const caps = detectGraphicsCapabilities();
    
    // Calculate visible rectangle (intersection of image rect with clip)
    const visibleX1 = Math.max(x, clip.x1);
    const visibleY1 = Math.max(y, clip.y1);
    const visibleX2 = Math.min(x + width, clip.x2);
    const visibleY2 = Math.min(y + height, clip.y2);
    
    const visibleWidth = visibleX2 - visibleX1;
    const visibleHeight = visibleY2 - visibleY1;
    
    // If completely clipped, don't render
    if (visibleWidth <= 0 || visibleHeight <= 0) {
        log('renderImage:fullyClipped');
        return;
    }
    
    // Calculate source offset (how much of the image is clipped from top/left)
    const srcOffsetX = visibleX1 - x;
    const srcOffsetY = visibleY1 - y;

    // If graphics supported and image is loaded, queue for rendering
    if (caps.protocol !== 'none' && state?.encoded) {
        log('renderImage:encoded', { 
            visibleX: visibleX1, visibleY: visibleY1, 
            visibleWidth, visibleHeight,
            srcOffsetX, srcOffsetY 
        });
        
        // Queue the image with visible bounds (clipped position and size)
        renderedImages.push({
            x: visibleX1,
            y: visibleY1,
            width: visibleWidth,
            height: visibleHeight,
            encoded: state.encoded,
            rawData: state.rawData,
            pixelWidth: state.pixelWidth,
            pixelHeight: state.pixelHeight,
            protocol: state.protocol,
            zIndex,
            // Store source offset for partial rendering
            srcOffsetX,
            srcOffsetY,
            // Store original dimensions for calculating pixel offsets
            originalWidth: width,
            originalHeight: height,
        });
    } else if (caps.protocol !== 'none' && state?.loading) {
        log('renderImage:loading');
        // Image is still loading - show loading indicator
        renderImageLoading(grid, x, y, width, height, clip);
    } else {
        log('renderImage:placeholder');
        // No graphics support or no image - render placeholder
        const alt = node.alt || node.getAttribute?.('alt') || '';
        renderImagePlaceholder(grid, x, y, width, height, alt, clip);
    }
    log('renderImage:exit');
}

/**
 * Render a loading indicator for images still being loaded.
 */
function renderImageLoading(
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    clip: ClipRect
): void {
    log('renderImageLoading:enter', { 
        x, y, width, height, 
        gridRows: grid?.length, 
        gridCols: grid?.[0]?.length 
    });
    
    const label = '...';
    const borderStyle: TextStyle = { dim: true };

    for (let row = y; row < y + height && row < grid.length; row++) {
        const gridRow = grid[row];
        if (!gridRow) {
            log('renderImageLoading:nullRow', { row });
            continue;
        }
        for (let col = x; col < x + width && col < gridRow.length; col++) {
            if (col < clip.x1 || col >= clip.x2 || row < clip.y1 || row >= clip.y2) continue;

            let char = ' ';
            let cellStyle: TextStyle | undefined = undefined;

            if (row === y && col === x) {
                char = '┌';
                cellStyle = borderStyle;
            } else if (row === y && col === x + width - 1) {
                char = '┐';
                cellStyle = borderStyle;
            } else if (row === y + height - 1 && col === x) {
                char = '└';
                cellStyle = borderStyle;
            } else if (row === y + height - 1 && col === x + width - 1) {
                char = '┘';
                cellStyle = borderStyle;
            } else if (row === y || row === y + height - 1) {
                char = '─';
                cellStyle = borderStyle;
            } else if (col === x || col === x + width - 1) {
                char = '│';
                cellStyle = borderStyle;
            }

            setCell(grid, row, col, char, cellStyle);
        }
    }

    // Draw centered loading text (using display width)
    if (height >= 3 && width >= 3) {
        const labelRow = y + Math.floor(height / 2);
        const labelWidth = getStringWidth(label);
        const labelStart = x + Math.floor((width - labelWidth) / 2);
        
        let col = labelStart;
        for (const char of label) {
            const charWidth = getStringWidth(char);
            if (charWidth === 0) continue;
            if (col >= x + width - 1) break;
            if (col > x && col < clip.x2 && labelRow >= clip.y1 && labelRow < clip.y2) {
                setCell(grid, labelRow, col, char, { dim: true });
                if (charWidth === 2 && col + 1 < x + width - 1 && col + 1 < clip.x2) {
                    setCell(grid, labelRow, col + 1, '', { dim: true });
                }
            }
            col += charWidth;
        }
    }
}

/**
 * Render a placeholder for images when graphics aren't supported.
 */
function renderImagePlaceholder(
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    alt: string,
    clip: ClipRect
): void {
    log('renderImagePlaceholder:enter', { 
        x, y, width, height, 
        gridRows: grid?.length, 
        gridCols: grid?.[0]?.length 
    });
    
    const label = alt || '[IMG]';
    const borderStyle: TextStyle = { dim: true };

    for (let row = y; row < y + height && row < grid.length; row++) {
        const gridRow = grid[row];
        if (!gridRow) {
            log('renderImagePlaceholder:nullRow', { row });
            continue;
        }
        for (let col = x; col < x + width && col < gridRow.length; col++) {
            if (col < clip.x1 || col >= clip.x2 || row < clip.y1 || row >= clip.y2) continue;

            let char = ' ';
            let cellStyle: TextStyle | undefined = undefined;

            if (row === y && col === x) {
                char = '┌';
                cellStyle = borderStyle;
            } else if (row === y && col === x + width - 1) {
                char = '┐';
                cellStyle = borderStyle;
            } else if (row === y + height - 1 && col === x) {
                char = '└';
                cellStyle = borderStyle;
            } else if (row === y + height - 1 && col === x + width - 1) {
                char = '┘';
                cellStyle = borderStyle;
            } else if (row === y || row === y + height - 1) {
                char = '─';
                cellStyle = borderStyle;
            } else if (col === x || col === x + width - 1) {
                char = '│';
                cellStyle = borderStyle;
            }

            setCell(grid, row, col, char, cellStyle);
        }
    }

    // Draw centered label (using display width)
    if (height >= 3 && width >= 3) {
        const labelRow = y + Math.floor(height / 2);
        const labelWidth = getStringWidth(label);
        const labelStart = x + Math.floor((width - labelWidth) / 2);
        
        let col = labelStart;
        for (const char of label) {
            const charWidth = getStringWidth(char);
            if (charWidth === 0) continue;
            if (col >= x + width - 1) break;
            if (col > x && col < clip.x2 && labelRow >= clip.y1 && labelRow < clip.y2) {
                setCell(grid, labelRow, col, char, undefined);
                if (charWidth === 2 && col + 1 < x + width - 1 && col + 1 < clip.x2) {
                    setCell(grid, labelRow, col + 1, '', undefined);
                }
            }
            col += charWidth;
        }
    }
}

/**
 * Check if there are images to render.
 */
export function hasRenderedImages(): boolean {
    return renderedImages.length > 0;
}

import { 
    type OcclusionZone, 
    type VisibleRegion,
    getVisibleRegions,
    isRectFullyOccluded,
    isRectOccluded
} from './occlusion.js';

/**
 * Crop a region from RGBA image data.
 * @param data - Source RGBA pixel data.
 * @param srcWidth - Source image width in pixels.
 * @param srcHeight - Source image height in pixels.
 * @param cropX - X offset to start crop (in pixels).
 * @param cropY - Y offset to start crop (in pixels).
 * @param cropWidth - Width of crop region (in pixels).
 * @param cropHeight - Height of crop region (in pixels).
 * @returns Cropped ImageData.
 */
function cropImageData(
    data: Uint8Array | Uint8ClampedArray,
    srcWidth: number,
    srcHeight: number,
    cropX: number,
    cropY: number,
    cropWidth: number,
    cropHeight: number
): ImageData {
    // Clamp to valid bounds
    const x1 = Math.max(0, Math.floor(cropX));
    const y1 = Math.max(0, Math.floor(cropY));
    const x2 = Math.min(srcWidth, Math.floor(cropX + cropWidth));
    const y2 = Math.min(srcHeight, Math.floor(cropY + cropHeight));
    const width = x2 - x1;
    const height = y2 - y1;
    
    if (width <= 0 || height <= 0) {
        return { data: new Uint8Array(0), width: 0, height: 0 };
    }
    
    const croppedData = new Uint8Array(width * height * 4);
    
    for (let row = 0; row < height; row++) {
        const srcOffset = ((y1 + row) * srcWidth + x1) * 4;
        const dstOffset = row * width * 4;
        croppedData.set(data.subarray(srcOffset, srcOffset + width * 4), dstOffset);
    }
    
    return { data: croppedData, width, height };
}

/**
 * Compare current and previous image positions.
 * Returns information about which rows are affected by image movement.
 */
function getImagePositionChanges(): {
    changed: boolean;
    oldRowsToRedraw: number[];
    needsKittyClear: boolean;
} {
    const currentPositions = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (let i = 0; i < renderedImages.length; i++) {
        const img = renderedImages[i];
        const key = `img_${i}`;
        currentPositions.set(key, { x: img.x, y: img.y, width: img.width, height: img.height });
    }
    
    const oldRowsToRedraw: Set<number> = new Set();
    let changed = false;
    let needsKittyClear = false;
    
    // Check positions that existed before
    for (const [key, prevPos] of previousImagePositions) {
        const currentPos = currentPositions.get(key);
        
        if (!currentPos) {
            // Image removed - need to redraw its old rows
            changed = true;
            needsKittyClear = true;
            for (let y = prevPos.y; y < prevPos.y + prevPos.height; y++) {
                oldRowsToRedraw.add(y);
            }
        } else if (
            prevPos.x !== currentPos.x || 
            prevPos.y !== currentPos.y || 
            prevPos.width !== currentPos.width || 
            prevPos.height !== currentPos.height
        ) {
            // Image moved - need to redraw old rows
            changed = true;
            needsKittyClear = true;
            for (let y = prevPos.y; y < prevPos.y + prevPos.height; y++) {
                oldRowsToRedraw.add(y);
            }
        }
    }
    
    // Check for new images
    if (currentPositions.size !== previousImagePositions.size) {
        changed = true;
    }
    
    return {
        changed,
        oldRowsToRedraw: Array.from(oldRowsToRedraw),
        needsKittyClear,
    };
}

/**
 * Mark rows dirty that had images in the previous frame but need to show different content now.
 * Call this BEFORE diffAndSerialize() so the grid content is re-sent for those rows.
 */
export function markImageDirtyRows(): void {
    const changes = getImagePositionChanges();
    if (changes.oldRowsToRedraw.length > 0) {
        markRowsDirty(changes.oldRowsToRedraw);
    }
}

/**
 * Serialize rendered images to output string.
 * Called after grid serialization to append image escape sequences.
 * 
 * For images that are partially occluded, we compute visible regions and render
 * only those portions. This provides smooth interaction with overlays like popovers.
 * 
 * The dirty row mechanism ensures grid content is re-sent for old image positions,
 * so we only need to handle Kitty's delete command here (other protocols have their
 * old positions overwritten by the grid re-render).
 * 
 * @param occlusionZones - Zones that occlude images (e.g., popovers, modals)
 */
export function serializeRenderedImages(
    occlusionZones: OcclusionZone[] = []
): string {
    let output = '';
    const caps = detectGraphicsCapabilities();
    
    // Get position changes info (before updating previousImagePositions)
    const changes = getImagePositionChanges();
    const previousCount = previousImagePositions.size;
    
    // Update previous positions for next frame
    previousImagePositions = new Map();
    for (let i = 0; i < renderedImages.length; i++) {
        const img = renderedImages[i];
        const key = `img_${i}`;
        previousImagePositions.set(key, { x: img.x, y: img.y, width: img.width, height: img.height });
    }
    
    // For Kitty protocol: The "images scroll with text" behavior in the spec refers to 
    // terminal-level scrolling (when text scrolls via newlines at bottom). For TUI apps 
    // doing application-level scrolling (redrawing content at different positions), 
    // Kitty images persist at their old screen positions until explicitly deleted.
    //
    // We need to clear Kitty images when:
    // 1. Images are removed (count decreases), OR
    // 2. Images moved to different positions
    const imagesMoved = changes.needsKittyClear;
    const imagesWereRemoved = previousCount > 0 && renderedImages.length < previousCount;
    
    if (caps.protocol === 'kitty' && (imagesWereRemoved || imagesMoved)) {
        output += clearKittyImages();
    }
    
    if (renderedImages.length === 0) {
        return output;
    }

    for (const img of renderedImages) {
        const imgRect = { x: img.x, y: img.y, width: img.width, height: img.height };
        
        // If fully occluded, skip entirely
        if (isRectFullyOccluded(imgRect)) {
            continue;
        }
        
        // Check if image was clipped (has source offsets or reduced dimensions)
        const isClipped = (img.srcOffsetX && img.srcOffsetX > 0) || 
                          (img.srcOffsetY && img.srcOffsetY > 0) ||
                          (img.originalWidth && img.width < img.originalWidth) ||
                          (img.originalHeight && img.height < img.originalHeight);
        
        // If clipped, we need to render a cropped portion
        if (isClipped && img.rawData) {
            output += encodeClippedImage(img);
            continue;
        }
        
        // Check if partially occluded by overlays
        if (isRectOccluded(imgRect)) {
        // Partially occluded - render only visible regions
        if (!img.rawData) {
            // No raw data available, skip
            continue;
        }
        
        const visibleRegions = getVisibleRegions(imgRect);
        if (visibleRegions.length === 0) {
            continue;
        }
        
        // Render each visible region
        for (const region of visibleRegions) {
            output += encodeVisibleRegion(img, region);
        }
            continue;
        }
        
        // Not clipped and not occluded - render with pre-encoded data
        // Position cursor and output the encoded image
        output += `\x1b[${img.y + 1};${img.x + 1}H`;
        output += img.encoded;
    }

    return output;
}

/**
 * Encode a clipped image - crops the source image data and encodes for display.
 */
function encodeClippedImage(img: RenderedImage): string {
    if (!img.rawData || img.pixelWidth === 0 || img.pixelHeight === 0) {
        return '';
    }
    
    const srcOffsetX = img.srcOffsetX ?? 0;
    const srcOffsetY = img.srcOffsetY ?? 0;
    const originalWidth = img.originalWidth ?? img.width;
    const originalHeight = img.originalHeight ?? img.height;
    
    // Calculate pixel coordinates
    const pixelsPerCellX = img.pixelWidth / originalWidth;
    const pixelsPerCellY = img.pixelHeight / originalHeight;
    
    const srcPixelX = Math.floor(srcOffsetX * pixelsPerCellX);
    const srcPixelY = Math.floor(srcOffsetY * pixelsPerCellY);
    const srcPixelWidth = Math.ceil(img.width * pixelsPerCellX);
    const srcPixelHeight = Math.ceil(img.height * pixelsPerCellY);
    
    // Crop the image data
    const croppedData = cropImageData(
        img.rawData.data,
        img.pixelWidth,
        img.pixelHeight,
        srcPixelX,
        srcPixelY,
        srcPixelWidth,
        srcPixelHeight
    );
    
    if (croppedData.width === 0 || croppedData.height === 0) {
        return '';
    }
    
    // Encode the cropped image
    const encoded = encodeImage(
        { data: croppedData.data, width: croppedData.width, height: croppedData.height },
        { cellWidth: img.width, cellHeight: img.height, protocol: img.protocol }
    );
    
    // Position and output
    return `\x1b[${img.y + 1};${img.x + 1}H${encoded}`;
}

/**
 * Encode and position a visible region of an image.
 */
function encodeVisibleRegion(img: RenderedImage, region: VisibleRegion): string {
    if (!img.rawData || img.pixelWidth === 0 || img.pixelHeight === 0) {
        return '';
    }
    
    // Calculate pixel coordinates for the source region
    // Map from cell coordinates to pixel coordinates
    const pixelsPerCellX = img.pixelWidth / img.width;
    const pixelsPerCellY = img.pixelHeight / img.height;
    
    const srcPixelX = Math.floor(region.srcX * pixelsPerCellX);
    const srcPixelY = Math.floor(region.srcY * pixelsPerCellY);
    const srcPixelWidth = Math.ceil(region.width * pixelsPerCellX);
    const srcPixelHeight = Math.ceil(region.height * pixelsPerCellY);
    
    // Crop the image data to the visible region
    const croppedData = cropImageData(
        img.rawData.data,
        img.pixelWidth,
        img.pixelHeight,
        srcPixelX,
        srcPixelY,
        srcPixelWidth,
        srcPixelHeight
    );
    
    if (croppedData.width === 0 || croppedData.height === 0) {
        return '';
    }
    
    // Encode the cropped region
    const encoded = encodeImage(croppedData, {
        cellWidth: region.width,
        cellHeight: region.height,
        protocol: img.protocol,
    });
    
    // Position cursor and output
    return `\x1b[${region.y + 1};${region.x + 1}H${encoded}`;
}

/**
 * Image element renderer.
 * Registered with the element registry to handle <img> elements.
 */
export const imageRenderer: ElementRenderer = {
    tags: ['img'],
    customLayout: true,
    customChildren: true,
    
    render(node, ctx, bounds) {
        // Get z-index from node's inline or CSS style (0 if not set)
        const inlineZ = node.style?.zIndex;
        const cssZ = node.__cssStyle?.zIndex;
        const zIndex = typeof inlineZ === 'number' ? inlineZ : (typeof cssZ === 'number' ? cssZ : 0);
        
        renderImage(
            node,
            ctx.grid,
            bounds.absX,
            bounds.absY,
            bounds.width,
            bounds.height,
            bounds.clip,
            zIndex
        );
    },
};

// Register the image renderer
registerRenderer(imageRenderer);

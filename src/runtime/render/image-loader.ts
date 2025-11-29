/**
 * Image Loading and Processing
 * 
 * Uses sharp for loading and resizing images from various sources.
 */

import sharp from 'sharp';
import type { ImageData } from './graphics.js';

/** Supported image sources. */
export type ImageSource = string | Buffer | Uint8Array;

/** CSS object-fit values. */
export type ObjectFit = 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';

/** Options for loading an image. */
export interface LoadImageOptions {
    /** Target width in pixels (resizes if specified). */
    width?: number;
    /** Target height in pixels (resizes if specified). */
    height?: number;
    /** Fit mode when resizing. */
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    /** Background color for padding (when fit is 'contain'). */
    background?: { r: number; g: number; b: number; alpha?: number };
    /** If true, do not enlarge images smaller than target dimensions (default: false). */
    withoutEnlargement?: boolean;
}

/**
 * Load an image from a file path, URL, or buffer.
 * @param source - File path, URL, or buffer containing image data.
 * @param options - Loading and resizing options.
 * @returns Promise resolving to RGBA image data.
 */
export async function loadImage(source: ImageSource, options: LoadImageOptions = {}): Promise<ImageData> {
    let image: sharp.Sharp;

    if (typeof source === 'string') {
        if (source.startsWith('http://') || source.startsWith('https://')) {
            // Fetch from URL
            const response = await fetch(source);
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
            }
            const buffer = await response.arrayBuffer();
            image = sharp(Buffer.from(buffer));
        } else {
            // Load from file path
            image = sharp(source);
        }
    } else if (source instanceof Uint8Array) {
        image = sharp(Buffer.from(source));
    } else {
        image = sharp(source);
    }

    // Apply resizing if dimensions specified
    if (options.width || options.height) {
        const resizeOptions: sharp.ResizeOptions = {
            width: options.width,
            height: options.height,
            fit: options.fit || 'inside',
            withoutEnlargement: options.withoutEnlargement ?? false,
        };

        if (options.background) {
            resizeOptions.background = options.background;
        }

        image = image.resize(resizeOptions);
    }

    // Ensure RGBA output
    image = image.ensureAlpha().raw();

    // Get the processed buffer
    const { data, info } = await image.toBuffer({ resolveWithObject: true });

    return {
        data: new Uint8Array(data),
        width: info.width,
        height: info.height,
    };
}

/**
 * Map CSS object-fit to sharp fit modes.
 */
function mapObjectFitToSharp(objectFit: ObjectFit): 'cover' | 'contain' | 'fill' | 'inside' | 'outside' {
    switch (objectFit) {
        case 'fill':
            return 'fill'; // Stretch to fill, ignoring aspect ratio
        case 'contain':
        case 'scale-down':
            return 'inside'; // Fit inside, maintaining aspect ratio (letterbox)
        case 'cover':
            return 'cover'; // Fill area, maintaining aspect ratio (crop)
        case 'none':
            return 'inside'; // No resize, but sharp needs a fit mode
        default:
            return 'cover';
    }
}

/**
 * Load an image and resize it to fit terminal cell dimensions.
 * @param source - Image source.
 * @param cellWidth - Target width in terminal cells.
 * @param cellHeight - Target height in terminal cells.
 * @param cellPixelWidth - Pixels per cell width (default: 8).
 * @param cellPixelHeight - Pixels per cell height (default: 16).
 * @param objectFit - CSS object-fit value (default: 'fill').
 * @returns Promise resolving to RGBA image data sized for terminal display.
 */
export async function loadImageForTerminal(
    source: ImageSource,
    cellWidth: number,
    cellHeight: number,
    cellPixelWidth = 8,
    cellPixelHeight = 16,
    objectFit: ObjectFit = 'fill'
): Promise<ImageData & { cellWidth: number; cellHeight: number }> {
    const targetPixelWidth = cellWidth * cellPixelWidth;
    const targetPixelHeight = cellHeight * cellPixelHeight;

    const sharpFit = mapObjectFitToSharp(objectFit);
    
    // For 'none', load without resizing
    if (objectFit === 'none') {
        const image = await loadImage(source);
        return {
            ...image,
            cellWidth: Math.ceil(image.width / cellPixelWidth),
            cellHeight: Math.ceil(image.height / cellPixelHeight),
        };
    }

    const image = await loadImage(source, {
        width: targetPixelWidth,
        height: targetPixelHeight,
        fit: sharpFit,
    });

    // For 'contain' and 'scale-down', calculate actual cell dimensions from loaded size
    if (objectFit === 'contain' || objectFit === 'scale-down') {
        return {
            ...image,
            cellWidth: Math.ceil(image.width / cellPixelWidth),
            cellHeight: Math.ceil(image.height / cellPixelHeight),
        };
    }

    // For 'cover' and 'fill', use the requested cell dimensions
    return {
        ...image,
        cellWidth,
        cellHeight,
    };
}

/**
 * Get image metadata without loading full image data.
 * @param source - Image source.
 * @returns Promise resolving to image metadata.
 */
export async function getImageMetadata(source: ImageSource): Promise<{
    width: number;
    height: number;
    format?: string;
    hasAlpha?: boolean;
}> {
    let image: sharp.Sharp;

    if (typeof source === 'string') {
        if (source.startsWith('http://') || source.startsWith('https://')) {
            const response = await fetch(source);
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.status}`);
            }
            const buffer = await response.arrayBuffer();
            image = sharp(Buffer.from(buffer));
        } else {
            image = sharp(source);
        }
    } else if (source instanceof Uint8Array) {
        image = sharp(Buffer.from(source));
    } else {
        image = sharp(source);
    }

    const metadata = await image.metadata();

    return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format,
        hasAlpha: metadata.hasAlpha,
    };
}

/**
 * Create a placeholder image for when loading fails.
 * @param width - Width in pixels.
 * @param height - Height in pixels.
 * @param text - Optional text to display.
 * @returns RGBA image data.
 */
export function createPlaceholderImage(width: number, height: number, text?: string): ImageData {
    const data = new Uint8Array(width * height * 4);

    // Create a checkerboard pattern
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const isLight = ((x >> 3) + (y >> 3)) % 2 === 0;
            const gray = isLight ? 200 : 150;

            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
            data[i + 3] = 255;
        }
    }

    return { data, width, height };
}

/** Cache for loaded images. */
const imageCache = new Map<string, ImageData>();

/**
 * Load an image with caching.
 * @param source - Image source (must be a string path/URL for caching).
 * @param options - Loading options.
 * @returns Promise resolving to RGBA image data.
 */
export async function loadImageCached(
    source: string,
    options: LoadImageOptions = {}
): Promise<ImageData> {
    const cacheKey = `${source}:${options.width || 'auto'}x${options.height || 'auto'}:${options.fit || 'inside'}`;

    const cached = imageCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const image = await loadImage(source, options);
    imageCache.set(cacheKey, image);

    return image;
}

/**
 * Clear the image cache.
 */
export function clearImageCache(): void {
    imageCache.clear();
}

/**
 * Get cache statistics.
 */
export function getImageCacheStats(): { size: number; keys: string[] } {
    return {
        size: imageCache.size,
        keys: Array.from(imageCache.keys()),
    };
}


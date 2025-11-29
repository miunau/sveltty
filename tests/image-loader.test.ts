import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import {
    loadImage,
    loadImageForTerminal,
    getImageMetadata,
    createPlaceholderImage,
    loadImageCached,
    clearImageCache,
    getImageCacheStats,
} from '../src/runtime/render/image-loader.js';

/**
 * Create a test image buffer with sharp.
 */
async function createTestImage(width: number, height: number, color: { r: number; g: number; b: number }): Promise<Buffer> {
    return sharp({
        create: {
            width,
            height,
            channels: 3,
            background: color,
        },
    })
        .png()
        .toBuffer();
}

describe('loadImage', () => {
    it('loads image from buffer', async () => {
        const buffer = await createTestImage(100, 50, { r: 255, g: 0, b: 0 });
        const result = await loadImage(buffer);

        expect(result.width).toBe(100);
        expect(result.height).toBe(50);
        expect(result.data).toBeInstanceOf(Uint8Array);
        expect(result.data.length).toBe(100 * 50 * 4); // RGBA
    });

    it('loads image from Uint8Array', async () => {
        const buffer = await createTestImage(32, 32, { r: 0, g: 255, b: 0 });
        const uint8 = new Uint8Array(buffer);
        const result = await loadImage(uint8);

        expect(result.width).toBe(32);
        expect(result.height).toBe(32);
    });

    it('resizes image with width option', async () => {
        const buffer = await createTestImage(200, 100, { r: 0, g: 0, b: 255 });
        const result = await loadImage(buffer, { width: 50 });

        expect(result.width).toBe(50);
        expect(result.height).toBe(25); // Maintains aspect ratio
    });

    it('resizes image with height option', async () => {
        const buffer = await createTestImage(200, 100, { r: 128, g: 128, b: 128 });
        const result = await loadImage(buffer, { height: 25 });

        expect(result.width).toBe(50); // Maintains aspect ratio
        expect(result.height).toBe(25);
    });

    it('resizes image with both dimensions', async () => {
        const buffer = await createTestImage(200, 200, { r: 64, g: 64, b: 64 });
        const result = await loadImage(buffer, { width: 50, height: 100 });

        // 'inside' fit means it fits within the box while maintaining aspect ratio
        expect(result.width).toBeLessThanOrEqual(50);
        expect(result.height).toBeLessThanOrEqual(100);
    });

    it('does not enlarge with withoutEnlargement', async () => {
        const buffer = await createTestImage(20, 20, { r: 255, g: 255, b: 0 });
        const result = await loadImage(buffer, { width: 100, height: 100, withoutEnlargement: true });

        // Should not enlarge beyond original size
        expect(result.width).toBe(20);
        expect(result.height).toBe(20);
    });

    it('outputs RGBA data', async () => {
        const buffer = await createTestImage(10, 10, { r: 255, g: 0, b: 0 });
        const result = await loadImage(buffer);

        // Check first pixel is red with full alpha
        expect(result.data[0]).toBe(255); // R
        expect(result.data[1]).toBe(0);   // G
        expect(result.data[2]).toBe(0);   // B
        expect(result.data[3]).toBe(255); // A
    });
});

describe('loadImageForTerminal', () => {
    it('calculates cell dimensions correctly', async () => {
        const buffer = await createTestImage(80, 160, { r: 100, g: 100, b: 100 });
        const result = await loadImageForTerminal(buffer, 20, 20, 8, 16);

        expect(result.cellWidth).toBeGreaterThan(0);
        expect(result.cellHeight).toBeGreaterThan(0);
        expect(result.cellWidth).toBeLessThanOrEqual(20);
        expect(result.cellHeight).toBeLessThanOrEqual(20);
    });

    it('uses default cell pixel dimensions', async () => {
        // Create image larger than target to ensure resize happens
        const buffer = await createTestImage(160, 320, { r: 50, g: 50, b: 50 });
        const result = await loadImageForTerminal(buffer, 10, 10);

        // Default object-fit is 'fill', which returns requested cell dimensions
        expect(result.cellWidth).toBe(10);
        expect(result.cellHeight).toBe(10);
        // Image is resized to fit 10x10 cells at 8x16 pixels per cell
        expect(result.width).toBe(80);
        expect(result.height).toBe(160);
    });

    it('respects custom cell pixel dimensions', async () => {
        // Create image larger than target to ensure resize happens
        const buffer = await createTestImage(200, 400, { r: 200, g: 200, b: 200 });
        const result = await loadImageForTerminal(buffer, 10, 10, 10, 20);

        // Default object-fit is 'fill', which returns requested cell dimensions
        expect(result.cellWidth).toBe(10);
        expect(result.cellHeight).toBe(10);
        // Image is resized to fit 10x10 cells at 10x20 pixels per cell
        expect(result.width).toBe(100);
        expect(result.height).toBe(200);
    });

    it('constrains to max cell dimensions', async () => {
        const buffer = await createTestImage(1000, 1000, { r: 0, g: 128, b: 255 });
        const result = await loadImageForTerminal(buffer, 5, 5, 8, 16);

        // Should be resized to fit within 5x5 cells (40x80 pixels)
        expect(result.width).toBeLessThanOrEqual(40);
        expect(result.height).toBeLessThanOrEqual(80);
        expect(result.cellWidth).toBeLessThanOrEqual(5);
        expect(result.cellHeight).toBeLessThanOrEqual(5);
    });
});

describe('getImageMetadata', () => {
    it('returns image dimensions', async () => {
        const buffer = await createTestImage(150, 75, { r: 0, g: 0, b: 0 });
        const metadata = await getImageMetadata(buffer);

        expect(metadata.width).toBe(150);
        expect(metadata.height).toBe(75);
    });

    it('returns image format', async () => {
        const buffer = await createTestImage(50, 50, { r: 255, g: 255, b: 255 });
        const metadata = await getImageMetadata(buffer);

        expect(metadata.format).toBe('png');
    });

    it('works with Uint8Array', async () => {
        const buffer = await createTestImage(25, 25, { r: 128, g: 0, b: 128 });
        const uint8 = new Uint8Array(buffer);
        const metadata = await getImageMetadata(uint8);

        expect(metadata.width).toBe(25);
        expect(metadata.height).toBe(25);
    });
});

describe('createPlaceholderImage', () => {
    it('creates image with correct dimensions', () => {
        const result = createPlaceholderImage(64, 32);

        expect(result.width).toBe(64);
        expect(result.height).toBe(32);
        expect(result.data.length).toBe(64 * 32 * 4);
    });

    it('creates RGBA data with full alpha', () => {
        const result = createPlaceholderImage(16, 16);

        // Check all pixels have full alpha
        for (let i = 3; i < result.data.length; i += 4) {
            expect(result.data[i]).toBe(255);
        }
    });

    it('creates checkerboard pattern', () => {
        const result = createPlaceholderImage(16, 16);

        // First pixel (0,0) should be light (200)
        expect(result.data[0]).toBe(200);
        expect(result.data[1]).toBe(200);
        expect(result.data[2]).toBe(200);

        // Pixel at (8,0) should be dark (150) due to checkerboard
        const idx = 8 * 4;
        expect(result.data[idx]).toBe(150);
        expect(result.data[idx + 1]).toBe(150);
        expect(result.data[idx + 2]).toBe(150);
    });

    it('handles small dimensions', () => {
        const result = createPlaceholderImage(1, 1);

        expect(result.width).toBe(1);
        expect(result.height).toBe(1);
        expect(result.data.length).toBe(4);
    });
});

describe('image caching', () => {
    beforeEach(() => {
        clearImageCache();
    });

    afterEach(() => {
        clearImageCache();
    });

    it('caches loaded images', async () => {
        const buffer = await createTestImage(50, 50, { r: 100, g: 100, b: 100 });
        // Write to temp file for caching test
        const path = '/tmp/test-cache-image.png';
        await sharp(buffer).toFile(path);

        const result1 = await loadImageCached(path);
        const stats1 = getImageCacheStats();

        expect(stats1.size).toBe(1);

        const result2 = await loadImageCached(path);
        const stats2 = getImageCacheStats();

        // Should still be 1 (cached)
        expect(stats2.size).toBe(1);

        // Same data
        expect(result1.width).toBe(result2.width);
        expect(result1.height).toBe(result2.height);
    });

    it('uses different cache keys for different options', async () => {
        const buffer = await createTestImage(100, 100, { r: 50, g: 50, b: 50 });
        const path = '/tmp/test-cache-options.png';
        await sharp(buffer).toFile(path);

        await loadImageCached(path, { width: 50 });
        await loadImageCached(path, { width: 25 });
        await loadImageCached(path, { height: 50 });

        const stats = getImageCacheStats();
        expect(stats.size).toBe(3);
    });

    it('clears cache correctly', async () => {
        const buffer = await createTestImage(30, 30, { r: 0, g: 255, b: 0 });
        const path = '/tmp/test-cache-clear.png';
        await sharp(buffer).toFile(path);

        await loadImageCached(path);
        expect(getImageCacheStats().size).toBe(1);

        clearImageCache();
        expect(getImageCacheStats().size).toBe(0);
    });

    it('returns cache keys', async () => {
        const buffer = await createTestImage(40, 40, { r: 255, g: 0, b: 255 });
        const path = '/tmp/test-cache-keys.png';
        await sharp(buffer).toFile(path);

        await loadImageCached(path, { width: 20, height: 20 });

        const stats = getImageCacheStats();
        expect(stats.keys.length).toBe(1);
        expect(stats.keys[0]).toContain(path);
        expect(stats.keys[0]).toContain('20x20');
    });
});


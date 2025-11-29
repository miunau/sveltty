import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    detectGraphicsCapabilities,
    resetGraphicsCapabilities,
    encodeKittyImage,
    encodeIterm2Image,
    encodeImage,
    deleteKittyImage,
    clearKittyImages,
    renderImageAt,
    scaleImageToCells,
    createSolidImage,
    createGradientImage,
    type GraphicsCapabilities,
    type ImageData,
} from '../src/runtime/render/graphics.js';

describe('graphics capabilities detection', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        resetGraphicsCapabilities();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
        resetGraphicsCapabilities();
    });

    it('detects Kitty terminal via KITTY_WINDOW_ID', () => {
        process.env.KITTY_WINDOW_ID = '1';
        const caps = detectGraphicsCapabilities();
        
        expect(caps.kitty).toBe(true);
        expect(caps.protocol).toBe('kitty');
        expect(caps.terminal).toBe('kitty');
    });

    it('detects Kitty terminal via KITTY_PID', () => {
        process.env.KITTY_PID = '12345';
        const caps = detectGraphicsCapabilities();
        
        expect(caps.kitty).toBe(true);
        expect(caps.protocol).toBe('kitty');
    });

    it('detects iTerm2 terminal', () => {
        process.env.TERM_PROGRAM = 'iTerm.app';
        const caps = detectGraphicsCapabilities();
        
        expect(caps.iterm2).toBe(true);
        expect(caps.sixel).toBe(true); // iTerm2 supports sixel too
        expect(caps.protocol).toBe('iterm2');
        expect(caps.terminal).toBe('iterm2');
    });

    it('detects WezTerm terminal', () => {
        process.env.TERM_PROGRAM = 'WezTerm';
        const caps = detectGraphicsCapabilities();
        
        expect(caps.kitty).toBe(true);
        expect(caps.sixel).toBe(true);
        expect(caps.protocol).toBe('kitty'); // Prefers kitty
        expect(caps.terminal).toBe('wezterm');
    });

    it('detects Konsole terminal', () => {
        process.env.KONSOLE_VERSION = '21.12.0';
        const caps = detectGraphicsCapabilities();
        
        expect(caps.kitty).toBe(true);
        expect(caps.protocol).toBe('kitty');
        expect(caps.terminal).toBe('konsole');
    });

    it('detects foot terminal', () => {
        process.env.TERM = 'foot';
        const caps = detectGraphicsCapabilities();
        
        expect(caps.sixel).toBe(true);
        expect(caps.protocol).toBe('sixel');
        expect(caps.terminal).toBe('foot');
    });

    it('returns none for unknown terminal', () => {
        process.env = {};
        const caps = detectGraphicsCapabilities();
        
        expect(caps.protocol).toBe('none');
        expect(caps.kitty).toBe(false);
        expect(caps.iterm2).toBe(false);
        expect(caps.sixel).toBe(false);
    });

    it('caches capabilities', () => {
        process.env.KITTY_WINDOW_ID = '1';
        const caps1 = detectGraphicsCapabilities();
        
        // Change env (should not affect cached result)
        delete process.env.KITTY_WINDOW_ID;
        const caps2 = detectGraphicsCapabilities();
        
        expect(caps1).toBe(caps2);
        expect(caps2.kitty).toBe(true);
    });

    it('resets cache correctly', () => {
        process.env.KITTY_WINDOW_ID = '1';
        detectGraphicsCapabilities();
        
        resetGraphicsCapabilities();
        delete process.env.KITTY_WINDOW_ID;
        
        const caps = detectGraphicsCapabilities();
        expect(caps.kitty).toBe(false);
    });
});

describe('Kitty graphics encoding', () => {
    it('encodes a simple image', () => {
        const image = createSolidImage(2, 2, 255, 0, 0);
        const encoded = encodeKittyImage(image);

        // Should start with APC (Application Program Command)
        expect(encoded).toContain('\x1b_G');
        // Should end with ST (String Terminator)
        expect(encoded).toContain('\x1b\\');
        // Should specify format and dimensions
        expect(encoded).toContain('f=32'); // 32-bit RGBA
        expect(encoded).toContain('s=2'); // width
        expect(encoded).toContain('v=2'); // height
        expect(encoded).toContain('a=T'); // transmit and display
    });

    it('includes cell dimensions when specified', () => {
        const image = createSolidImage(10, 10, 0, 255, 0);
        const encoded = encodeKittyImage(image, { cellWidth: 5, cellHeight: 3 });

        expect(encoded).toContain('c=5'); // cell width
        expect(encoded).toContain('r=3'); // cell height (rows)
    });

    it('includes position when specified', () => {
        const image = createSolidImage(4, 4, 0, 0, 255);
        const encoded = encodeKittyImage(image, { x: 10, y: 5 });

        expect(encoded).toContain('X=10');
        expect(encoded).toContain('Y=5');
    });

    it('includes z-index for layering', () => {
        const image = createSolidImage(4, 4, 128, 128, 128);
        const encoded = encodeKittyImage(image, { zIndex: -1 });

        expect(encoded).toContain('z=-1');
    });

    it('includes image ID', () => {
        const image = createSolidImage(4, 4, 255, 255, 0);
        const encoded = encodeKittyImage(image, { id: 42 });

        expect(encoded).toContain('i=42');
    });

    it('chunks large images', () => {
        // Create a larger image that will need chunking
        const image = createSolidImage(100, 100, 255, 0, 255);
        const encoded = encodeKittyImage(image);

        // Large images should have multiple APC sequences
        const apcCount = (encoded.match(/\x1b_G/g) || []).length;
        expect(apcCount).toBeGreaterThan(1);
        
        // First chunk should have m=1 (more chunks coming)
        expect(encoded).toContain('m=1');
    });
});

describe('iTerm2 graphics encoding', () => {
    it('encodes using OSC 1337', () => {
        const image = createSolidImage(2, 2, 255, 128, 0);
        const encoded = encodeIterm2Image(image);

        // Should use OSC 1337 File protocol
        expect(encoded).toContain('\x1b]1337;File=');
        expect(encoded).toContain('inline=1');
        // Should end with BEL
        expect(encoded).toContain('\x07');
    });

    it('includes dimensions when specified', () => {
        const image = createSolidImage(10, 10, 0, 128, 255);
        const encoded = encodeIterm2Image(image, { cellWidth: 20, cellHeight: 10 });

        expect(encoded).toContain('width=20');
        expect(encoded).toContain('height=10');
    });
});

describe('unified image encoding', () => {
    beforeEach(() => {
        resetGraphicsCapabilities();
    });

    afterEach(() => {
        resetGraphicsCapabilities();
    });

    it('uses specified protocol', () => {
        const image = createSolidImage(4, 4, 255, 0, 0);
        
        const kitty = encodeImage(image, { protocol: 'kitty' });
        expect(kitty).toContain('\x1b_G');

        const sixel = encodeImage(image, { protocol: 'sixel' });
        expect(sixel).toContain('\x1bP'); // DCS for sixel
    });

    it('returns empty string for none protocol', () => {
        const image = createSolidImage(4, 4, 0, 255, 0);
        const encoded = encodeImage(image, { protocol: 'none' });
        
        expect(encoded).toBe('');
    });
});

describe('Kitty image management', () => {
    it('generates delete command for image', () => {
        const cmd = deleteKittyImage(42);
        
        expect(cmd).toContain('\x1b_G');
        expect(cmd).toContain('a=d'); // delete action
        expect(cmd).toContain('i=42'); // image ID
    });

    it('generates delete command for placement only', () => {
        const cmd = deleteKittyImage(42, 'placement');
        
        expect(cmd).toContain('d=p'); // delete placement
    });

    it('generates delete command for image data only', () => {
        const cmd = deleteKittyImage(42, 'image');
        
        expect(cmd).toContain('d=I'); // delete image data
    });

    it('generates clear all images command', () => {
        const cmd = clearKittyImages();
        
        expect(cmd).toContain('\x1b_G');
        expect(cmd).toContain('a=d');
        expect(cmd).toContain('d=A'); // delete all
    });
});

describe('image positioning', () => {
    it('generates cursor position sequence', () => {
        const imageData = 'test-image-data';
        const result = renderImageAt(10, 5, imageData);
        
        expect(result).toBe('\x1b[5;10Htest-image-data');
    });
});

describe('image scaling', () => {
    it('scales image to fit within cell bounds', () => {
        const result = scaleImageToCells(100, 50, 20, 10);
        
        expect(result.cellWidth).toBeLessThanOrEqual(20);
        expect(result.cellHeight).toBeLessThanOrEqual(10);
    });

    it('maintains aspect ratio', () => {
        const result = scaleImageToCells(200, 100, 20, 20);
        
        // Original is 2:1, scaled should maintain ratio
        const ratio = result.pixelWidth / result.pixelHeight;
        expect(ratio).toBeCloseTo(2, 1);
    });

    it('does not upscale small images', () => {
        const result = scaleImageToCells(10, 10, 100, 100);
        
        // Should not exceed original size
        expect(result.pixelWidth).toBeLessThanOrEqual(10);
        expect(result.pixelHeight).toBeLessThanOrEqual(10);
    });

    it('uses custom cell pixel dimensions', () => {
        const result = scaleImageToCells(100, 100, 10, 10, 10, 20);
        
        // With 10x20 cell pixels, 10 cells = 100x200 pixels
        expect(result.cellWidth).toBeLessThanOrEqual(10);
        expect(result.cellHeight).toBeLessThanOrEqual(10);
    });
});

describe('test image creation', () => {
    it('creates solid color image', () => {
        const image = createSolidImage(10, 10, 255, 128, 64, 200);
        
        expect(image.width).toBe(10);
        expect(image.height).toBe(10);
        expect(image.data.length).toBe(10 * 10 * 4);
        
        // Check first pixel
        expect(image.data[0]).toBe(255); // R
        expect(image.data[1]).toBe(128); // G
        expect(image.data[2]).toBe(64);  // B
        expect(image.data[3]).toBe(200); // A
    });

    it('creates gradient image', () => {
        const image = createGradientImage(100, 10, true);
        
        expect(image.width).toBe(100);
        expect(image.height).toBe(10);
        expect(image.data.length).toBe(100 * 10 * 4);
        
        // Check that there's variation in the gradient (middle pixel different from first)
        const firstPixel = [image.data[0], image.data[1], image.data[2]];
        const midPixel = [image.data[50 * 4], image.data[50 * 4 + 1], image.data[50 * 4 + 2]];
        
        // At least one channel should differ
        const differs = firstPixel.some((v, i) => v !== midPixel[i]);
        expect(differs).toBe(true);
    });
});


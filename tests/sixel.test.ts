import { describe, it, expect } from 'vitest';
import {
    encodeSixelImage,
    encodeSixelHeader,
    encodeSixelRun,
    encodeRgbaToSixel,
    rgbaToIndexed,
} from '../src/runtime/render/sixel.js';

describe('sixel encoder', () => {
    it('encodes a simple 2x2 red image', () => {
        const image = new Uint8Array([0, 0, 0, 0]); // 2x2 pixels, all palette index 0
        const palette: [number, number, number][] = [[1, 0, 0]]; // Red
        const chunks: string[] = [];

        encodeSixelImage({
            image,
            width: 2,
            height: 2,
            palette,
            write: (chunk) => chunks.push(new TextDecoder('latin1').decode(chunk)),
        });

        const output = chunks.join('');
        
        // Should start with DCS (Device Control String) introducer
        expect(output).toContain('\x1bP');
        // Should end with ST (String Terminator)
        expect(output).toContain('\x1b\\');
        // Should contain palette definition
        expect(output).toContain('#0;2;100;0;0'); // Red at 100%
    });

    it('encodes header with dimensions and palette', () => {
        const chunks: string[] = [];
        const palette: [number, number, number][] = [
            [1, 0, 0],   // Red
            [0, 1, 0],   // Green
            [0, 0, 1],   // Blue
        ];

        encodeSixelHeader(10, 20, palette, (chunk) => {
            chunks.push(new TextDecoder('latin1').decode(chunk));
        });

        const output = chunks.join('');
        
        expect(output).toContain('\x1bP0;1;q'); // DCS with sixel mode
        expect(output).toContain('"1;1;10;20'); // Raster attributes
        expect(output).toContain('#0;2;100;0;0'); // Red
        expect(output).toContain('#1;2;0;100;0'); // Green
        expect(output).toContain('#2;2;0;0;100'); // Blue
    });

    it('encodes run-length encoding for repeated sixels', () => {
        const buffer = new Uint8Array(20);
        
        // Single sixel
        let pos = encodeSixelRun(0, 1, buffer, 0);
        expect(pos).toBe(1);
        expect(buffer[0]).toBe(0x3f); // '?' (sixel 0)

        // Triple sixel (no RLE needed)
        pos = encodeSixelRun(1, 3, buffer, 0);
        expect(pos).toBe(3);
        expect(buffer[0]).toBe(0x40); // '@' (sixel 1)
        expect(buffer[1]).toBe(0x40);
        expect(buffer[2]).toBe(0x40);

        // RLE for 5 repetitions
        pos = encodeSixelRun(2, 5, buffer, 0);
        expect(buffer[0]).toBe(0x21); // '!' (DECGRI)
        // Should contain '5' and 'A' (sixel 2)
    });

    it('converts RGBA to indexed palette', () => {
        // 2x2 image: red, green, blue, transparent
        const rgba = new Uint8Array([
            255, 0, 0, 255,     // Red
            0, 255, 0, 255,     // Green
            0, 0, 255, 255,     // Blue
            0, 0, 0, 0,         // Transparent
        ]);

        const { image, palette, transparentIndex } = rgbaToIndexed(rgba, 2, 2);

        expect(image.length).toBe(4);
        expect(palette.length).toBe(4); // 3 colors + transparent
        expect(transparentIndex).toBeGreaterThanOrEqual(0);
        
        // Verify colors are distinct
        const indices = new Set(image);
        expect(indices.size).toBe(4);
    });

    it('encodes RGBA directly to sixel', () => {
        // Simple 4x6 solid red image (one sixel row)
        const rgba = new Uint8Array(4 * 6 * 4);
        for (let i = 0; i < 4 * 6; i++) {
            rgba[i * 4] = 255;     // R
            rgba[i * 4 + 1] = 0;   // G
            rgba[i * 4 + 2] = 0;   // B
            rgba[i * 4 + 3] = 255; // A
        }

        const sixel = encodeRgbaToSixel(rgba, 4, 6);

        expect(sixel).toContain('\x1bP'); // DCS start
        expect(sixel).toContain('\x1b\\'); // ST end
        expect(sixel.length).toBeGreaterThan(20);
    });

    it('handles transparency correctly', () => {
        // 2x2 image with transparency
        const rgba = new Uint8Array([
            255, 0, 0, 255,   // Red (opaque)
            0, 0, 0, 0,       // Transparent
            0, 0, 0, 0,       // Transparent
            0, 255, 0, 255,   // Green (opaque)
        ]);

        const { image, palette, transparentIndex } = rgbaToIndexed(rgba, 2, 2);

        expect(transparentIndex).toBeGreaterThanOrEqual(0);
        expect(image[1]).toBe(transparentIndex);
        expect(image[2]).toBe(transparentIndex);
    });

    it('quantizes colors when palette exceeds 256', () => {
        // Create image with many unique colors
        const size = 20;
        const rgba = new Uint8Array(size * size * 4);
        
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const i = (y * size + x) * 4;
                rgba[i] = (x * 13) % 256;
                rgba[i + 1] = (y * 17) % 256;
                rgba[i + 2] = ((x + y) * 7) % 256;
                rgba[i + 3] = 255;
            }
        }

        const { palette } = rgbaToIndexed(rgba, size, size);

        // Should be capped at 256 colors
        expect(palette.length).toBeLessThanOrEqual(256);
    });
});


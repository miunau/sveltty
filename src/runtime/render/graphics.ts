/**
 * Terminal Graphics Protocol Support
 * 
 * Provides unified API for rendering images in terminals using:
 * - Kitty Graphics Protocol (preferred)
 * - Sixel Graphics
 * - iTerm2 Inline Images Protocol
 * 
 * Auto-detects terminal capabilities and uses the best available protocol.
 */

import { encodeRgbaToSixel, rgbaToIndexed, encodeSixelImage } from './sixel.js';
import { deflateSync } from 'zlib';

/** Supported graphics protocols in order of preference. */
export type GraphicsProtocol = 'kitty' | 'iterm2' | 'sixel' | 'none';

/** Detected terminal graphics capabilities. */
export interface GraphicsCapabilities {
    /** Best available protocol. */
    protocol: GraphicsProtocol;
    /** Whether Kitty graphics are supported. */
    kitty: boolean;
    /** Whether iTerm2 inline images are supported. */
    iterm2: boolean;
    /** Whether Sixel graphics are supported. */
    sixel: boolean;
    /** Terminal name if detected. */
    terminal?: string;
}

/** Cached capabilities after detection. */
let cachedCapabilities: GraphicsCapabilities | null = null;

/**
 * Detect terminal graphics capabilities.
 * Uses environment variables and terminal queries for detection.
 * Results are cached for subsequent calls.
 */
export function detectGraphicsCapabilities(): GraphicsCapabilities {
    if (cachedCapabilities) return cachedCapabilities;

    const env = process.env;
    const capabilities: GraphicsCapabilities = {
        protocol: 'none',
        kitty: false,
        iterm2: false,
        sixel: false,
    };

    // Detect Kitty terminal
    if (env.KITTY_WINDOW_ID || env.KITTY_PID) {
        capabilities.kitty = true;
        capabilities.terminal = 'kitty';
    }

    // Detect iTerm2
    if (env.TERM_PROGRAM === 'iTerm.app' || env.LC_TERMINAL === 'iTerm2') {
        capabilities.iterm2 = true;
        capabilities.terminal = 'iterm2';
        // iTerm2 also supports sixel
        capabilities.sixel = true;
    }

    // Detect WezTerm (supports Kitty protocol and sixel)
    if (env.TERM_PROGRAM === 'WezTerm') {
        capabilities.kitty = true;
        capabilities.sixel = true;
        capabilities.terminal = 'wezterm';
    }

    // Detect Konsole (supports Kitty protocol)
    if (env.KONSOLE_VERSION) {
        capabilities.kitty = true;
        capabilities.terminal = 'konsole';
    }

    // Detect foot terminal (supports sixel)
    if (env.TERM === 'foot' || env.TERM === 'foot-extra') {
        capabilities.sixel = true;
        capabilities.terminal = 'foot';
    }

    // Detect mlterm (supports sixel)
    if (env.MLTERM) {
        capabilities.sixel = true;
        capabilities.terminal = 'mlterm';
    }

    // Detect xterm with sixel (check TERM and XTERM_VERSION)
    if (env.XTERM_VERSION && env.TERM?.includes('xterm')) {
        // XTerm may support sixel if compiled with it
        capabilities.sixel = true;
        capabilities.terminal = 'xterm';
    }

    // Determine best protocol
    if (capabilities.kitty) {
        capabilities.protocol = 'kitty';
    } else if (capabilities.iterm2) {
        capabilities.protocol = 'iterm2';
    } else if (capabilities.sixel) {
        capabilities.protocol = 'sixel';
    }

    cachedCapabilities = capabilities;
    return capabilities;
}

/**
 * Reset cached capabilities (useful for testing).
 */
export function resetGraphicsCapabilities(): void {
    cachedCapabilities = null;
}

/**
 * Async detection that queries the terminal for capabilities.
 * More accurate but requires terminal I/O.
 */
export async function detectGraphicsCapabilitiesAsync(
    stdout: NodeJS.WriteStream = process.stdout,
    stdin: NodeJS.ReadStream = process.stdin,
    timeout = 500
): Promise<GraphicsCapabilities> {
    // Start with environment-based detection
    const capabilities = { ...detectGraphicsCapabilities() };

    // If we already detected Kitty, we're done
    if (capabilities.kitty) return capabilities;

    // Try to query terminal for Kitty graphics support
    const kittySupported = await queryKittySupport(stdout, stdin, timeout);
    if (kittySupported) {
        capabilities.kitty = true;
        capabilities.protocol = 'kitty';
    }

    // Try to query for sixel support if not already detected
    if (!capabilities.sixel && !capabilities.kitty) {
        const sixelSupported = await querySixelSupport(stdout, stdin, timeout);
        if (sixelSupported) {
            capabilities.sixel = true;
            if (capabilities.protocol === 'none') {
                capabilities.protocol = 'sixel';
            }
        }
    }

    return capabilities;
}

/**
 * Query terminal for Kitty graphics protocol support.
 */
async function queryKittySupport(
    stdout: NodeJS.WriteStream,
    stdin: NodeJS.ReadStream,
    timeout: number
): Promise<boolean> {
    return new Promise((resolve) => {
        let response = '';
        const timer = setTimeout(() => {
            cleanup();
            resolve(false);
        }, timeout);

        const onData = (data: Buffer) => {
            response += data.toString();
            // Kitty responds to graphics query with _G response
            if (response.includes('_G') || response.includes('\x1b\\')) {
                cleanup();
                resolve(response.includes('OK') || response.includes('_G'));
            }
        };

        const cleanup = () => {
            clearTimeout(timer);
            stdin.off('data', onData);
        };

        stdin.on('data', onData);
        // Send a Kitty graphics query (transmit nothing, just query)
        // ESC_G with query action
        stdout.write('\x1b_Gi=1,a=q;\x1b\\');
    });
}

/**
 * Query terminal for Sixel support via DA1.
 */
async function querySixelSupport(
    stdout: NodeJS.WriteStream,
    stdin: NodeJS.ReadStream,
    timeout: number
): Promise<boolean> {
    return new Promise((resolve) => {
        let response = '';
        const timer = setTimeout(() => {
            cleanup();
            resolve(false);
        }, timeout);

        const onData = (data: Buffer) => {
            response += data.toString();
            if (response.includes('c')) {
                cleanup();
                const match = response.match(/\x1b\[\?([0-9;]+)c/);
                if (match) {
                    const params = match[1].split(';');
                    resolve(params.includes('4'));
                } else {
                    resolve(false);
                }
            }
        };

        const cleanup = () => {
            clearTimeout(timer);
            stdin.off('data', onData);
        };

        stdin.on('data', onData);
        stdout.write('\x1b[c');
    });
}

/** Image data for rendering. */
export interface ImageData {
    /** RGBA pixel data (4 bytes per pixel). */
    data: Uint8Array | Uint8ClampedArray;
    /** Image width in pixels. */
    width: number;
    /** Image height in pixels. */
    height: number;
}

/** Options for rendering an image. */
export interface RenderImageOptions {
    /** Target width in terminal cells (characters). */
    cellWidth?: number;
    /** Target height in terminal cells. */
    cellHeight?: number;
    /** X position in terminal cells (for Kitty). */
    x?: number;
    /** Y position in terminal cells (for Kitty). */
    y?: number;
    /** Z-index for layering (Kitty only). */
    zIndex?: number;
    /** Whether to place image behind text (Kitty only). */
    background?: boolean;
    /** Unique ID for the image (for updates/deletion). */
    id?: number;
    /** Protocol to use (auto-detect if not specified). */
    protocol?: GraphicsProtocol;
}

/**
 * Encode image data using the Kitty Graphics Protocol.
 * @param image - RGBA image data.
 * @param options - Rendering options.
 * @returns Escape sequence string.
 */
export function encodeKittyImage(image: ImageData, options: RenderImageOptions = {}): string {
    const { data, width, height } = image;
    const { cellWidth, cellHeight, x, y, zIndex, background, id } = options;

    // Build control data
    const ctrl: string[] = [];
    
    // Action: transmit and display
    ctrl.push('a=T');
    
    // Format: 32-bit RGBA
    ctrl.push('f=32');
    
    // Image dimensions (source pixels)
    ctrl.push(`s=${width}`);
    ctrl.push(`v=${height}`);

    // Cell dimensions for scaling (how many terminal cells to occupy)
    if (cellWidth !== undefined) ctrl.push(`c=${cellWidth}`);
    if (cellHeight !== undefined) ctrl.push(`r=${cellHeight}`);

    // Position (if specified)
    if (x !== undefined) ctrl.push(`X=${x}`);
    if (y !== undefined) ctrl.push(`Y=${y}`);

    // Z-index for layering
    if (zIndex !== undefined) ctrl.push(`z=${zIndex}`);

    // Image ID for later reference
    if (id !== undefined) ctrl.push(`i=${id}`);

    // Placement: behind text for backgrounds
    if (background) ctrl.push('z=-1');

    // Base64 encode the pixel data
    const base64 = base64Encode(data);

    // Kitty protocol supports chunked transmission for large images
    // Per https://sw.kovidgoyal.net/kitty/graphics-protocol/
    // m=1 means "more data coming", m=0 (default) means "this is the last/only chunk"
    const chunks: string[] = [];
    const chunkSize = 4096; // Max chunk size
    
    for (let i = 0; i < base64.length; i += chunkSize) {
        const chunk = base64.slice(i, i + chunkSize);
        const isLast = i + chunkSize >= base64.length;
        
        if (i === 0) {
            // First chunk includes all control data
            // Add m=1 if there are more chunks coming
            const ctrlStr = isLast ? ctrl.join(',') : ctrl.join(',') + ',m=1';
            chunks.push(`\x1b_G${ctrlStr};${chunk}\x1b\\`);
        } else {
            // Subsequent chunks only need m=1 (if not last) or nothing
            const moreFlag = isLast ? '' : 'm=1';
            chunks.push(`\x1b_G${moreFlag};${chunk}\x1b\\`);
        }
    }

    return chunks.join('');
}

/**
 * Encode image data using the iTerm2 Inline Images Protocol.
 * iTerm2 requires a proper image format (PNG), not raw pixel data.
 * @param image - RGBA image data.
 * @param options - Rendering options.
 * @returns Escape sequence string.
 */
export function encodeIterm2Image(image: ImageData, options: RenderImageOptions = {}): string {
    const { data, width, height } = image;
    const { cellWidth, cellHeight } = options;

    // iTerm2 requires a proper image format, so we encode as PNG
    const pngData = encodeRgbaToPng(data, width, height);
    const base64 = base64Encode(pngData);
    
    // Build the OSC sequence
    // Format: OSC 1337 ; File=<params>:<base64 data> ST
    const params: string[] = [];
    params.push('inline=1');
    params.push(`size=${pngData.length}`);
    
    if (cellWidth !== undefined) params.push(`width=${cellWidth}`);
    if (cellHeight !== undefined) params.push(`height=${cellHeight}`);
    
    return `\x1b]1337;File=${params.join(';')}:${base64}\x07`;
}

/**
 * Encode RGBA data as a minimal PNG.
 * This is a simple PNG encoder for iTerm2 compatibility.
 */
function encodeRgbaToPng(data: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
    // PNG signature
    const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    
    // IHDR chunk
    const ihdr = createPngChunk('IHDR', createIhdrData(width, height));
    
    // IDAT chunk (compressed image data)
    const rawData = createRawImageData(data, width, height);
    const compressed = compressDeflate(rawData);
    const idat = createPngChunk('IDAT', compressed);
    
    // IEND chunk
    const iend = createPngChunk('IEND', new Uint8Array(0));
    
    // Combine all parts
    const totalLength = signature.length + ihdr.length + idat.length + iend.length;
    const png = new Uint8Array(totalLength);
    let offset = 0;
    
    png.set(signature, offset); offset += signature.length;
    png.set(ihdr, offset); offset += ihdr.length;
    png.set(idat, offset); offset += idat.length;
    png.set(iend, offset);
    
    return png;
}

/**
 * Create IHDR data for PNG.
 */
function createIhdrData(width: number, height: number): Uint8Array {
    const data = new Uint8Array(13);
    const view = new DataView(data.buffer);
    
    view.setUint32(0, width, false);   // Width
    view.setUint32(4, height, false);  // Height
    data[8] = 8;   // Bit depth
    data[9] = 6;   // Color type (RGBA)
    data[10] = 0;  // Compression method
    data[11] = 0;  // Filter method
    data[12] = 0;  // Interlace method
    
    return data;
}

/**
 * Create raw image data with filter bytes for PNG.
 */
function createRawImageData(data: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
    const bytesPerRow = width * 4;
    const rawData = new Uint8Array(height * (1 + bytesPerRow));
    
    for (let y = 0; y < height; y++) {
        const rowOffset = y * (1 + bytesPerRow);
        rawData[rowOffset] = 0; // Filter type: None
        
        const srcOffset = y * bytesPerRow;
        for (let x = 0; x < bytesPerRow; x++) {
            rawData[rowOffset + 1 + x] = data[srcOffset + x];
        }
    }
    
    return rawData;
}

/**
 * Create a PNG chunk with CRC.
 */
function createPngChunk(type: string, data: Uint8Array): Uint8Array {
    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    const view = new DataView(chunk.buffer);
    
    // Length
    view.setUint32(0, data.length, false);
    
    // Type
    for (let i = 0; i < 4; i++) {
        chunk[4 + i] = type.charCodeAt(i);
    }
    
    // Data
    chunk.set(data, 8);
    
    // CRC (of type + data)
    const crcData = new Uint8Array(4 + data.length);
    for (let i = 0; i < 4; i++) {
        crcData[i] = type.charCodeAt(i);
    }
    crcData.set(data, 4);
    const crc = crc32(crcData);
    view.setUint32(8 + data.length, crc, false);
    
    return chunk;
}

/**
 * CRC32 for PNG chunks.
 */
function crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Compress data using zlib deflate.
 */
function compressDeflate(data: Uint8Array): Uint8Array {
    return new Uint8Array(deflateSync(Buffer.from(data)));
}

/**
 * Render an image using the best available protocol.
 * @param image - RGBA image data.
 * @param options - Rendering options.
 * @returns Escape sequence string, or empty string if no protocol available.
 */
export function encodeImage(image: ImageData, options: RenderImageOptions = {}): string {
    const protocol = options.protocol || detectGraphicsCapabilities().protocol;

    switch (protocol) {
        case 'kitty':
            return encodeKittyImage(image, options);
        case 'iterm2':
            return encodeIterm2Image(image, options);
        case 'sixel':
            return encodeRgbaToSixel(image.data, image.width, image.height);
        default:
            return '';
    }
}

/**
 * Delete a Kitty image by ID.
 * @param id - Image ID to delete.
 * @param what - What to delete: 'image' (data), 'placement', or 'all'.
 */
export function deleteKittyImage(id: number, what: 'image' | 'placement' | 'all' = 'all'): string {
    const d = what === 'image' ? 'I' : what === 'placement' ? 'p' : 'a';
    return `\x1b_Ga=d,d=${d},i=${id}\x1b\\`;
}

/**
 * Clear all Kitty images from the screen.
 */
export function clearKittyImages(): string {
    return '\x1b_Ga=d,d=A\x1b\\';
}

/**
 * Move cursor to position and render image (for positioned rendering).
 * @param x - Column (1-based).
 * @param y - Row (1-based).
 * @param imageData - Encoded image data.
 */
export function renderImageAt(x: number, y: number, imageData: string): string {
    return `\x1b[${y};${x}H${imageData}`;
}

/**
 * Base64 encode a Uint8Array.
 */
function base64Encode(data: Uint8Array | Uint8ClampedArray): string {
    // Node.js Buffer-based encoding
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(data).toString('base64');
    }
    
    // Browser fallback
    let binary = '';
    for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
}

/**
 * Scale image dimensions to fit within cell bounds while maintaining aspect ratio.
 * @param imageWidth - Original image width in pixels.
 * @param imageHeight - Original image height in pixels.
 * @param maxCellWidth - Maximum width in terminal cells.
 * @param maxCellHeight - Maximum height in terminal cells.
 * @param cellPixelWidth - Pixels per cell width (default: 8).
 * @param cellPixelHeight - Pixels per cell height (default: 16).
 */
export function scaleImageToCells(
    imageWidth: number,
    imageHeight: number,
    maxCellWidth: number,
    maxCellHeight: number,
    cellPixelWidth = 8,
    cellPixelHeight = 16
): { cellWidth: number; cellHeight: number; pixelWidth: number; pixelHeight: number } {
    const maxPixelWidth = maxCellWidth * cellPixelWidth;
    const maxPixelHeight = maxCellHeight * cellPixelHeight;

    const scaleX = maxPixelWidth / imageWidth;
    const scaleY = maxPixelHeight / imageHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Don't upscale

    const pixelWidth = Math.round(imageWidth * scale);
    const pixelHeight = Math.round(imageHeight * scale);

    const cellWidth = Math.ceil(pixelWidth / cellPixelWidth);
    const cellHeight = Math.ceil(pixelHeight / cellPixelHeight);

    return { cellWidth, cellHeight, pixelWidth, pixelHeight };
}

/**
 * Create a simple solid color image for testing.
 * @param width - Image width.
 * @param height - Image height.
 * @param r - Red (0-255).
 * @param g - Green (0-255).
 * @param b - Blue (0-255).
 * @param a - Alpha (0-255).
 */
export function createSolidImage(
    width: number,
    height: number,
    r: number,
    g: number,
    b: number,
    a = 255
): ImageData {
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        data[i * 4] = r;
        data[i * 4 + 1] = g;
        data[i * 4 + 2] = b;
        data[i * 4 + 3] = a;
    }
    return { data, width, height };
}

/**
 * Create a gradient image for testing.
 * @param width - Image width.
 * @param height - Image height.
 * @param horizontal - Horizontal gradient direction.
 */
export function createGradientImage(
    width: number,
    height: number,
    horizontal = true
): ImageData {
    const data = new Uint8Array(width * height * 4);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const t = horizontal ? x / (width - 1) : y / (height - 1);
            
            // Rainbow gradient
            const hue = t * 360;
            const [r, g, b] = hslToRgb(hue, 1, 0.5);
            
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = 255;
        }
    }
    
    return { data, width, height };
}

/**
 * Convert HSL to RGB.
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h = h % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }

    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255),
    ];
}


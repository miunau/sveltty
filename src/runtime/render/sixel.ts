/**
 * Fast sixel encoder for indexed color bitmap terminal graphics.
 * 
 * Sixel is a bitmap graphics format for terminal emulators that encodes
 * images as printable ASCII characters. Each "sixel" represents a column
 * of 6 vertical pixels.
 * 
 * Adapted from https://www.npmjs.com/package/@lib/sixel
 */

/** Lowest bit set in all 4 bytes. */
const LSB_32 = 0x01010101;

/** Highest bit set in all 4 bytes. */
const MSB_32 = 0x80808080;

/** Lowest bit set in both bytes. */
const LSB_16 = 0x0101;

/** Highest bit set in both bytes. */
const MSB_16 = 0x8080;

/** Number of columns in lookahead buffer, maximum 7 to fit rows in bytes. */
const LOOKAHEAD = 7;

/**
 * Pack least significant bit from each byte to bits of a single byte.
 * @param lo - Flag bytes for top 4 pixels.
 * @param hi - Flag bytes for bottom 2 pixels.
 * @returns 6-bit mask with a bit for each input byte.
 */
function packSixelPen(lo: number, hi: number): number {
    hi |= hi >>> (8 - 1);
    lo |= lo >>> (8 - 1);
    lo |= lo >>> (16 - 2);
    return (lo | hi << 4) & 63;
}

/**
 * Encode a number as up to 3 ASCII digits, branchless.
 * @param num - Number to encode, integer between 0-999.
 * @param buffer - Output buffer.
 * @param pos - Target offset in output buffer.
 * @returns Offset one past the last written digit.
 */
function encodeNumber(num: number, buffer: Uint8Array, pos: number): number {
    const hundreds = ~~(num / 100);
    buffer[pos] = 0x30 + hundreds;
    pos += +(hundreds != 0);
    num -= hundreds * 100;

    const tens = ~~(num / 10);
    buffer[pos] = 0x30 + tens;
    pos += +(hundreds + tens != 0);
    num -= tens * 10;

    buffer[pos++] = 0x30 + num;
    return pos;
}

/**
 * Encode a 6-bit bitmap of vertically stacked pixels stretched horizontally
 * to given length, as DEC terminal sixel control codes (printable ASCII).
 * @param sixel - Bitmap as a 6-bit integer.
 * @param runLength - Repetitions (horizontal stretch in pixels).
 * @param buffer - Output buffer.
 * @param pos - Target offset in output buffer.
 * @returns Offset one past the last written character.
 */
export function encodeSixelRun(sixel: number, runLength: number, buffer: Uint8Array, pos: number): number {
    sixel += 0x3f;

    if (runLength > 3) {
        // DECGRI Graphics Repeat Introducer '!'
        buffer[pos++] = 0x21;
        pos = encodeNumber(runLength, buffer, pos);
        buffer[pos++] = sixel;
        return pos;
    }

    // Always write 3 bytes to avoid branching, but advance output
    // pointer to keep only some and overwrite others soon.
    buffer[pos] = sixel;
    buffer[pos + 1] = sixel;
    buffer[pos + 2] = sixel;
    return pos + runLength;
}

/** Clear pending flags for transparent pixels. */
function maskTransparentPixels(
    colBuffer: Uint32Array,
    width: number,
    transparentIndex: number,
    pendingLo: Uint32Array,
    pendingHi: Uint16Array
): void {
    const transparentPen = transparentIndex * LSB_32;
    let pos = 0;

    for (let x = 0; x < width; ++x) {
        const lo = colBuffer[pos++] ^ transparentPen;
        const hi = colBuffer[pos++] ^ transparentPen;
        pendingLo[x] &= ~(MSB_32 - (lo & ~MSB_32)) | lo;
        pendingHi[x] &= ~(MSB_16 - (hi & ~MSB_16)) | hi;
    }
}

interface PassState {
    gotPen: boolean;
    /** Pixels for a row of sixels in column-major order, 6 bytes for 6 pixels and 2 bytes of padding. */
    colBuffer: Uint32Array;
    /** Preallocated buffer for generating a single pass of sixel ASCII control codes. */
    passBuffer: Uint8Array;
    /** Preallocated buffer for byte-sized flags packed to 32 bits in column-major order. */
    pendingLo: Uint32Array;
    /** Preallocated buffer for pixels left to draw in bottom 2 pixel rows. */
    pendingHi: Uint16Array;
    /** Top 4 lookahead rows. */
    aheadLo: number;
    /** Bottom 2 lookahead rows. */
    aheadHi: number;
    /** Palette index of current drawing color repeated in each byte of a 32-bit integer. */
    penColor: number;
    /** Mask with a bit set for any row with missing pixels left after emitting latest pass. */
    pendingRowsMask: number;
    /** Number of identical output characters to write. */
    runLength: number;
    /** Latest sixel waiting to be written. */
    lastSixel: number;
}

function encodeSixelPass(outPos: number, x: number, width: number, state: PassState): number {
    let { colBuffer, passBuffer, pendingLo, pendingHi, aheadLo, aheadHi, penColor, pendingRowsMask, runLength, lastSixel } = state;
    let pos = x * 2;

    for (; x < width; ++x) {
        let maskLo = pendingLo[x];
        let maskHi = pendingHi[x];
        const pending = packSixelPen(maskLo >>> 7, maskHi >>> 7);

        if (pending && !state.gotPen) {
            state.gotPen = true;
            outPos = encodeSixelRun(lastSixel, runLength, passBuffer, outPos);
            runLength = 0;

            let lo = colBuffer[pos];
            let hi = colBuffer[pos + 1];
            let mask = maskLo;

            mask = mask & -mask;
            penColor = lo / ((mask >>> 7) || 0xffffffff) & 255;

            mask = maskHi & -!mask;
            mask = mask & -mask;
            penColor += hi / ((mask >>> 7) || 0xffffffff) & 255;

            passBuffer[outPos++] = 0x23;
            outPos = encodeNumber(penColor, passBuffer, outPos);
            penColor *= LSB_32;

            lo ^= penColor;
            hi ^= penColor;

            aheadLo = (MSB_32 - (lo & ~MSB_32)) & ~lo & maskLo;
            aheadHi = (MSB_16 - (hi & ~MSB_16)) & ~hi & maskHi;

            let p = pos;
            for (let i = 1; i <= LOOKAHEAD; ++i) {
                p += 2;
                lo = colBuffer[p] ^ penColor;
                hi = colBuffer[p + 1] ^ penColor;
                aheadLo = (aheadLo >>> 1) | ((MSB_32 - (lo & ~MSB_32)) & ~lo & pendingLo[x + i]);
                aheadHi = (aheadHi >>> 1) | ((MSB_16 - (hi & ~MSB_16)) & ~hi & pendingHi[x + i]);
            }
        } else {
            const lo = colBuffer[pos + LOOKAHEAD * 2] ^ penColor;
            const hi = colBuffer[pos + LOOKAHEAD * 2 + 1] ^ penColor;
            aheadLo = ((aheadLo >>> 1) & ~MSB_32) | ((MSB_32 - (lo & ~MSB_32)) & ~lo & pendingLo[x + LOOKAHEAD]);
            aheadHi = ((aheadHi >>> 1) & ~MSB_32) | ((MSB_16 - (hi & ~MSB_16)) & ~hi & pendingHi[x + LOOKAHEAD]);
        }

        maskLo &= ~(aheadLo << LOOKAHEAD);
        maskHi &= ~(aheadHi << LOOKAHEAD);
        pendingLo[x] = maskLo;
        pendingHi[x] = maskHi;
        pendingRowsMask |= maskLo | maskHi;

        let sixel = packSixelPen(
            (aheadLo >>> (7 - LOOKAHEAD)) & LSB_32,
            (aheadHi >>> (7 - LOOKAHEAD)) & LSB_16
        );

        if ((lastSixel & sixel) != sixel || (lastSixel & ~pending) || runLength >= 255) {
            outPos = encodeSixelRun(lastSixel, runLength, passBuffer, outPos);
            runLength = 0;
            lastSixel = sixel;
        }

        ++runLength;
        pos += 2;
    }

    state.aheadLo = aheadLo;
    state.aheadHi = aheadHi;
    state.penColor = penColor;
    state.pendingRowsMask = pendingRowsMask;
    state.runLength = runLength;
    state.lastSixel = lastSixel;

    return outPos;
}

/**
 * Encode a row 6 pixels tall as DEC terminal sixels.
 */
function encodeSixelRow(
    width: number,
    height: number,
    row: number,
    rows: number,
    transparentIndex: number,
    state: PassState,
    write: (chunk: Uint8Array) => void
): void {
    const { colBuffer, passBuffer, pendingLo, pendingHi } = state;

    state.aheadLo = 0;
    state.aheadHi = 0;
    state.penColor = 0;

    pendingLo.fill(height < 4 ? ((1 << (height * 8)) - 1) & MSB_32 : MSB_32);
    pendingHi.fill(height > 4 ? ((1 << ((height - 4) * 8)) - 1) & MSB_16 : 0);

    if (transparentIndex >= 0) {
        maskTransparentPixels(colBuffer, width, transparentIndex, pendingLo, pendingHi);
    }

    let pass = 0;

    while (1) {
        let outPos = 0;
        state.pendingRowsMask = 0;
        state.runLength = 0;
        state.lastSixel = 0;
        state.gotPen = false;

        passBuffer[outPos++] = 0x0a;

        if (pass) {
            passBuffer[outPos++] = 0x24;
        } else if (row) {
            passBuffer[outPos++] = 0x2d;
        }

        let beforeWrap = 0;
        if (width > LOOKAHEAD) {
            beforeWrap = width - LOOKAHEAD;
            outPos = encodeSixelPass(outPos, 0, beforeWrap, state);
        }

        for (let i = 0; i < LOOKAHEAD; ++i) {
            pendingLo[width + i] = pendingLo[i];
            pendingHi[width + i] = pendingHi[i];
        }

        outPos = encodeSixelPass(outPos, beforeWrap, width, state);

        if (state.runLength && (state.lastSixel || (!row && !pass))) {
            outPos = encodeSixelRun(state.lastSixel, state.runLength, passBuffer, outPos);
        }

        if (!state.pendingRowsMask && row == rows - 1) {
            passBuffer[outPos++] = 0x1b;
            passBuffer[outPos++] = 0x5c;
        }

        write(passBuffer.slice(0, outPos));
        ++pass;

        if (!state.pendingRowsMask) break;
    }
}

/**
 * Transpose 6 rows of 256-color indexed image data into column-major order.
 */
function sixelTranspose(
    view: DataView,
    width: number,
    height: number,
    stride: number,
    offset: number,
    out: Uint32Array
): void {
    let pos = offset;
    let end = pos + width;
    let q = 0;

    if (width >= 4 && height == 6) {
        let mask = 0;
        end -= 3;

        while (pos < end) {
            let p = pos;
            const w0 = view.getUint32(p, true); p += stride;
            const w1 = view.getUint32(p, true); p += stride;
            const w2 = view.getUint32(p, true); p += stride;
            const w3 = view.getUint32(p, true); p += stride;
            const w4 = view.getUint32(p, true); p += stride;
            const w5 = view.getUint32(p, true);

            mask = 0x000000ff;
            out[q++] = (w0 & mask) | ((w1 & mask) << 8) | ((w2 & mask) << 16) | (w3 << 24);
            out[q++] = (w4 & mask) | ((w5 & mask) << 8);

            mask = 0x0000ff00;
            out[q++] = ((w0 & mask) >>> 8) | (w1 & mask) | ((w2 & mask) << 8) | ((w3 & mask) << 16);
            out[q++] = ((w4 & mask) >>> 8) | (w5 & mask);

            mask = 0x00ff0000;
            out[q++] = ((w0 & mask) >>> 16) | ((w1 & mask) >>> 8) | (w2 & mask) | ((w3 & mask) << 8);
            out[q++] = ((w4 & mask) >>> 16) | ((w5 & mask) >>> 8);

            mask = 0xff000000;
            out[q++] = (w0 >>> 24) | ((w1 & mask) >>> 16) | ((w2 & mask) >>> 8) | (w3 & mask);
            out[q++] = (w4 >>> 24) | ((w5 & mask) >>> 16);

            pos += 4;
        }
        end += 3;
    }

    const chunkSize = stride * (height - 1);

    for (; pos < end; ++pos) {
        let p = pos + chunkSize;
        let n = 0;
        while (p >= pos) {
            n = n * 256 + view.getUint8(p);
            p -= stride;
        }
        out[q++] = n >>> 0;
        out[q++] = (n / 0x100000000) >>> 0;
    }
}

/**
 * Encode the sixel header with palette definition.
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @param palette - RGB palette, each color as [r, g, b] with values 0-1.
 * @param write - Callback to write output bytes.
 */
export function encodeSixelHeader(
    width: number,
    height: number,
    palette: [number, number, number][],
    write: (chunk: Uint8Array) => void
): void {
    const ps = '\x1bP0;1;q"1;1;';
    const buffer = new Uint8Array(ps.length + 11 + palette.length * 18);
    let pos = new TextEncoder().encodeInto(ps + width + ';' + height, buffer).written;

    for (let num = 0; num < palette.length; ++num) {
        buffer[pos++] = 0x23;
        pos = encodeNumber(num, buffer, pos);
        buffer[pos++] = 0x3b;
        buffer[pos++] = 0x32;

        for (let i = 0; i < 3; ++i) {
            buffer[pos++] = 0x3b;
            pos = encodeNumber(~~(palette[num][i] * 100 + 0.5), buffer, pos);
        }
    }

    write(buffer.slice(0, pos));
}

/** Configuration for generating a Sixel image. */
export interface SixelImageConfig {
    /** Contiguous image buffer, one byte per pixel (palette indices). */
    image: Uint8Array;
    /** Image width in pixels, unsigned 16-bit integer. */
    width: number;
    /** Image height in pixels, unsigned 16-bit integer. */
    height: number;
    /** RGB values 0-1 for every palette index used in image data. */
    palette: [number, number, number][];
    /** Callback to write a chunk of output bytes. */
    write: (chunk: Uint8Array) => void;
    /** Palette index of transparent color (default: no transparency). */
    transparentIndex?: number;
    /** Distance in memory between vertically adjacent pixels (default: image width). */
    stride?: number;
    /** Byte offset to start of image data (default: 0). */
    offset?: number;
}

/**
 * Encode an indexed 256-color image stored as one-byte pixels,
 * into a string of DEC terminal control codes to render it using sixels.
 * @param config - Configuration object.
 */
export function encodeSixelImage(config: SixelImageConfig): void {
    const width = (config.width & 0xffff) || 1;
    const height = (config.height & 0xffff) || 1;
    const image = config.image;
    const write = config.write;
    const stride = config.stride || width;
    let transparentIndex = config.transparentIndex;
    let offset = config.offset || 0;

    transparentIndex = transparentIndex === 0 || transparentIndex! > 0 ? transparentIndex! & 0xff : -1;

    encodeSixelHeader(width, height, config.palette, write);

    const imageView = new DataView(image.buffer, image.byteOffset);
    const rows = ~~((height + 5) / 6);
    const chunkSize = stride * 6;

    const state = {
        colBuffer: new Uint32Array((width + LOOKAHEAD) * 2),
        passBuffer: new Uint8Array(width * 5 + 5),
        pendingLo: new Uint32Array(width + LOOKAHEAD),
        pendingHi: new Uint16Array(width + LOOKAHEAD),
    } as PassState;

    const { colBuffer } = state;

    for (let row = 0; row < rows; ++row) {
        let rowHeight = height - row * 6;
        if (rowHeight > 6) rowHeight = 6;

        sixelTranspose(imageView, width, rowHeight, stride, offset, colBuffer);

        let src = 0;
        let dst = width * 2;
        while (src < LOOKAHEAD * 2) colBuffer[dst++] = colBuffer[src++];

        encodeSixelRow(width, rowHeight, row, rows, transparentIndex, state, write);
        offset += chunkSize;
    }
}

/**
 * Convert RGBA image data to indexed palette format for sixel encoding.
 * Uses simple color quantization to 256 colors.
 * @param rgba - RGBA pixel data (4 bytes per pixel).
 * @param width - Image width.
 * @param height - Image height.
 * @returns Object with indexed image and palette.
 */
export function rgbaToIndexed(
    rgba: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number
): { image: Uint8Array; palette: [number, number, number][]; transparentIndex: number } {
    const colorMap = new Map<number, number>();
    const palette: [number, number, number][] = [];
    const image = new Uint8Array(width * height);
    let transparentIndex = -1;

    for (let i = 0; i < width * height; i++) {
        const r = rgba[i * 4];
        const g = rgba[i * 4 + 1];
        const b = rgba[i * 4 + 2];
        const a = rgba[i * 4 + 3];

        // Handle transparency
        if (a < 128) {
            if (transparentIndex === -1) {
                transparentIndex = palette.length;
                palette.push([0, 0, 0]);
                colorMap.set(0xff000000, transparentIndex);
            }
            image[i] = transparentIndex;
            continue;
        }

        // Quantize to 6-bit per channel (64 levels) for better palette fit
        const qr = (r >> 2) & 0x3f;
        const qg = (g >> 2) & 0x3f;
        const qb = (b >> 2) & 0x3f;
        const key = (qr << 12) | (qg << 6) | qb;

        let index = colorMap.get(key);
        if (index === undefined) {
            if (palette.length >= 256) {
                // Find closest existing color
                let minDist = Infinity;
                let closest = 0;
                for (let j = 0; j < palette.length; j++) {
                    const pr = palette[j][0] * 255;
                    const pg = palette[j][1] * 255;
                    const pb = palette[j][2] * 255;
                    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
                    if (dist < minDist) {
                        minDist = dist;
                        closest = j;
                    }
                }
                index = closest;
            } else {
                index = palette.length;
                palette.push([r / 255, g / 255, b / 255]);
                colorMap.set(key, index);
            }
        }

        image[i] = index;
    }

    return { image, palette, transparentIndex };
}

/**
 * Encode RGBA image data directly to sixel format.
 * @param rgba - RGBA pixel data (4 bytes per pixel).
 * @param width - Image width.
 * @param height - Image height.
 * @returns Sixel-encoded string.
 */
export function encodeRgbaToSixel(
    rgba: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number
): string {
    const { image, palette, transparentIndex } = rgbaToIndexed(rgba, width, height);
    const chunks: Uint8Array[] = [];

    encodeSixelImage({
        image,
        width,
        height,
        palette,
        transparentIndex: transparentIndex >= 0 ? transparentIndex : undefined,
        write: (chunk) => chunks.push(chunk.slice()),
    });

    const decoder = new TextDecoder('latin1');
    return chunks.map(c => decoder.decode(c)).join('');
}

/**
 * Check if the terminal supports sixel graphics.
 * Sends DA1 (Primary Device Attributes) query and checks response.
 * @param stdout - Output stream.
 * @param stdin - Input stream.
 * @param timeout - Timeout in milliseconds (default: 1000).
 * @returns Promise resolving to true if sixel is supported.
 */
export async function detectSixelSupport(
    stdout: NodeJS.WriteStream,
    stdin: NodeJS.ReadStream,
    timeout = 1000
): Promise<boolean> {
    return new Promise((resolve) => {
        let response = '';
        const timer = setTimeout(() => {
            cleanup();
            resolve(false);
        }, timeout);

        const onData = (data: Buffer) => {
            response += data.toString();
            // DA1 response format: ESC [ ? Ps ; Ps ; ... c
            // Sixel support is indicated by "4" in the parameters
            if (response.includes('c')) {
                cleanup();
                // Check for "4" which indicates sixel support
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
        // Send DA1 query
        stdout.write('\x1b[c');
    });
}


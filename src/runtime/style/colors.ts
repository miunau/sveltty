/**
 * ANSI escape codes for terminal styling.
 * We use 24-bit color codes for all colors to ensure consistency across terminals.
 */
export const ANSI = {
    // Reset and text attributes
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m',
    DIM: '\x1b[2m',
    ITALIC: '\x1b[3m',
    UNDERLINE: '\x1b[4m',
    INVERSE: '\x1b[7m',
    STRIKETHROUGH: '\x1b[9m',
    
    // Color resets (to terminal default)
    FG_DEFAULT: '\x1b[39m',
    BG_DEFAULT: '\x1b[49m',
    
    // Cursor and screen control
    HIDE_CURSOR: '\x1b[?25l',
    SHOW_CURSOR: '\x1b[?25h',
    MOVE_TO: (x: number, y: number) => `\x1b[${y + 1};${x + 1}H`,
    CLEAR_SCREEN: '\x1b[2J',
    CLEAR_LINE: '\x1b[2K',
} as const;

/**
 * RGB values for CSS named colors
 */
export const NAMED_COLORS_RGB: Record<string, { r: number; g: number; b: number }> = {
    black: { r: 0, g: 0, b: 0 },
    white: { r: 255, g: 255, b: 255 },
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 128, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    yellow: { r: 255, g: 255, b: 0 },
    cyan: { r: 0, g: 255, b: 255 },
    magenta: { r: 255, g: 0, b: 255 },
    gray: { r: 128, g: 128, b: 128 },
    grey: { r: 128, g: 128, b: 128 },
    orange: { r: 255, g: 165, b: 0 },
    purple: { r: 128, g: 0, b: 128 },
    pink: { r: 255, g: 192, b: 203 },
    brown: { r: 165, g: 42, b: 42 },
    lime: { r: 0, g: 255, b: 0 },
    navy: { r: 0, g: 0, b: 128 },
    teal: { r: 0, g: 128, b: 128 },
    olive: { r: 128, g: 128, b: 0 },
    maroon: { r: 128, g: 0, b: 0 },
    aqua: { r: 0, g: 255, b: 255 },
    fuchsia: { r: 255, g: 0, b: 255 },
    silver: { r: 192, g: 192, b: 192 },
    gold: { r: 255, g: 215, b: 0 },
    coral: { r: 255, g: 127, b: 80 },
    salmon: { r: 250, g: 128, b: 114 },
    tomato: { r: 255, g: 99, b: 71 },
    crimson: { r: 220, g: 20, b: 60 },
    indigo: { r: 75, g: 0, b: 130 },
    violet: { r: 238, g: 130, b: 238 },
    turquoise: { r: 64, g: 224, b: 208 },
    skyblue: { r: 135, g: 206, b: 235 },
    steelblue: { r: 70, g: 130, b: 180 },
    slategray: { r: 112, g: 128, b: 144 },
    slategrey: { r: 112, g: 128, b: 144 },
    darkgray: { r: 169, g: 169, b: 169 },
    darkgrey: { r: 169, g: 169, b: 169 },
    lightgray: { r: 211, g: 211, b: 211 },
    lightgrey: { r: 211, g: 211, b: 211 },
    dimgray: { r: 105, g: 105, b: 105 },
    dimgrey: { r: 105, g: 105, b: 105 },
    darkblue: { r: 0, g: 0, b: 139 },
    darkgreen: { r: 0, g: 100, b: 0 },
    darkred: { r: 139, g: 0, b: 0 },
    darkcyan: { r: 0, g: 139, b: 139 },
    darkmagenta: { r: 139, g: 0, b: 139 },
    darkorange: { r: 255, g: 140, b: 0 },
    darkviolet: { r: 148, g: 0, b: 211 },
    deeppink: { r: 255, g: 20, b: 147 },
    deepskyblue: { r: 0, g: 191, b: 255 },
    dodgerblue: { r: 30, g: 144, b: 255 },
    firebrick: { r: 178, g: 34, b: 34 },
    forestgreen: { r: 34, g: 139, b: 34 },
    hotpink: { r: 255, g: 105, b: 180 },
    lawngreen: { r: 124, g: 252, b: 0 },
    lightblue: { r: 173, g: 216, b: 230 },
    lightcoral: { r: 240, g: 128, b: 128 },
    lightgreen: { r: 144, g: 238, b: 144 },
    lightpink: { r: 255, g: 182, b: 193 },
    lightsalmon: { r: 255, g: 160, b: 122 },
    lightseagreen: { r: 32, g: 178, b: 170 },
    lightskyblue: { r: 135, g: 206, b: 250 },
    mediumaquamarine: { r: 102, g: 205, b: 170 },
    mediumblue: { r: 0, g: 0, b: 205 },
    mediumorchid: { r: 186, g: 85, b: 211 },
    mediumpurple: { r: 147, g: 112, b: 219 },
    mediumseagreen: { r: 60, g: 179, b: 113 },
    mediumslateblue: { r: 123, g: 104, b: 238 },
    mediumspringgreen: { r: 0, g: 250, b: 154 },
    mediumturquoise: { r: 72, g: 209, b: 204 },
    mediumvioletred: { r: 199, g: 21, b: 133 },
    midnightblue: { r: 25, g: 25, b: 112 },
    orangered: { r: 255, g: 69, b: 0 },
    orchid: { r: 218, g: 112, b: 214 },
    palegreen: { r: 152, g: 251, b: 152 },
    paleturquoise: { r: 175, g: 238, b: 238 },
    palevioletred: { r: 219, g: 112, b: 147 },
    plum: { r: 221, g: 160, b: 221 },
    powderblue: { r: 176, g: 224, b: 230 },
    rebeccapurple: { r: 102, g: 51, b: 153 },
    rosybrown: { r: 188, g: 143, b: 143 },
    royalblue: { r: 65, g: 105, b: 225 },
    saddlebrown: { r: 139, g: 69, b: 19 },
    seagreen: { r: 46, g: 139, b: 87 },
    sienna: { r: 160, g: 82, b: 45 },
    springgreen: { r: 0, g: 255, b: 127 },
    tan: { r: 210, g: 180, b: 140 },
    thistle: { r: 216, g: 191, b: 216 },
    wheat: { r: 245, g: 222, b: 179 },
    yellowgreen: { r: 154, g: 205, b: 50 },
    
    // CSS System Colors (https://developer.mozilla.org/en-US/docs/Web/CSS/system-color)
    // Mapped to terminal-appropriate defaults
    
    // UI element backgrounds
    canvas: { r: 0, g: 0, b: 0 },              // Application background (terminal default)
    canvastext: { r: 255, g: 255, b: 255 },    // Text on canvas
    
    // Form field colors
    field: { r: 26, g: 26, b: 46 },            // Input field background (#1a1a2e)
    fieldtext: { r: 255, g: 255, b: 255 },     // Text in input fields
    
    // Button colors
    buttonface: { r: 26, g: 26, b: 46 },       // Button background (#1a1a2e)
    buttontext: { r: 255, g: 255, b: 255 },    // Button text
    buttonborder: { r: 85, g: 85, b: 85 },     // Button/control border (#555555)
    
    // Selection/highlight colors
    highlight: { r: 0, g: 102, b: 204 },       // Selected item background (#0066cc)
    highlighttext: { r: 255, g: 255, b: 255 }, // Selected item text
    selecteditem: { r: 0, g: 102, b: 204 },    // Selected item (same as highlight)
    selecteditemtext: { r: 255, g: 255, b: 255 },
    
    // Accent colors (focus ring, active controls)
    accentcolor: { r: 0, g: 102, b: 204 },     // Accent/focus color (#0066cc)
    accentcolortext: { r: 255, g: 255, b: 255 },
    
    // Link colors
    linktext: { r: 0, g: 102, b: 204 },        // Unvisited link
    visitedtext: { r: 128, g: 0, b: 128 },     // Visited link (purple)
    activetext: { r: 255, g: 0, b: 0 },        // Active link
    
    // Disabled/gray text
    graytext: { r: 128, g: 128, b: 128 },      // Disabled text
    
    // Mark (highlight) colors
    mark: { r: 255, g: 255, b: 0 },            // Highlighted text background (yellow)
    marktext: { r: 0, g: 0, b: 0 },            // Highlighted text
};

/**
 * Parse a hex color string to RGB values
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const normalized = hex.replace('#', '').trim();
    if (normalized.length === 3) {
        const [r, g, b] = normalized.split('');
        return {
            r: parseInt(r + r, 16),
            g: parseInt(g + g, 16),
            b: parseInt(b + b, 16),
        };
    }
    if (normalized.length === 6) {
        return {
            r: parseInt(normalized.slice(0, 2), 16),
            g: parseInt(normalized.slice(2, 4), 16),
            b: parseInt(normalized.slice(4, 6), 16),
        };
    }
    return null;
}

/**
 * Parse an rgb() or rgba() function string to RGB values
 */
export function parseRgbString(value: string): { r: number; g: number; b: number } | null {
    const match = value.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!match) return null;
    return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
    };
}

/**
 * Parse any CSS color string to RGB values
 */
export function parseColorToRgb(color: string): { r: number; g: number; b: number } | null {
    const trimmed = color.trim().toLowerCase();
    
    // Hex color
    if (trimmed.startsWith('#')) {
        return hexToRgb(trimmed);
    }
    
    // RGB/RGBA function
    if (trimmed.startsWith('rgb')) {
        return parseRgbString(trimmed);
    }
    
    // Named colors
    if (NAMED_COLORS_RGB[trimmed]) {
        return NAMED_COLORS_RGB[trimmed];
    }
    
    return null;
}

/**
 * Interpolate between two RGB colors
 * @param color1 - Start color
 * @param color2 - End color
 * @param t - Interpolation factor (0-1), clamped internally
 */
export function interpolateColor(
    color1: { r: number; g: number; b: number },
    color2: { r: number; g: number; b: number },
    t: number
): { r: number; g: number; b: number } {
    const ct = t < 0 ? 0 : t > 1 ? 1 : t;
    return {
        r: Math.round(color1.r + (color2.r - color1.r) * ct),
        g: Math.round(color1.g + (color2.g - color1.g) * ct),
        b: Math.round(color1.b + (color2.b - color1.b) * ct),
    };
}

/**
 * Convert RGB values to a CSS rgb() string
 */
export function rgbToString(rgb: { r: number; g: number; b: number }): string {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

/**
 * Generate a 24-bit ANSI color code
 */
function ansi24Bit(r: number, g: number, b: number, background: boolean): string {
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    return `\x1b[${background ? 48 : 38};2;${clamp(r)};${clamp(g)};${clamp(b)}m`;
}

export function resolveAnsiColor(value: string, background = false): string | undefined {
    const normalized = value.trim().toLowerCase();
    
    // Always prefer 24-bit color for consistency across terminals
    // Check named colors first and convert to 24-bit
    if (NAMED_COLORS_RGB[normalized]) {
        const rgb = NAMED_COLORS_RGB[normalized];
        return ansi24Bit(rgb.r, rgb.g, rgb.b, background);
    }
    
    if (normalized.startsWith('#')) {
        const rgb = hexToRgb(normalized);
        if (rgb) {
            return ansi24Bit(rgb.r, rgb.g, rgb.b, background);
        }
    }
    if (normalized.startsWith('rgb')) {
        const rgb = parseRgbString(normalized);
        if (rgb) {
            return ansi24Bit(rgb.r, rgb.g, rgb.b, background);
        }
    }
    return undefined;
}

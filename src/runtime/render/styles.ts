import type { TextStyle } from '../types.js';
import { ANSI, resolveAnsiColor } from '../style/colors.js';

export function getStyleCodes(style: TextStyle, prevStyle?: TextStyle): string {
    // Only reset if we need to REMOVE a text decoration attribute
    // (e.g., turning off bold). Color changes don't require reset -
    // we can just emit the new color code.
    const needsReset = prevStyle && (
        (prevStyle.bold && !style.bold) ||
        (prevStyle.dim && !style.dim) ||
        (prevStyle.italic && !style.italic) ||
        (prevStyle.underline && !style.underline) ||
        (prevStyle.strikethrough && !style.strikethrough) ||
        (prevStyle.inverse && !style.inverse)
    );
    
    let result = needsReset ? ANSI.RESET : '';

    // After reset, or if these are newly set, emit text decoration codes
    if (needsReset || !prevStyle) {
        if (style.bold) result += ANSI.BOLD;
        if (style.dim) result += ANSI.DIM;
        if (style.italic) result += ANSI.ITALIC;
        if (style.underline) result += ANSI.UNDERLINE;
        if (style.strikethrough) result += ANSI.STRIKETHROUGH;
        if (style.inverse) result += ANSI.INVERSE;
    } else {
        // Only emit decorations that changed from off to on
        if (style.bold && !prevStyle.bold) result += ANSI.BOLD;
        if (style.dim && !prevStyle.dim) result += ANSI.DIM;
        if (style.italic && !prevStyle.italic) result += ANSI.ITALIC;
        if (style.underline && !prevStyle.underline) result += ANSI.UNDERLINE;
        if (style.strikethrough && !prevStyle.strikethrough) result += ANSI.STRIKETHROUGH;
        if (style.inverse && !prevStyle.inverse) result += ANSI.INVERSE;
    }

    // Colors can be changed without reset - just emit the new code
    // Only emit if color changed or after a reset
    const fgChanged = !prevStyle || needsReset || prevStyle.color !== style.color;
    if (fgChanged) {
        if (style.color) {
            const colorCode = resolveAnsiColor(style.color, false);
            if (colorCode) {
                result += colorCode;
            }
        } else if (prevStyle?.color && !needsReset) {
            // Previous style had a color, new style doesn't - reset foreground to default
            result += ANSI.FG_DEFAULT;
        }
    }

    const bgChanged = !prevStyle || needsReset || prevStyle.backgroundColor !== style.backgroundColor;
    if (bgChanged) {
        if (style.backgroundColor) {
            const bgColorCode = resolveAnsiColor(style.backgroundColor, true);
            if (bgColorCode) {
                result += bgColorCode;
            }
        } else if (prevStyle?.backgroundColor && !needsReset) {
            // Previous style had a background, new style doesn't - reset background to default
            result += ANSI.BG_DEFAULT;
        }
    }

    return result;
}

export function stylesEqual(a: TextStyle | undefined, b: TextStyle | undefined): boolean {
    if (a === undefined && b === undefined) return true;
    if (a === undefined || b === undefined) return false;

    return (
        a.bold === b.bold &&
        a.dim === b.dim &&
        a.italic === b.italic &&
        a.underline === b.underline &&
        a.strikethrough === b.strikethrough &&
        a.inverse === b.inverse &&
        a.color === b.color &&
        a.backgroundColor === b.backgroundColor
    );
}

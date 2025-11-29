import type { CliNode, Style } from '../types.js';
import { getDomNode, getDomElement } from '../dom/happy.js';
import { computeStylesheetStyle } from './stylesheet.js';

const DECORATION_PROPS = ['underline', 'strikethrough'] as const;
const STYLE_KEYS: (keyof Style)[] = [
    'color',
    'backgroundColor',
    'borderColor',
    'borderBg',
    'borderBackgroundColor',
    'borderTopBackgroundColor',
    'borderRightBackgroundColor',
    'borderBottomBackgroundColor',
    'borderLeftBackgroundColor',
    'borderTopLeftBackgroundColor',
    'borderTopRightBackgroundColor',
    'borderBottomLeftBackgroundColor',
    'borderBottomRightBackgroundColor',
    'borderStyle',
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'dim',
    'inverse',
    'textAlign',
    'whiteSpace',
    'wordBreak',
    'overflowWrap',
    'textWrap',
    'overflow',
    'overflowX',
    'overflowY',
    'scrollBehavior',
];

function getInlineStyle(node: CliNode): CSSStyleDeclaration | null {
    const element = getDomElement(node);
    if (element?.style) {
        return element.style;
    }
    // Check parent as fallback
    const parent = getDomNode(node)?.parentNode as HTMLElement | null;
    if (parent?.style) {
        return parent.style;
    }
    return null;
}

function coerceBool(value: boolean | undefined, fallback?: boolean): boolean | undefined {
    if (value === undefined) return fallback;
    return value;
}

function parseBold(fontWeight?: string): boolean | undefined {
    if (!fontWeight) return undefined;
    const normalized = fontWeight.trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'bold' || normalized === 'bolder') return true;
    const numeric = Number(normalized);
    if (!Number.isNaN(numeric)) {
        return numeric >= 600;
    }
    if (normalized === 'normal' || normalized === 'lighter') return false;
    return undefined;
}

function parseItalic(fontStyle?: string): boolean | undefined {
    if (!fontStyle) return undefined;
    const normalized = fontStyle.trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'italic' || normalized === 'oblique') return true;
    if (normalized === 'normal') return false;
    return undefined;
}

function parseDecorations(textDecoration?: string): Partial<Style> {
    const result: Partial<Style> = {};
    if (!textDecoration) return result;
    const normalized = textDecoration.toLowerCase();
    if (normalized.includes('underline')) result.underline = true;
    if (normalized.includes('line-through')) result.strikethrough = true;
    if (normalized.includes('none')) {
        for (const prop of DECORATION_PROPS) {
            result[prop] = false;
        }
    }
    return result;
}

function parseTextAlign(textAlign?: string): Style['textAlign'] | undefined {
    if (!textAlign) return undefined;
    const normalized = textAlign.trim().toLowerCase();
    if (normalized === 'left' || normalized === 'center' || normalized === 'right') {
        return normalized;
    }
    if (normalized === 'start') return 'left';
    if (normalized === 'end') return 'right';
    return undefined;
}

function normalizeColor(value?: string): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'inherit' || trimmed === 'initial') return undefined;
    return trimmed;
}

function mergeLocalStyles(target: Style, source?: Style): void {
    if (!source) return;
    for (const key of STYLE_KEYS) {
        const value = source[key];
        if (value !== undefined && value !== null) {
            (target as Record<string, any>)[key as string] = value;
        }
    }
}

export function getComputedCliStyle(node: CliNode, fallback?: Partial<Style>): Style {
    const style: Style = { ...(fallback ?? {}) } as Style;
    const stylesheetStyle = computeStylesheetStyle(node);
    mergeLocalStyles(style, stylesheetStyle as Style);
    const inline = getInlineStyle(node);
    const local = (node.style as Style | undefined) ?? {};

    mergeLocalStyles(style, local);

    if (inline) {
        const color = normalizeColor(inline.color);
        if (color) {
            style.color = color;
        }
        const background = normalizeColor(inline.backgroundColor);
        if (background) {
            style.backgroundColor = background;
        }
        const borderColor = normalizeColor(inline.borderColor);
        if (borderColor) {
            style.borderColor = borderColor;
        }
        const bold = parseBold(inline.fontWeight);
        if (bold !== undefined) {
            style.bold = bold;
        }
        const italic = parseItalic(inline.fontStyle);
        if (italic !== undefined) {
            style.italic = italic;
        }
        const decorations = parseDecorations(inline.textDecoration || inline.textDecorationLine);
        for (const key of DECORATION_PROPS) {
            const val = decorations[key];
            if (val !== undefined) {
                (style as Record<string, any>)[key] = val;
            } else {
                (style as Record<string, any>)[key] = coerceBool(style[key], undefined);
            }
        }
        const textAlign = parseTextAlign(inline.textAlign);
        if (textAlign) {
            style.textAlign = textAlign;
        }
    }

    return style;
}

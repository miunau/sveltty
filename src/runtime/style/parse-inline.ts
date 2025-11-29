import type { Style } from '../types.js';

const STYLE_MAP: Record<string, keyof Style> = {
    'width': 'width',
    'height': 'height',
    'min-width': 'minWidth',
    'min-height': 'minHeight',
    'max-width': 'maxWidth',
    'max-height': 'maxHeight',
    'padding': 'padding',
    'padding-top': 'paddingTop',
    'padding-right': 'paddingRight',
    'padding-bottom': 'paddingBottom',
    'padding-left': 'paddingLeft',
    'margin': 'margin',
    'margin-top': 'marginTop',
    'margin-right': 'marginRight',
    'margin-bottom': 'marginBottom',
    'margin-left': 'marginLeft',
    'flex-direction': 'flexDirection',
    'flex-grow': 'flexGrow',
    'flex-shrink': 'flexShrink',
    'flex-basis': 'flexBasis',
    'justify-content': 'justifyContent',
    'align-items': 'alignItems',
    'align-self': 'alignSelf',
    'display': 'display',
    'gap': 'gap',
    'row-gap': 'rowGap',
    'column-gap': 'columnGap',
    'color': 'color',
    'background': 'backgroundColor',
    'background-color': 'backgroundColor',
    'border-style': 'borderStyle',
    'border-color': 'borderColor',
    'border-background': 'borderBg',
    'font-weight': 'bold',
    'font-style': 'italic',
    'text-decoration': 'underline',
};

function parseValue(value: string): unknown {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    if (trimmed.endsWith('%')) {
        return trimmed;
    }
    if (trimmed.endsWith('ch')) {
        const cols = Number(trimmed.slice(0, -2));
        if (!Number.isNaN(cols)) return cols;
    }
    const num = Number(trimmed);
    if (!Number.isNaN(num)) return num;
    return trimmed;
}

export function parseInlineStyle(style: string): Partial<Style> {
    const result: Partial<Style> = {};
    const declarations = style.split(';');
    for (const decl of declarations) {
        if (!decl.trim()) continue;
        const [rawKey, ...rest] = decl.split(':');
        if (!rawKey || rest.length === 0) continue;
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(':');
        const mapped = STYLE_MAP[key] || (key as keyof Style);
        (result as Record<string, unknown>)[mapped] = parseValue(value);
    }
    return result;
}

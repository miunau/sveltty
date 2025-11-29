/**
 * Input element renderer for CLI.
 * Handles text inputs, password fields, number inputs, checkboxes, and radio buttons.
 * 
 * Styling is driven by computed CSS styles. The user-agent stylesheet defines defaults,
 * and pseudo-classes (:focus, :disabled, :invalid) are resolved before rendering.
 */
import type { ClipRect, GridCell } from './types.js';
import type { TextStyle, CliNode } from '../types.js';
import type { ElementRenderer } from './registry.js';
import { registerRenderer } from './registry.js';
import { readInputState } from '../input/state.js';
import { getPaddingInsets, getBorderInsets, mergeTextStyles, resolveClip, setCell } from './utils.js';
import {
    type FormControlContext,
    getInteriorRect,
    fillInterior,
    drawCenteredChar,
} from './form-control.js';
import { getStringWidth, sliceByWidth, indexAtWidth } from './string-width.js';
import { computePseudoElementStyle } from '../style/stylesheet.js';

export function renderInput(
    node: CliNode,
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    isFocused: boolean,
    textStyle: TextStyle,
    clip?: ClipRect
): void {
    const state = readInputState(node);
    const resolvedClip = resolveClip(grid, clip);
    const inputType = node.inputType || state.type;
    
    if (inputType === 'checkbox' || inputType === 'radio') {
        renderCheckbox(node, grid, x, y, width, height, isFocused, textStyle, state, resolvedClip);
        return;
    }
    
    renderTextInput(node, grid, x, y, width, height, isFocused, textStyle, state, resolvedClip);
}

/**
 * Renders checkbox and radio button inputs.
 * Uses computed styles from CSS (including :focus, :disabled pseudo-classes).
 */
function renderCheckbox(
    node: CliNode,
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    isFocused: boolean,
    textStyle: TextStyle,
    state: ReturnType<typeof readInputState>,
    clip: ClipRect
): void {
    const ctx: FormControlContext = {
        node,
        grid,
        x,
        y,
        width,
        height,
        isFocused,
        style: textStyle,
        clip,
    };
    
    const checked = Boolean(node.checked);
    
    // textStyle already has :focus/:disabled/:invalid styles applied by stylesheet
    const interior = getInteriorRect(ctx, false);
    fillInterior(grid, interior, textStyle);
    drawCenteredChar(grid, interior, checked ? 'x' : ' ', textStyle);
}

/**
 * Renders text-based inputs (text, password, number, etc.).
 * Uses computed styles from CSS for colors, backgrounds, and caret styling.
 */
function renderTextInput(
    node: CliNode,
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    isFocused: boolean,
    textStyle: TextStyle,
    state: ReturnType<typeof readInputState>,
    clip: ClipRect
): void {
    const baseX = Math.floor(x);
    const baseY = Math.floor(y);
    const frameWidth = Math.max(1, Math.floor(width) || 1);
    const frameHeight = Math.max(1, Math.floor(height) || 1);
    const padding = getPaddingInsets(node);
    const clipX1 = Math.floor(clip.x1);
    const clipX2 = Math.ceil(clip.x2);
    const clipY1 = Math.floor(clip.y1);
    const clipY2 = Math.ceil(clip.y2);

    const disabled = state.disabled;
    const readonly = state.readonly;

    // Border style comes from computed CSS (includes :focus/:disabled states)
    const border = getBorderInsets(textStyle);

    // Calculate interior area (inside borders)
    const innerX = baseX + border.left;
    const innerY = baseY + border.top;
    const innerWidth = Math.max(1, frameWidth - border.left - border.right);
    const innerHeight = Math.max(1, frameHeight - border.top - border.bottom);

    // Apply padding within the interior
    const contentLeft = innerX + padding.left;
    const contentTop = innerY + padding.top;
    const contentWidth = Math.max(1, innerWidth - padding.left - padding.right);
    const contentHeight = Math.max(1, innerHeight - padding.top - padding.bottom);

    const showingPlaceholder = state.rawValue.length === 0 && state.placeholder.length > 0;
    const displayValue = state.displayValue;
    const lines = displayValue.split('\n');
    const clampIndex = (value: number | undefined): number => {
        const normalized = typeof value === 'number' && !Number.isNaN(value) ? value : displayValue.length;
        return Math.max(0, Math.min(normalized, displayValue.length));
    };
    const selStart = clampIndex(state.selectionStart);
    const selEnd = clampIndex(state.selectionEnd);
    const cursorIdx = clampIndex(state.cursorIndex);

    // Build styles from computed CSS
    // textStyle already includes :focus/:disabled/:invalid styling
    const baseStyle = applyStateStyle(textStyle, { disabled, readonly });
    
    // Placeholder style: use placeholder-color from CSS if set, otherwise dim the text
    const placeholderStyle: TextStyle = showingPlaceholder
        ? { ...baseStyle, color: textStyle.placeholderColor ?? 'gray', italic: true }
        : baseStyle;
    
    const contentStyle = showingPlaceholder ? placeholderStyle : baseStyle;
    
    // Caret style from CSS custom properties
    const caretStyle: TextStyle = {
        ...baseStyle,
        color: textStyle.caretColor ?? baseStyle.color,
        inverse: textStyle.caretInverse ?? true,
    };
    
    // Selection style from ::selection pseudo-element
    const selectionPseudoStyle = computePseudoElementStyle(node, 'selection');
    const selectionStyle: TextStyle = {
        ...baseStyle,
        backgroundColor: selectionPseudoStyle.backgroundColor ?? '#0066cc',
        color: selectionPseudoStyle.color ?? 'white',
    };
    
    // Fill entire inner area with background (from computed style)
    for (let row = 0; row < innerHeight; row++) {
        const gy = innerY + row;
        if (gy < clipY1 || gy >= clipY2) continue;
        for (let col = 0; col < innerWidth; col++) {
            const gx = innerX + col;
            if (gx < clipX1 || gx >= clipX2) continue;
            setCell(grid, gy, gx, ' ', baseStyle);
        }
    }

    const requestedHeight = state.rows && state.rows > 0 ? state.rows : undefined;
    const totalLines = Math.min(contentHeight, requestedHeight ?? contentHeight);
    const isMultiline = lines.length > 1 || totalLines > 1;
    
    // Calculate cursor position in terms of line and column
    const { line: cursorLine, col: cursorCol } = indexToLineCol(lines, cursorIdx);
    
    // Get or initialize persistent scroll offsets on the node
    let scrollX = node.__scrollX ?? 0;
    let scrollY = node.__scrollY ?? 0;
    
    if (isMultiline) {
        // Vertical scrolling for multi-line inputs (textarea)
        if (cursorLine < scrollY) {
            scrollY = cursorLine;
        } else if (cursorLine >= scrollY + totalLines) {
            scrollY = cursorLine - totalLines + 1;
        }
        // Horizontal scrolling per line
        if (cursorCol < scrollX) {
            scrollX = cursorCol;
        } else if (cursorCol >= scrollX + contentWidth) {
            scrollX = cursorCol - contentWidth + 1;
        }
    } else {
        // Horizontal scrolling for single-line inputs (using display width)
        if (cursorCol < scrollX) {
            scrollX = cursorCol;
        } else if (cursorCol >= scrollX + contentWidth) {
            scrollX = cursorCol - contentWidth + 1;
        }
        const lineWidth = getStringWidth(lines[0] ?? '');
        const maxScroll = Math.max(0, lineWidth - contentWidth + 1);
        scrollX = Math.min(scrollX, maxScroll);
        scrollX = Math.max(0, scrollX);
    }
    
    // Store scroll offsets for next render
    node.__scrollX = scrollX;
    node.__scrollY = scrollY;
    
    const hasVerticalOverflow = lines.length > totalLines + scrollY;
    const lineWidth = getStringWidth(lines[0] ?? '');
    const hasHorizontalOverflow = !isMultiline && lineWidth > contentWidth + scrollX;

    let charIndex = 0;
    // Skip lines before scroll window
    for (let i = 0; i < scrollY && i < lines.length; i++) {
        charIndex += (lines[i]?.length ?? 0) + 1;
    }
    
    for (let i = 0; i < totalLines; i++) {
        const lineIdx = i + scrollY;
        const line = lines[lineIdx] ?? '';
        
        const gy = contentTop + i;
        if (gy < clipY1 || gy >= clipY2 || gy < 0 || gy >= grid.length) {
            if (lineIdx < lines.length) {
                charIndex += line.length + 1;
            }
            continue;
        }
        
        // Render line with proper display width handling
        let displayCol = 0;
        let lineCharIdx = 0;
        
        // Skip characters that are scrolled off the left
        for (const char of line) {
            const charWidth = getStringWidth(char);
            if (displayCol >= scrollX) break;
            displayCol += charWidth;
            lineCharIdx++;
        }
        
        // Render visible characters
        const visibleChars = [...line].slice(lineCharIdx);
        let gx = contentLeft + (displayCol - scrollX);
        let currentCharIdx = lineCharIdx;
        
        for (const char of visibleChars) {
            const charWidth = getStringWidth(char);
            if (charWidth === 0) {
                currentCharIdx++;
                continue;
            }
            if (gx >= contentLeft + contentWidth) break;
            
            // Calculate the actual character index for selection
            const idx = charIndex + currentCharIdx;
            const inSel =
                !showingPlaceholder &&
                isFocused &&
                idx >= Math.min(selStart, selEnd) &&
                idx < Math.max(selStart, selEnd);
            const st = inSel ? selectionStyle : contentStyle;
            
            if (gx >= clipX1 && gx < clipX2 && gx >= 0 && gx < grid[gy].length) {
                setCell(grid, gy, gx, char, Object.keys(st).length ? st : undefined);
                if (charWidth === 2 && gx + 1 < contentLeft + contentWidth && gx + 1 < clipX2) {
                    setCell(grid, gy, gx + 1, '', Object.keys(st).length ? st : undefined);
                }
            }
            gx += charWidth;
            currentCharIdx++;
        }
        
        // Fill remaining space with spaces
        while (gx < contentLeft + contentWidth) {
            if (gx >= clipX1 && gx < clipX2 && gx >= 0 && gx < grid[gy].length) {
                setCell(grid, gy, gx, ' ', Object.keys(contentStyle).length ? contentStyle : undefined);
        }
            gx++;
        }
        
        if (lineIdx < lines.length) {
            charIndex += line.length + 1;
        }
    }

    if (isFocused) {
        // Calculate caret position accounting for scroll
        const effectiveCursorLine = showingPlaceholder ? 0 : cursorLine;
        const effectiveCursorCol = showingPlaceholder ? 0 : cursorCol;
        const caretRow = effectiveCursorLine - scrollY;
        const caretCol = effectiveCursorCol - scrollX;
        
        if (caretRow >= 0 && caretRow < totalLines && caretCol >= 0 && caretCol < contentWidth) {
            const cy = contentTop + caretRow;
            const cx = contentLeft + caretCol;
            if (
                cy >= clipY1 &&
                cy < clipY2 &&
                cx >= clipX1 &&
                cx < clipX2 &&
                cy >= 0 &&
                cy < grid.length &&
                cx >= 0 &&
                cx < grid[cy].length
            ) {
                const caretChar = textStyle.caretChar;
                if (caretChar) {
                    // Use explicit caret character
                setCell(grid, cy, cx, caretChar, caretStyle);
                } else {
                    // No caret character - preserve existing character, just apply inverse style
                    const existingCell = grid[cy][cx];
                    const existingChar = existingCell?.char || ' ';
                    setCell(grid, cy, cx, existingChar, caretStyle);
                }
            }
        }
    }

    // Overflow indicators
    if (hasHorizontalOverflow) {
        const overflowY = contentTop;
        const overflowX = Math.min(contentLeft + contentWidth - 1, clipX2 - 1);
        setCell(grid, overflowY, overflowX, '…', baseStyle);
    }
    
    if (hasVerticalOverflow) {
        const overflowY = Math.min(contentTop + totalLines - 1, clipY2 - 1);
        const overflowX = Math.min(contentLeft + contentWidth - 1, clipX2 - 1);
        setCell(grid, overflowY, overflowX, '↓', baseStyle);
    }
}

function applyStateStyle(style: TextStyle, state: { disabled?: boolean; readonly?: boolean }): TextStyle {
    const st = { ...(style || {}) };
    if (state.disabled) {
        st.dim = true;
    } else if (state.readonly) {
        st.dim = true;
        st.italic = true;
    }
    return st;
}

/**
 * Convert a character index to line number and display column.
 * Returns the display column (accounting for double-width characters).
 */
function indexToLineCol(lines: string[], idx: number): { line: number; col: number } {
    let remaining = idx;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (remaining <= line.length) {
            // Calculate display column for this position
            const prefix = line.slice(0, remaining);
            return { line: i, col: getStringWidth(prefix) };
        }
        remaining -= line.length + 1;
    }
    const lastLine = lines[lines.length - 1] ?? '';
    return { line: lines.length - 1, col: getStringWidth(lastLine) };
}

/**
 * Input element renderer.
 * Registered with the element registry to handle <input> and <textarea> elements.
 */
export const inputRenderer: ElementRenderer = {
    tags: ['input', 'textarea'],
    customChildren: true,
    
    render(node, ctx, bounds, computedStyle) {
        const isFocused = node.__focusState === 'focused';
        renderInput(
            node,
            ctx.grid,
            bounds.absX,
            bounds.absY,
            bounds.width,
            bounds.height,
            isFocused,
            computedStyle,
            bounds.clip
        );
    },
};

// Register the input renderer
registerRenderer(inputRenderer);

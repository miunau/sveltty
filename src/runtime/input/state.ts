import type { CliNode } from '../types.js';
import { getDomNode } from '../dom/happy.js';

/**
 * Snapshot of the visible and internal state of an input-like control.
 */
export interface InputState {
    type: string;
    rawValue: string;
    displayValue: string;
    placeholder: string;
    selectionStart: number;
    selectionEnd: number;
    cursorIndex: number;
    rows: number;
    disabled: boolean;
    readonly: boolean;
}

/**
 * Gather the rendered state for the provided CLI input node.
 *
 * @param node - CLI node representing an input/select/textarea.
 * @returns Normalized value/selection metadata for rendering logic.
 */
export function readInputState(node: CliNode): InputState {
    const dom = getDomNode(node) as HTMLInputElement | HTMLTextAreaElement | null;
    const type = String(node.inputType || node.type || '').toLowerCase();
    const domValue = typeof dom?.value === 'string' ? dom.value : undefined;
    const rawValue = String(node.__rawValue ?? domValue ?? node.value ?? node.defaultValue ?? '');
    const placeholder = String((dom?.placeholder ?? node.placeholder ?? '') || '');
    const displayValue = type === 'password' ? '*'.repeat(rawValue.length) : rawValue || placeholder || '';
    const length = displayValue.length;
    const selectionStart = clampIndex(
        typeof dom?.selectionStart === 'number' ? dom.selectionStart : node.selectionStart,
        length
    );
    const selectionEnd = clampIndex(
        typeof dom?.selectionEnd === 'number' ? dom.selectionEnd : node.selectionEnd,
        length
    );
    // Prioritize node.cursorPosition over DOM selectionEnd because the DOM's
    // selectionEnd gets reset to end-of-value when the input value changes,
    // but cursorPosition is our authoritative source for cursor location.
    const cursorIndex = clampIndex(
        typeof node.cursorPosition === 'number'
            ? node.cursorPosition
            : typeof dom?.selectionEnd === 'number'
            ? dom.selectionEnd
            : length,
        length
    );
    const domRows =
        dom && 'rows' in dom
            ? Number((dom as HTMLTextAreaElement).rows)
            : undefined;
    const rows = Number(domRows ?? node.rows ?? node.style?.height) || 0;
    const disabled = Boolean(dom?.disabled ?? node.disabled);
    const readonly = Boolean(dom?.readOnly ?? node.readonly);

    return {
        type,
        rawValue,
        displayValue,
        placeholder,
        selectionStart,
        selectionEnd,
        cursorIndex,
        rows,
        disabled,
        readonly,
    };
}

function clampIndex(value: number | undefined, length: number): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return length;
    }
    return Math.max(0, Math.min(value, length));
}

import { applyValueBinding, applyCheckedBinding, applySelectBinding } from '../actions/bindings.js';
import { template_effect, get as getState } from 'svelte/internal/client';

/**
 * Bindings for CLI
 * Most bindings don't apply to CLI rendering
 */

/**
 * Bind to property
 * Replaces: $.bind_prop()
 */
export function bind_prop(node: any, prop: string, getValue: () => any): void {
    // Keep reference if needed later
    node[`__bind_${prop}`] = getValue;
}

/**
 * Bind this reference
 * Replaces: $.bind_this()
 */
export function bind_this(node: any, callback: (node: any) => void): void {
    // Call immediately for CLI
    callback?.(node);
}

/**
 * Bind value for inputs/selects
 */
export function bind_value(node: any, get: () => any, set: (v: any) => void = get): void {
    applyValueBinding(node, { get, set });
    template_effect(() => {
        const value = getState(get);
        const currentValue = node.value;
        if (currentValue !== value && !node.dirty) {
            node.value = value;
            node.__rawValue = String(value ?? '');
    }
    });
}

/**
 * Bind checked for checkbox/radio
 */
export function bind_checked(node: any, get: () => boolean, set: (v: boolean) => void = get): void {
    applyCheckedBinding(node, { get, set });
    template_effect(() => {
        const value = getState(get);
        if (node.checked !== value) {
            node.checked = !!value;
        }
    });
}

/**
 * Bind select value
 */
export function bind_select_value(node: any, get: () => any, set: (v: any) => void = get): void {
    applySelectBinding(node, { get, set });
    template_effect(() => {
        const value = getState(get);
        if (node.value !== value) {
            node.value = value;
        }
    });
}

/**
 * Group binding (checkbox/radio) - minimal implementation
 */
export function bind_group(inputs: any[], group_index: any, input: any, get: () => any, set: (v: any) => void = get): void {
    input.__bindingGroup = inputs;
    input.__groupSet = set;
    input.__groupGet = get;
    inputs.push(input);
    // Svelte sets __value on options/inputs; ensure we have a value fallback
    if (input.value !== undefined) {
        input.__value = input.value;
    }
}

/**
 * Selection helpers (stubs for compatibility)
 */
export function setRangeText(node: any, replacement: string, start?: number, end?: number): void {
    const text = String(node.value ?? '');
    const len = text.length;
    let rawStart = typeof start === 'number' ? start : 0;
    let rawEnd = typeof end === 'number' ? end : len;
    rawStart = Math.max(0, Math.min(rawStart, len));
    rawEnd = Math.max(0, Math.min(rawEnd, len));
    const wasBackward = rawStart > rawEnd;
    const insertionStart = wasBackward ? rawEnd : rawStart;
    const insertionEnd = wasBackward ? rawStart : rawEnd;
    const next = text.slice(0, insertionStart) + replacement + text.slice(insertionEnd);
    node.value = next;
    const inputType = String((node?.inputType || node?.type || '') ?? '').toLowerCase();
    const isNumeric = inputType === 'number' || inputType === 'range';
    if (isNumeric) {
        node.__rawValue = next;
    }
    const selectionOffset = insertionStart + replacement.length;
    if (wasBackward) {
        node.selectionStart = selectionOffset;
        node.selectionEnd = insertionStart;
        node.selectionDirection = selectionOffset === insertionStart ? 'none' : 'backward';
    } else {
        node.selectionStart = insertionStart;
        node.selectionEnd = selectionOffset;
        node.selectionDirection = selectionOffset === insertionStart ? 'none' : 'forward';
    }
    if (!isNumeric) {
        node.__setValue?.(node.value);
    }
    node.onInput?.({ value: node.value });
}

export function select(node: any): void {
    node.selectionStart = 0;
    node.selectionEnd = String(node.value ?? '').length;
}

export function setSelectionRange(node: any, start: number, end: number, direction: 'forward' | 'backward' | 'none' = 'none'): void {
    node.selectionStart = start;
    node.selectionEnd = end;
    node.selectionDirection = direction;
}

export function copy(_node: any): void {
    // no-op placeholder for compatibility
}

export function paste(_node: any, _event?: any): void {
    // no-op placeholder for compatibility
}

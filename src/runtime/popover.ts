import type { CliNode } from './types.js';
import { scheduleRender } from './mount.js';
import { emitDomEvent } from './events.js';
import { getCliNodeById } from './dom/document.js';
import { getCliNode, getDomNode, getDomElement } from './dom/happy.js';
import { getNodeChildren } from './utils/node.js';
import { refreshFocusables, setFocus } from './focus.js';
import { findAutofocusElement } from './dialog.js';

type PopoverMode = 'auto' | 'manual' | 'hint';
type PopoverState = {
    mode: PopoverMode;
    open: boolean;
};

type PopoverAction = 'toggle' | 'show' | 'hide';

const POPOVER_STATE = new WeakMap<CliNode, PopoverState>();
const OPEN_STACK: CliNode[] = [];
const POPOVER_API_APPLIED = Symbol('sveltty.popover.api');

/**
 * Returns a copy of the currently open popovers in stack order (bottom to top).
 * Used by the paint pipeline to render popovers on the top layer.
 */
export function getOpenPopovers(): CliNode[] {
    return [...OPEN_STACK];
}

/**
 * Clears all popover state. Used for testing.
 */
export function resetPopovers(): void {
    OPEN_STACK.length = 0;
}

export function hasPopoverBehavior(node: CliNode): boolean {
    return POPOVER_STATE.has(node);
}

export function getPopoverMode(node: CliNode): PopoverMode | undefined {
    return POPOVER_STATE.get(node)?.mode;
}

export function isPopoverOpen(node: CliNode): boolean {
    return POPOVER_STATE.get(node)?.open === true;
}

export function shouldHidePopover(node: CliNode): boolean {
    return hasPopoverBehavior(node) && !isPopoverOpen(node);
}

export function setPopoverMode(node: CliNode, value: any): PopoverMode | undefined {
    const normalized = normalizePopoverMode(value);
    if (!normalized) {
        if (POPOVER_STATE.has(node)) {
            hidePopover(node);
        }
        POPOVER_STATE.delete(node);
        delete node.__popoverMode;
        delete node.__popoverOpen;
        scheduleRender();
        removeDomAttribute(node, 'popover');
        return undefined;
    }

    const state = POPOVER_STATE.get(node) ?? { mode: normalized, open: false };
    state.mode = normalized;
    POPOVER_STATE.set(node, state);
    node.__popoverMode = normalized;
    node.__popoverOpen = state.open;
    installPopoverApi(node);
    reflectDomAttribute(node, 'popover', normalized);
    scheduleRender();
    return normalized;
}

export function showPopover(node: CliNode): boolean {
    const state = ensureState(node);
    if (!state) return false;
    if (state.open) return true;
    if (!dispatchToggle(node, state, 'open')) {
        return false;
    }
    performShow(node, state);
    return true;
}

export function hidePopover(node: CliNode): boolean {
    const state = ensureState(node);
    if (!state || !state.open) {
        return false;
    }
    if (!dispatchToggle(node, state, 'closed')) {
        return false;
    }
    performHide(node, state);
    return true;
}

export function togglePopover(node: CliNode, explicit?: PopoverAction): boolean {
    const state = ensureState(node);
    if (!state) return false;
    const action = explicit ?? 'toggle';
    if (action === 'show') {
        return showPopover(node);
    }
    if (action === 'hide') {
        return hidePopover(node);
    }
    return state.open ? hidePopover(node) : showPopover(node);
}

export function activatePopoverControl(node: CliNode, action?: PopoverAction): boolean {
    const targetId = node.popovertarget;
    if (!targetId) {
        return false;
    }
    const target = resolveNodeById(String(targetId), node);
    if (!target) {
        return false;
    }
    const mode = getPopoverMode(target);
    if (!mode || mode === 'manual') {
        return false;
    }
    const normalized = normalizePopoverAction(action ?? node.popovertargetaction);
    return togglePopover(target, normalized);
}

export function closeTopPopover(): boolean {
    for (let i = OPEN_STACK.length - 1; i >= 0; i -= 1) {
        const node = OPEN_STACK[i];
        const state = POPOVER_STATE.get(node);
        if (!state) continue;
        if (state.mode === 'manual' || !state.open) {
            continue;
        }
        hidePopover(node);
        return true;
    }
    return false;
}

function ensureState(node: CliNode): PopoverState | null {
    const state = POPOVER_STATE.get(node);
    if (!state) {
        return null;
    }
    return state;
}

function performShow(node: CliNode, state: PopoverState): void {
    removeFromOpenStack(node);
    OPEN_STACK.push(node);
    state.open = true;
    node.__popoverOpen = true;
    scheduleRender();
    
    // Refresh focusables so elements inside the popover become focusable
    refreshFocusables();
    
    // Autofocus: focus the first element with autofocus attribute
    const autofocusElement = findAutofocusElement(node);
    if (autofocusElement) {
        setFocus(autofocusElement);
    }
    
    emitDomEvent(node, 'toggle', {
        bubbles: false,
        cancelable: false,
        detail: { oldState: 'closed', newState: 'open' },
    });
}

function performHide(node: CliNode, state: PopoverState): void {
    removeFromOpenStack(node);
    state.open = false;
    node.__popoverOpen = false;
    scheduleRender();
    
    // Refresh focusables so elements inside the popover are removed from tab order.
    // If focus was inside the popover, it will be cleared (browser-like behavior).
    refreshFocusables();
    
    emitDomEvent(node, 'toggle', {
        bubbles: false,
        cancelable: false,
        detail: { oldState: 'open', newState: 'closed' },
    });
}

function removeFromOpenStack(node: CliNode): void {
    const idx = OPEN_STACK.indexOf(node);
    if (idx >= 0) {
        OPEN_STACK.splice(idx, 1);
    }
}

function dispatchToggle(node: CliNode, state: PopoverState, direction: 'open' | 'closed'): boolean {
    const from = state.open ? 'open' : 'closed';
    const to = direction;
    if (from === to) return true;
    const before = emitDomEvent(node, 'beforetoggle', {
        bubbles: false,
        cancelable: true,
        detail: { oldState: from, newState: to },
    });
    if (before?.defaultPrevented) {
        return false;
    }
    return true;
}

function installPopoverApi(node: CliNode): void {
    const nodeSymbols = node as unknown as Record<symbol, boolean>;
    if (nodeSymbols[POPOVER_API_APPLIED]) return;
    Object.defineProperty(node, POPOVER_API_APPLIED, {
        value: true,
        enumerable: false,
    });
    
    // Define the API methods
    const apiMethods = {
        showPopover: {
            value: () => showPopover(node),
            enumerable: false,
            configurable: true,
        },
        hidePopover: {
            value: () => hidePopover(node),
            enumerable: false,
            configurable: true,
        },
        togglePopover: {
            value: () => togglePopover(node),
            enumerable: false,
            configurable: true,
        },
    };
    
    const popoverProperty = {
            get() {
                return node.__popoverMode;
            },
            set(value: any) {
                setPopoverMode(node, value);
            },
            enumerable: true,
        configurable: true,
    };
    
    // Install on CLI node
    Object.defineProperties(node, {
        ...apiMethods,
        popover: popoverProperty,
    });
    
    // Also install on DOM node so bind:this works with Svelte
    const domNode = getDomNode(node);
    if (domNode) {
        Object.defineProperties(domNode, {
            ...apiMethods,
            popover: popoverProperty,
    });
    }
}

function normalizePopoverMode(value: any): PopoverMode | undefined {
    if (value === null || value === undefined || value === false) {
        return undefined;
    }
    const normalized = String(value || 'auto').trim().toLowerCase();
    if (!normalized) return 'auto';
    if (normalized === 'manual') return 'manual';
    if (normalized === 'hint') return 'hint';
    return 'auto';
}

function normalizePopoverAction(value: any): PopoverAction {
    if (!value && value !== '') return 'toggle';
    const normalized = String(value || 'toggle').trim().toLowerCase();
    if (normalized === 'show') return 'show';
    if (normalized === 'hide') return 'hide';
    return 'toggle';
}

function resolveNodeById(id: string, context?: CliNode): CliNode | null {
    const cli = getCliNodeById(id);
        if (cli) return cli;
    if (context) {
        const root = getCliRoot(context);
        return searchCliTree(root, id);
    }
    return null;
}

function getCliRoot(node: CliNode): CliNode {
    let current: CliNode | null = node;
    while (current?.parent) {
        current = current.parent;
    }
    return current ?? node;
}

function searchCliTree(node: CliNode | null, id: string): CliNode | null {
    if (!node) return null;
    if (node.id === id) return node;
    for (const child of getNodeChildren(node)) {
        const match = searchCliTree(child, id);
        if (match) return match;
    }
    return null;
}

function reflectDomAttribute(node: CliNode, name: string, value: string): void {
    const dom = getDomElement(node);
    if (!dom) return;
    dom.setAttribute(name, value);
}

function removeDomAttribute(node: CliNode, name: string): void {
    const dom = getDomElement(node);
    if (!dom) return;
    dom.removeAttribute(name);
}


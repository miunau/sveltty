/**
 * Dialog Element Support
 * 
 * Implements the HTMLDialogElement API for CLI:
 * - show() - Display as non-modal dialog
 * - showModal() - Display as modal with backdrop
 * - close(returnValue?) - Close the dialog
 * - open property - Whether dialog is open
 * - returnValue property - Value set on close
 * 
 * Events:
 * - close - Fired when dialog closes
 * - cancel - Fired when dialog is canceled (Escape key)
 * 
 * Attributes:
 * - open - Reflects dialog open state
 * - closedby - Controls close behavior ('any', 'closerequest', 'none')
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
 */

import type { CliNode } from './types.js';
import { scheduleRender } from './mount.js';
import { emitDomEvent } from './events.js';
import { getDomNode } from './dom/happy.js';
import { getNodeChildren, getNodeTag } from './utils/node.js';
import { getFocused, refreshFocusables, setFocus } from './focus.js';
import { log } from './logger.js';

type ClosedByMode = 'any' | 'closerequest' | 'none';

interface DialogState {
    /** Whether the dialog is currently open. */
    open: boolean;
    /** Whether the dialog was opened as modal. */
    modal: boolean;
    /** The return value set when closing. */
    returnValue: string;
    /** The closedby mode. */
    closedBy: ClosedByMode;
    /** The element that had focus before the dialog opened. */
    previousFocus: CliNode | null;
}

const DIALOG_STATE = new WeakMap<CliNode, DialogState>();
const DIALOG_API_APPLIED = Symbol('sveltty.dialog.api');

/** Stack of open modal dialogs (bottom to top). */
const MODAL_STACK: CliNode[] = [];

/** Stack of open non-modal dialogs. */
const DIALOG_STACK: CliNode[] = [];

/**
 * Get all open dialogs in stack order (bottom to top).
 * Modal dialogs come after non-modal dialogs.
 */
export function getOpenDialogs(): CliNode[] {
    return [...DIALOG_STACK, ...MODAL_STACK];
}

/**
 * Get only open modal dialogs.
 */
export function getOpenModals(): CliNode[] {
    return [...MODAL_STACK];
}

/**
 * Check if any modal dialog is open.
 */
export function hasOpenModal(): boolean {
    return MODAL_STACK.length > 0;
}

/**
 * Get the topmost modal dialog.
 */
export function getTopmostModal(): CliNode | null {
    return MODAL_STACK.length > 0 ? MODAL_STACK[MODAL_STACK.length - 1] : null;
}

/**
 * Clear all dialog state. Used for testing.
 */
export function resetDialogs(): void {
    MODAL_STACK.length = 0;
    DIALOG_STACK.length = 0;
}

/**
 * Check if a node is a dialog element.
 */
export function isDialogElement(node: CliNode): boolean {
    return getNodeTag(node) === 'dialog';
}

/**
 * Check if a dialog is currently open.
 */
export function isDialogOpen(node: CliNode): boolean {
    return DIALOG_STATE.get(node)?.open === true;
}

/**
 * Check if a dialog is open as modal.
 */
export function isDialogModal(node: CliNode): boolean {
    const state = DIALOG_STATE.get(node);
    return state?.open === true && state?.modal === true;
}

/**
 * Get the dialog's return value.
 */
export function getDialogReturnValue(node: CliNode): string {
    return DIALOG_STATE.get(node)?.returnValue ?? '';
}

/**
 * Should the dialog be hidden in layout?
 */
export function shouldHideDialog(node: CliNode): boolean {
    return isDialogElement(node) && !isDialogOpen(node);
}

/**
 * Initialize dialog state for a node.
 */
export function initDialogState(node: CliNode): DialogState {
    let state = DIALOG_STATE.get(node);
    if (!state) {
        state = {
            open: false,
            modal: false,
            returnValue: '',
            closedBy: normalizeClosedBy(node.closedby),
            previousFocus: null,
        };
        DIALOG_STATE.set(node, state);
        installDialogApi(node);
    }
    return state;
}

/**
 * Show the dialog as non-modal.
 */
export function showDialog(node: CliNode): void {
    const state = initDialogState(node);
    if (state.open) return; // Already open

    state.open = true;
    state.modal = false;
    
    // Add to non-modal stack
    removeFromStacks(node);
    DIALOG_STACK.push(node);
    
    // Reflect open attribute
    node.open = true;
    reflectDomAttribute(node, 'open', '');
    
    scheduleRender();
    refreshFocusables();
    
    // Autofocus handling
    focusAutofocusElement(node);
}

/**
 * Show the dialog as modal.
 */
export function showDialogModal(node: CliNode): void {
    log('showDialogModal:enter');
    const state = initDialogState(node);
    if (state.open) {
        throw new DOMException(
            "Failed to execute 'showModal' on 'HTMLDialogElement': The element already has an 'open' attribute, and therefore cannot be opened modally.",
            'InvalidStateError'
        );
    }

    // Store previous focus for restoration
    state.previousFocus = getFocused();

    state.open = true;
    state.modal = true;
    
    // If no explicit closedby, modal defaults to 'closerequest' (allows Escape)
    if (!node.closedby) {
        state.closedBy = 'closerequest';
    }
    
    // Add to modal stack
    removeFromStacks(node);
    MODAL_STACK.push(node);
    log('showDialogModal:pushed', { stackLength: MODAL_STACK.length });
    
    // Reflect open attribute
    node.open = true;
    reflectDomAttribute(node, 'open', '');
    
    scheduleRender();
    refreshFocusables();
    
    // Autofocus handling
    focusAutofocusElement(node);
}

/**
 * Close the dialog.
 * @param node - The dialog node.
 * @param returnValue - Optional return value to set.
 */
export function closeDialog(node: CliNode, returnValue?: string): void {
    const state = DIALOG_STATE.get(node);
    if (!state || !state.open) return;

    // Set return value if provided
    if (returnValue !== undefined) {
        state.returnValue = returnValue;
    }

    state.open = false;
    const wasModal = state.modal;
    state.modal = false;

    // Remove from stacks
    removeFromStacks(node);
    
    // Remove open attribute
    node.open = false;
    removeDomAttribute(node, 'open');
    
    scheduleRender();
    refreshFocusables();

    // Restore focus to previous element (for modals)
    if (wasModal && state.previousFocus) {
        setFocus(state.previousFocus);
        state.previousFocus = null;
    }

    // Emit close event
    emitDomEvent(node, 'close', {
        bubbles: false,
        cancelable: false,
    });
}

/**
 * Cancel the dialog (triggered by Escape key).
 * Fires cancel event before closing.
 */
export function cancelDialog(node: CliNode): boolean {
    const state = DIALOG_STATE.get(node);
    if (!state || !state.open) return false;

    // Check if cancel is allowed based on closedby
    if (state.closedBy === 'none') {
        return false;
    }

    // Emit cancel event (cancelable)
    const cancelEvent = emitDomEvent(node, 'cancel', {
        bubbles: false,
        cancelable: true,
    });

    if (cancelEvent?.defaultPrevented) {
        return false;
    }

    closeDialog(node);
    return true;
}

/**
 * Handle Escape key for dialogs.
 * Called from the focus system when Escape is pressed.
 * @returns true if a dialog was canceled.
 */
export function handleDialogEscape(): boolean {
    log('handleDialogEscape:enter', { stackLength: MODAL_STACK.length });
    // Try to cancel the topmost modal first
    if (MODAL_STACK.length > 0) {
        const topModal = MODAL_STACK[MODAL_STACK.length - 1];
        log('handleDialogEscape:canceling');
        return cancelDialog(topModal);
    }
    log('handleDialogEscape:noModal');
    return false;
}

/**
 * Light dismiss for 'any' closedby mode.
 * Called when clicking outside a dialog.
 */
export function lightDismissDialogs(): boolean {
    // Check modal stack first
    for (let i = MODAL_STACK.length - 1; i >= 0; i--) {
        const dialog = MODAL_STACK[i];
        const state = DIALOG_STATE.get(dialog);
        if (state?.closedBy === 'any') {
            closeDialog(dialog);
            return true;
        }
    }
    return false;
}

/**
 * Find and focus the first element with autofocus attribute inside the dialog,
 * or focus the dialog itself if no autofocus element found.
 */
function focusAutofocusElement(dialogNode: CliNode): void {
    const autofocusElement = findAutofocusElement(dialogNode);
    if (autofocusElement) {
        setFocus(autofocusElement);
    } else {
        // For modals, focus first focusable element or the dialog itself
        const firstFocusable = findFirstFocusable(dialogNode);
        if (firstFocusable) {
            setFocus(firstFocusable);
        }
    }
}

/**
 * Find element with autofocus attribute within a subtree.
 */
export function findAutofocusElement(root: CliNode): CliNode | null {
    const queue: CliNode[] = [...getNodeChildren(root)];
    while (queue.length > 0) {
        const node = queue.shift()!;
        if (node.autofocus) {
            if (node.focusable && !node.disabled) {
                return node;
            }
        }
        queue.push(...getNodeChildren(node));
    }
    return null;
}

/**
 * Find first focusable element within a subtree.
 */
function findFirstFocusable(root: CliNode): CliNode | null {
    const queue: CliNode[] = [...getNodeChildren(root)];
    while (queue.length > 0) {
        const node = queue.shift()!;
        if (node.focusable && !node.disabled) {
            return node;
        }
        queue.push(...getNodeChildren(node));
    }
    return null;
}

function removeFromStacks(node: CliNode): void {
    let idx = MODAL_STACK.indexOf(node);
    if (idx >= 0) MODAL_STACK.splice(idx, 1);
    
    idx = DIALOG_STACK.indexOf(node);
    if (idx >= 0) DIALOG_STACK.splice(idx, 1);
}

function normalizeClosedBy(value: any): ClosedByMode {
    if (!value) return 'none'; // Default for non-modal
    const normalized = String(value).toLowerCase().trim();
    if (normalized === 'any') return 'any';
    if (normalized === 'closerequest') return 'closerequest';
    return 'none';
}

/**
 * Install the HTMLDialogElement API on a node.
 */
function installDialogApi(node: CliNode): void {
    if ((node as unknown as Record<symbol, boolean>)[DIALOG_API_APPLIED]) return;
    
    Object.defineProperty(node, DIALOG_API_APPLIED, {
        value: true,
        enumerable: false,
    });

    const apiMethods = {
        show: {
            value: () => showDialog(node),
            enumerable: false,
            configurable: true,
        },
        showModal: {
            value: () => showDialogModal(node),
            enumerable: false,
            configurable: true,
        },
        close: {
            value: (returnValue?: string) => closeDialog(node, returnValue),
            enumerable: false,
            configurable: true,
        },
    };

    const openProperty = {
        get() {
            return DIALOG_STATE.get(node)?.open ?? false;
        },
        set(value: boolean) {
            const state = initDialogState(node);
            if (value && !state.open) {
                showDialog(node); // Opening via property is non-modal
            } else if (!value && state.open) {
                closeDialog(node);
            }
        },
        enumerable: true,
        configurable: true,
    };

    const returnValueProperty = {
        get() {
            return DIALOG_STATE.get(node)?.returnValue ?? '';
        },
        set(value: string) {
            const state = initDialogState(node);
            state.returnValue = String(value ?? '');
        },
        enumerable: true,
        configurable: true,
    };

    // Install on CLI node
    Object.defineProperties(node, {
        ...apiMethods,
        open: openProperty,
        returnValue: returnValueProperty,
    });

    // Also install on DOM node for Svelte bind:this
    const domNode = getDomNode(node);
    if (domNode) {
        Object.defineProperties(domNode, {
            ...apiMethods,
            open: openProperty,
            returnValue: returnValueProperty,
        });
    }
}

function reflectDomAttribute(node: CliNode, name: string, value: string): void {
    const dom = getDomNode(node) as HTMLElement | null;
    if (!dom?.setAttribute) return;
    dom.setAttribute(name, value);
}

function removeDomAttribute(node: CliNode, name: string): void {
    const dom = getDomNode(node) as HTMLElement | null;
    if (!dom?.removeAttribute) return;
    dom.removeAttribute(name);
}


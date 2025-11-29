import type { CliNode, KeyPressEvent } from './types.js';
import type { RawKey } from './input/keyboard.js';
import { rawKeyToPressEvent } from './input/keyboard.js';
import { document } from './dom/document.js';
import { getCliNode, getDomNode } from './dom/happy.js';
import {
    emitDomEvent,
    emitInputEvent,
    emitChangeEvent,
    emitKeyboardEvent,
    emitFocus,
    emitBlur,
    emitMouse,
} from './events.js';
import { readInputState } from './input/state.js';
import { closeTopPopover, hasPopoverBehavior, isPopoverOpen } from './popover.js';
import { handleDialogEscape, hasOpenModal, getTopmostModal } from './dialog.js';
import { getNodeTag, getNodeChildren, FORM_CONTROL_TAGS, INTERACTIVE_TAGS } from './utils/node.js';
import { getComputedCliStyle } from './style/computed.js';
import {
    scrollIntoView,
} from './scroll.js';
import { handleScrollKeyboard } from './scroll-keyboard.js';
import { log } from './logger.js';

type RenderCallback = () => void;
const FORM_TAG_NAME = 'form';

interface FocusableEntry {
    node: CliNode;
    order: number;
}

export interface FocusControllerState {
    focusables: FocusableEntry[];
    focused: CliNode | null;
    radioGroups: Record<string, Set<CliNode>>;
    formAssociations: Map<string, Set<CliNode>>;
    lastBlurred: CliNode | null;
    counter: number;
    renderCallback: RenderCallback | null;
    liveMessage: string;
}

const FORM_ASSOC_KEY = Symbol('formAssociation');

function createFocusControllerState(): FocusControllerState {
    return {
        focusables: [],
        focused: null,
        radioGroups: {},
        formAssociations: new Map(),
        lastBlurred: null,
        counter: 0,
        renderCallback: null,
        liveMessage: '',
    };
}

let activeFocusState: FocusControllerState = createFocusControllerState();
const focusStateStack: FocusControllerState[] = [];

export function createFocusController(): FocusControllerState {
    return createFocusControllerState();
}

/**
 * Reset the active focus state to a fresh state.
 * Primarily used for testing to ensure clean state between tests.
 */
export function resetFocusState(): void {
    activeFocusState = createFocusControllerState();
    focusStateStack.length = 0;
}

export function pushFocusController(state: FocusControllerState): void {
    focusStateStack.push(activeFocusState);
    activeFocusState = state;
}

export function popFocusController(): void {
    const previous = focusStateStack.pop();
    if (previous) {
        activeFocusState = previous;
    }
}

export function getActiveFocusController(): FocusControllerState {
    return activeFocusState;
}

export function withFocusController<T>(controller: FocusControllerState, fn: () => T): T {
    pushFocusController(controller);
    try {
        return fn();
    } finally {
        popFocusController();
    }
}

function scheduleRender(): void {
    activeFocusState.renderCallback?.();
}

function setNodeFocusState(node: CliNode | null, state: 'focused' | null): void {
    if (!node) return;
    node.__focusState = state;
}

export function setRenderScheduler(fn: RenderCallback): void {
    activeFocusState.renderCallback = fn;
}

/**
 * Clean and sort the master focusables list.
 * Only removes duplicates and permanently unfocusable nodes (disabled, tabIndex=-1).
 * Does NOT filter by visibility - that's done at navigation time.
 */
function sortFocusables(): void {
    const seen = new Set<CliNode>();
    activeFocusState.focusables = activeFocusState.focusables
        .filter(entry => {
            // Remove duplicates
            if (seen.has(entry.node)) return false;
            seen.add(entry.node);
            // Keep if potentially focusable (may be hidden now but could become visible)
            return isPotentiallyFocusable(entry.node);
        })
        .sort((a, b) => {
            const aTab = a.node.tabIndex ?? 0;
            const bTab = b.node.tabIndex ?? 0;
            if (aTab !== bTab) return aTab - bTab;
            return a.order - b.order;
        });
}

/**
 * Check if a node is a descendant of another node.
 */
function isDescendantOf(node: CliNode, ancestor: CliNode): boolean {
    let current: CliNode | null = node.parent;
    while (current) {
        if (current === ancestor) return true;
        current = current.parent;
    }
    return false;
}

/**
 * Get the currently visible and focusable nodes, sorted by tabIndex.
 * This is the list used for actual tab navigation.
 * 
 * When a modal dialog is open, only returns focusables within that dialog
 * to implement focus trapping.
 */
function getVisibleFocusables(): FocusableEntry[] {
    let focusables = activeFocusState.focusables
        .filter(entry => isFocusableNode(entry.node));
    
    // Focus trap: when a modal dialog is open, only allow focusing within it
    if (hasOpenModal()) {
        const modal = getTopmostModal();
        if (modal) {
            focusables = focusables.filter(entry => 
                entry.node === modal || isDescendantOf(entry.node, modal)
            );
        }
    }
    
    return focusables.sort((a, b) => {
        const aTab = a.node.tabIndex ?? 0;
        const bTab = b.node.tabIndex ?? 0;
        if (aTab !== bTab) return aTab - bTab;
        return a.order - b.order;
    });
}

export function registerFocusable(node: CliNode): void {
    // Register if potentially focusable (even if currently hidden).
    // Visibility is checked when filtering during navigation.
    if (!isPotentiallyFocusable(node)) return;
    
    const existingIndex = activeFocusState.focusables.findIndex(entry => entry.node === node);
    if (existingIndex !== -1) {
        return;
    }
    
    activeFocusState.focusables.push({ node, order: activeFocusState.counter++ });
    sortFocusables();
    ensureDefaultFocus();
}

export function unregisterFocusable(node: CliNode): void {
    activeFocusState.focusables = activeFocusState.focusables.filter(entry => entry.node !== node);
    if (activeFocusState.focused === node) {
        activeFocusState.focused?.onBlur?.();
        setNodeFocusState(activeFocusState.focused, null);
        
        // Close select dropdown when unregistered while focused
        if (node.nodeName === 'select') {
            node.__dropdownOpen = false;
        }
        
        activeFocusState.focused = null;
        activeFocusState.liveMessage = '';
    }
    sortFocusables();
    ensureDefaultFocus();
    scheduleRender();
}

/**
 * Re-evaluate the focusables list based on current visibility.
 * Call this when visibility changes (e.g., popover opens/closes).
 * This doesn't move focus - it just updates which elements are in the Tab order.
 */
export function refreshFocusables(): void {
    sortFocusables();
    
    // If the currently focused element is no longer focusable (e.g., popover closed),
    // clear focus but don't auto-focus elsewhere (browser-like behavior)
    if (activeFocusState.focused && !isFocusableNode(activeFocusState.focused)) {
        activeFocusState.focused.onBlur?.();
        emitBlur(activeFocusState.focused);
        setNodeFocusState(activeFocusState.focused, null);
        activeFocusState.focused = null;
        activeFocusState.liveMessage = '';
    }
}

export function setFocus(node: CliNode | null): void {
    log('setFocus:enter', { 
        node: node?.nodeName, 
        nodeId: node?.id,
        nodeClass: node?.className
    });
    
    if (!node || !isFocusableNode(node)) {
        log('setFocus:notFocusable');
        return;
    }
    if (activeFocusState.focused === node) {
        log('setFocus:alreadyFocused');
        return;
    }

    const prev = activeFocusState.focused;
    if (prev) {
        activeFocusState.lastBlurred = prev;
        prev.onBlur?.();
        emitBlur(prev);
        fireChangeOnBlur(prev, 'focus-move');
        setNodeFocusState(prev, null);
        
        // Close select dropdown when focus leaves
        if (prev.nodeName === 'select') {
            prev.__dropdownOpen = false;
            clearTypeahead(prev);
        }
    }

    activeFocusState.focused = node;
    setNodeFocusState(node, 'focused');
    node.onFocus?.();
    emitFocus(node);

    // Scroll the focused element into view within any scroll containers
    log('setFocus:beforeScrollIntoView');
    scrollIntoView(node);
    log('setFocus:afterScrollIntoView');

    activeFocusState.liveMessage = buildMessage(node);
    log('setFocus:beforeScheduleRender');
    scheduleRender();
    log('setFocus:exit');
}

/**
 * Remove focus from a specific node.
 * If the node is currently focused, focus is cleared.
 * Unlike browsers, this doesn't automatically move focus elsewhere.
 * 
 * @param node - The node to blur.
 */
export function blurNode(node: CliNode): void {
    if (activeFocusState.focused !== node) {
        return; // Node isn't focused, nothing to do
    }
    
    activeFocusState.lastBlurred = node;
    node.onBlur?.();
    emitBlur(node);
    fireChangeOnBlur(node, 'blur');
    setNodeFocusState(node, null);
    
    // Close select dropdown when blurred
    if (node.nodeName === 'select') {
        node.__dropdownOpen = false;
        clearTypeahead(node);
    }
    
    activeFocusState.focused = null;
    activeFocusState.liveMessage = '';
    scheduleRender();
}

export function moveFocus(direction: 'next' | 'prev' | 'first' | 'last' = 'next'): void {
    if (activeFocusState.focusables.length === 0) return;
    
    // Get currently visible focusables (filters by visibility at navigation time)
    const visibleFocusables = getVisibleFocusables();
    if (visibleFocusables.length === 0) return;

    const currentIndex = activeFocusState.focused
        ? visibleFocusables.findIndex(entry => entry.node === activeFocusState.focused)
        : -1;

    let nextIndex = 0;
    if (direction === 'next') {
        nextIndex = currentIndex >= 0 ? (currentIndex + 1) % visibleFocusables.length : 0;
    } else if (direction === 'prev') {
        nextIndex = currentIndex >= 0
            ? (currentIndex - 1 + visibleFocusables.length) % visibleFocusables.length
            : visibleFocusables.length - 1;
    } else if (direction === 'last') {
        nextIndex = visibleFocusables.length - 1;
    }

    setFocus(visibleFocusables[nextIndex]?.node ?? null);
}

export function dispatchKey(raw: RawKey): boolean {
    ensureDefaultFocus();
    if (!activeFocusState.focused) {
        // No focused element - still handle Tab to establish focus
        if (raw.tab) {
            moveFocus(raw.shift ? 'prev' : 'next');
            return true;
        }
        return false;
    }

    const keyEvent = rawKeyToPressEvent(raw);
    log('dispatchKey:enter', { key: raw.key, escape: raw.escape, tab: raw.tab });

    // 1. First emit the keydown event to the focused element
    const domEvent = emitKeyboardEvent(activeFocusState.focused as CliNode, 'keydown', raw);
    // Call user callback with the key event (not DOM event) for compatibility
    activeFocusState.focused.onKeyDown?.(keyEvent);

    // 2. If user called preventDefault(), stop all default behaviors
    if (domEvent?.defaultPrevented) {
        log('dispatchKey:defaultPrevented');
        return true;
    }

    // 3. Handle Tab navigation
    if (raw.tab) {
        log('dispatchKey:tab');
        moveFocus(raw.shift ? 'prev' : 'next');
        return true;
    }

    // 4. Handle Escape: dialogs > popovers (browser-like: don't reset focus)
    if (raw.escape) {
        log('dispatchKey:escape');
        // Try to cancel dialogs first (they have higher z-index than popovers)
        if (handleDialogEscape()) {
            log('dispatchKey:dialogEscapeHandled');
            return true;
        }
        if (closeTopPopover()) {
            log('dispatchKey:popoverClosed');
            return true;
        }
        // No overlay to close - let Escape propagate (don't reset focus, matches browser)
        return false;
    }

    // 5. Handle interactive element keys (summary, anchor)
    if (handleInteractiveKey(activeFocusState.focused, keyEvent)) {
        return true;
    }

    // 6. Handle form control keys (Enter, Space, arrows for select, etc.)
    if (handleFormKey(activeFocusState.focused, keyEvent)) {
        return true;
    }

    // 7. Default scroll behavior: arrow keys scroll when not captured by form elements
    // This runs after form handling so elements that use arrows get priority
    if (handleScrollKeyboard(activeFocusState.focused, keyEvent)) {
        scheduleRender();
        return true;
    }

    return true;
}

export function ensureDefaultFocus(): void {
    if (activeFocusState.focused) return;
    const visibleFocusables = getVisibleFocusables();
    if (visibleFocusables.length === 0) return;
    setFocus(visibleFocusables[0].node);
}

export function getFocused(): CliNode | null {
    return activeFocusState.focused;
}

export function getLiveMessage(): string {
    return activeFocusState.liveMessage;
}

export function announce(message: string): void {
    activeFocusState.liveMessage = message;
    scheduleRender();
}

const NUMBER_INPUT_TYPES = new Set(['number', 'range']);

/**
 * Check if a node is visible for focus purposes.
 * A node is hidden if:
 * - It's inside a closed popover
 * - It has display: none
 * - It has visibility: hidden  
 * - Any ancestor has one of the above
 */
export function isNodeVisible(node: CliNode | null): boolean {
    if (!node) return false;
    
    let current: CliNode | null = node;
    while (current) {
        // Check if this node is a closed popover
        if (hasPopoverBehavior(current) && !isPopoverOpen(current)) {
            return false;
        }
        
        // Check CSS visibility properties
        const computedStyle = getComputedCliStyle(current);
        if (computedStyle.display === 'none') {
            return false;
        }
        if (computedStyle.visibility === 'hidden' || computedStyle.visibility === 'collapse') {
            return false;
        }
        
        // Check inline style as well (may not be in computed style)
        const inlineStyle = current.style;
        if (inlineStyle.display === 'none') {
            return false;
        }
        if (inlineStyle.visibility === 'hidden' || inlineStyle.visibility === 'collapse') {
            return false;
        }
        
        current = current.parent;
    }
    
    return true;
}

/**
 * Check if a node could potentially be focusable (ignoring visibility).
 * Used for registration - we register all potentially focusable nodes
 * and filter by visibility during navigation.
 */
function isPotentiallyFocusable(node: CliNode | null): boolean {
    if (!node) return false;
    if (node.disabled) return false;
    if (node.tabIndex === -1) return false;
    if (node.focusable) return true;
    const tag = getNodeTag(node);
    if (FORM_CONTROL_TAGS.has(tag) || INTERACTIVE_TAGS.has(tag)) {
        return true;
    }
    if (node.tabIndex !== undefined && node.tabIndex !== null) {
        return true;
    }
    return false;
}

/**
 * Check if a node is currently focusable (potentially focusable AND visible).
 * Used when filtering the active focusables list.
 */
function isFocusableNode(node: CliNode | null): boolean {
    return isPotentiallyFocusable(node) && isNodeVisible(node);
}

/**
 * Determine whether the provided input type should be treated as numeric.
 * @param inputType - Lowercase input type string from the CLI node.
 */
function isNumberInputType(inputType?: string): boolean {
    if (!inputType) return false;
    return NUMBER_INPUT_TYPES.has(inputType.toLowerCase());
}

/**
 * Read the buffer (display) value for an input, preferring staged raw content for numbers.
 * @param node - CLI node representing the input element.
 * @param inputType - Lowercase input type string.
 */
function getInputBufferValue(node: any, inputType?: string): string {
    const state = readInputState(node as CliNode);
    return state.rawValue;
}

/**
 * Persist a new buffer value to the input, ensuring bindings are only invoked for non-numeric types.
 * @param node - CLI node representing the input element.
 * @param inputType - Lowercase input type string.
 * @param nextValue - New buffer value to store.
 */
function writeInputBufferValue(node: CliNode, inputType: string, nextValue: string): void {
    node.__rawValue = nextValue;
    node.value = nextValue;
    if (!isNumberInputType(inputType)) {
        node.__setValue?.(nextValue);
    }
    node.onInput?.({ value: nextValue });
    emitInputEvent(node);
}

function resolveStepValue(step: any): number {
    if (typeof step === 'number' && Number.isFinite(step) && step !== 0) {
        return step;
    }
    if (typeof step === 'string') {
        const parsed = Number(step);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed !== 0) {
            return parsed;
        }
    }
    return 1;
}

function validateNode(node: CliNode, inputType?: string): void {
    const value = node.value;
    let valid = true;
    let message = '';

    if (node.required) {
        const str = String(value ?? '');
        if (str.trim().length === 0) {
            valid = false;
            message = 'Required';
        }
    }

    if (valid && typeof node.minLength === 'number' && node.minLength >= 0) {
        const str = String(value ?? '');
        if (str.length < node.minLength) {
            valid = false;
            message = `Min length ${node.minLength}`;
        }
    }

    if (valid && typeof node.maxLength === 'number' && node.maxLength >= 0) {
        const str = String(value ?? '');
        if (str.length > node.maxLength) {
            valid = false;
            message = `Max length ${node.maxLength}`;
        }
    }

    if (valid && typeof node.pattern === 'string' && node.pattern) {
        try {
            const re = new RegExp(node.pattern);
            if (!re.test(String(value ?? ''))) {
                valid = false;
                message = 'Pattern mismatch';
            }
        } catch {
            // ignore invalid regex
        }
    }

    if (valid && (inputType === 'number' || inputType === 'range')) {
        const num = Number(value);
        if (typeof node.min === 'number' && num < node.min) {
            valid = false;
            message = `Min ${node.min}`;
        }
        if (valid && typeof node.max === 'number' && num > node.max) {
            valid = false;
            message = `Max ${node.max}`;
        }
    }

    node.valid = valid;
    node.validationMessage = valid ? '' : message;
    if (!valid) {
        announce(`Invalid: ${message}`);
    } else if (node.dirty === false) {
        activeFocusState.liveMessage = '';
    }
}

function fireChangeOnBlur(node: CliNode | null, reason: 'focus-move' | 'blur' | 'submit' = 'blur'): void {
    if (!node || !node.dirty) return;
    commitIfNeeded(node, node.inputType);
    node.dirty = false;
}

function commitIfNeeded(node: CliNode, inputType?: string): void {
    if (isNumberInputType(inputType)) {
        commitNumber(node, inputType);
        return;
    }
    node.__setValue?.(node.value);
    node.onChange?.({ value: node.value });
    emitChangeEvent(node);
}

function commitNumber(node: CliNode, inputType: string = 'number'): void {
    const raw = getInputBufferValue(node, inputType);
    const num = raw.trim() === '' ? 0 : Number(raw) || 0;
    const min = node.min;
    const max = node.max;
    let next = num;
    if (typeof min === 'number') next = Math.max(min, next);
    if (typeof max === 'number') next = Math.min(max, next);
    node.__committedValue = next;
    node.__rawValue = raw;
    node.__setValue?.(next);
    node.onChange?.({ value: next });
    emitChangeEvent(node, { value: next });
}

function submitForm(node: CliNode): void {
    const formId = node.form;
    const controls = collectFormControls(formId, node);
    const payload: Record<string, any> = {};
    for (const control of controls) {
        const name = control.name;
        if (!name) continue;
        let val: unknown = control.value;
        if (control.inputType === 'checkbox') {
            val = !!control.checked;
        } else if (control.inputType === 'radio') {
            if (!control.checked) continue;
            val = control.__value ?? control.value;
        } else if (control.multiple && Array.isArray(control.options)) {
            val = control.options.filter(o => o.selected).map(o => o.value);
        }
        payload[name] = val;
    }
    announce(`Form submit${formId ? ` (${formId})` : ''}: ${JSON.stringify(payload)}`);
    const formNode = resolveFormNode(node, formId) ?? node;
    emitDomEvent(formNode, 'submit', { bubbles: true, detail: payload });
}

function resetForm(node: CliNode): void {
    const formId = node.form;
    const controls = collectFormControls(formId, node);
    for (const control of controls) {
        const inputType = control.inputType;
        if (inputType === 'checkbox') {
            control.checked = !!control.defaultChecked;
            control.__setChecked?.(control.checked);
        } else if (inputType === 'radio') {
            control.checked = !!control.defaultChecked;
            control.__setChecked?.(control.checked);
        }
        control.__rawValue = String(control.defaultValue ?? '');
        control.value = control.__rawValue;
        control.dirty = false;
        validateNode(control, inputType);
        control.onInput?.({ value: control.value });
        control.onChange?.({ value: control.value });
        emitInputEvent(control);
        emitChangeEvent(control);
    }
    announce(`Form reset${formId ? ` (${formId})` : ''}`);
    const formNode = resolveFormNode(node, formId);
    emitDomEvent(formNode, 'reset', { bubbles: true });
}

function collectFormControls(formId?: string | null, origin?: CliNode): CliNode[] {
    if (formId) {
        return dedupeControls([
            ...collectControlsForFormId(formId),
            ...collectControlsFromDomRoot(lookupNodeById(formId)),
        ]);
    }
    if (origin) {
        const ancestorForm = findAncestorFormNode(origin);
        if (ancestorForm) {
            const ancestorId = ancestorForm.id;
            const domControls = collectControlsFromDomRoot(ancestorForm);
            const attrControls = ancestorId ? collectControlsForFormId(String(ancestorId)) : [];
            return dedupeControls([...domControls, ...attrControls]);
        }
    }
    return [];
}

// Type-ahead timeout in milliseconds (matches browser behavior)
const TYPEAHEAD_TIMEOUT_MS = 1000;

/** Option type for select element */
interface SelectOption {
    label: string;
    value: any;
    disabled?: boolean;
    selected?: boolean;
    textContent?: string;
}

/**
 * Clear the type-ahead buffer and timeout for a select element.
 * @param node - The select node.
 */
function clearTypeahead(node: CliNode): void {
    if (node.__typeaheadTimeout) {
        clearTimeout(node.__typeaheadTimeout);
        node.__typeaheadTimeout = null;
    }
    node.__typeaheadBuffer = '';
}

/**
 * Handle type-ahead navigation in a select dropdown.
 * Appends the typed character to the buffer, searches for a matching option,
 * and resets the buffer after a timeout.
 * 
 * @param node - The select node.
 * @param opts - Array of options (from collectOptions).
 * @param char - The character typed.
 * @returns The index of the matching option, or -1 if no match.
 */
function handleSelectTypeahead(node: CliNode, opts: SelectOption[], char: string): number {
    // Clear existing timeout
    if (node.__typeaheadTimeout) {
        clearTimeout(node.__typeaheadTimeout);
        }
    
    // Append character to buffer
    const buffer = (node.__typeaheadBuffer ?? '') + char.toLowerCase();
    node.__typeaheadBuffer = buffer;
    
    // Set new timeout to clear buffer
    node.__typeaheadTimeout = setTimeout(() => {
        node.__typeaheadBuffer = '';
        node.__typeaheadTimeout = null;
        scheduleRender();
    }, TYPEAHEAD_TIMEOUT_MS);
    
    // Search for matching option (case-insensitive prefix match)
    const currentIdx = node.selectedIndex ?? 0;
    
    // First, try to find a match starting from the current position + 1
    // This allows cycling through options with the same prefix
    for (let i = 1; i <= opts.length; i++) {
        const idx = (currentIdx + i) % opts.length;
        const opt = opts[idx];
        if (opt.disabled) continue;
        
        const label = (opt.label ?? opt.textContent ?? '').toLowerCase();
        if (label.startsWith(buffer)) {
            return idx;
        }
    }
    
    // No match found, but if this is a single character and we're already on a match,
    // stay on current option
    if (buffer.length === 1) {
        const currentOpt = opts[currentIdx];
        if (currentOpt && !currentOpt.disabled) {
            const currentLabel = (currentOpt.label ?? currentOpt.textContent ?? '').toLowerCase();
            if (currentLabel.startsWith(buffer)) {
                return currentIdx;
            }
        }
    }
    
    return -1;
        }

function buildMessage(node: CliNode): string {
    const role = node.role || node.nodeName || '';
    const label = node.label || '';
    const desc = node.description || '';
    const parts = [`Focused: ${label || role}`];
    if (role) parts.push(`(${role})`);
    if (desc) parts.push(`- ${desc}`);
    if (node.validationMessage) {
        parts.push(`! ${String(node.validationMessage)}`);
    }
    return parts.join(' ');
}

/**
 * Unified text input handler for both <input> (text types) and <textarea>.
 * Handles cursor movement, text editing, and validation.
 * 
 * @param node - The input or textarea node.
 * @param event - The keyboard event.
 * @param isMultiline - Whether this is a multiline input (textarea).
 * @param isNumeric - Whether this is a numeric input.
 * @returns true if the event was handled.
 */
function handleTextInput(
    node: CliNode,
    event: KeyPressEvent,
    isMultiline: boolean,
    isNumeric: boolean
): boolean {
    const type = isMultiline ? 'textarea' : (node.inputType || 'text');
    
    const ensureCursor = () => {
        if (typeof node.cursorPosition !== 'number') {
            node.cursorPosition = getInputBufferValue(node, type).length;
            }
    };

    // Backspace
        if (event.key === 'Backspace') {
            const val = getInputBufferValue(node, type);
            ensureCursor();
        const cursor = Math.max(0, node.cursorPosition ?? val.length);
            if (cursor === 0) return true;
            const nextRaw = val.slice(0, cursor - 1) + val.slice(cursor);
        node.cursorPosition = cursor - 1;
        node.selectionStart = node.selectionEnd = node.cursorPosition;
            writeInputBufferValue(node, type, nextRaw);
            validateNode(node, type);
            node.dirty = true;
            scheduleRender();
            return true;
        }

    // Delete
        if (event.key === 'Delete') {
            const val = getInputBufferValue(node, type);
            ensureCursor();
        const cursor = Math.max(0, node.cursorPosition ?? val.length);
            if (cursor >= val.length) return true;
            const nextRaw = val.slice(0, cursor) + val.slice(cursor + 1);
        node.cursorPosition = cursor;
            node.selectionStart = node.selectionEnd = cursor;
            writeInputBufferValue(node, type, nextRaw);
            validateNode(node, type);
            node.dirty = true;
            scheduleRender();
            return true;
        }

    // Left arrow
        if (event.leftArrow) {
            ensureCursor();
        node.cursorPosition = Math.max(0, (node.cursorPosition ?? 0) - 1);
        node.selectionStart = node.selectionEnd = node.cursorPosition;
            scheduleRender();
            return true;
        }

    // Right arrow
        if (event.rightArrow) {
            ensureCursor();
            const len = getInputBufferValue(node, type).length;
        node.cursorPosition = Math.min(len, (node.cursorPosition ?? len) + 1);
        node.selectionStart = node.selectionEnd = node.cursorPosition;
            scheduleRender();
            return true;
        }
        
    // Up/Down arrows - multiline navigation or numeric adjustment
    if (event.upArrow || event.downArrow) {
        if (isMultiline) {
            // Multiline: navigate between lines
            ensureCursor();
            const val = getInputBufferValue(node, type);
            const lines = val.split('\n');
            const cursor = node.cursorPosition ?? val.length;
            
            // Find current line and column
            let charCount = 0;
            let currentLine = 0;
            let currentCol = 0;
            for (let i = 0; i < lines.length; i++) {
                const lineLen = lines[i].length;
                if (charCount + lineLen >= cursor) {
                    currentLine = i;
                    currentCol = cursor - charCount;
                    break;
                }
                charCount += lineLen + 1;
                if (i === lines.length - 1) {
                    currentLine = i;
                    currentCol = lineLen;
                }
            }
            
            const targetLine = event.upArrow
                ? Math.max(0, currentLine - 1)
                : Math.min(lines.length - 1, currentLine + 1);
            
            if (targetLine !== currentLine) {
                const targetLineLen = lines[targetLine].length;
                const targetCol = Math.min(currentCol, targetLineLen);
                
                let newCursor = 0;
                for (let i = 0; i < targetLine; i++) {
                    newCursor += lines[i].length + 1;
                }
                newCursor += targetCol;
                
                node.cursorPosition = newCursor;
                node.selectionStart = node.selectionEnd = newCursor;
                scheduleRender();
            }
            return true;
        } else if (isNumeric) {
            // Numeric: increment/decrement value
            const step = resolveStepValue(node.step);
            const min = node.min;
            const max = node.max;
            const raw = getInputBufferValue(node, type);
            const current = raw.trim() === '' ? 0 : Number(raw) || 0;
            let next = current + (event.upArrow ? step : -step);
            if (typeof min === 'number') next = Math.max(min, next);
            if (typeof max === 'number') next = Math.min(max, next);
            const nextRaw = String(next);
            node.__committedValue = next;
            node.cursorPosition = nextRaw.length;
            node.selectionStart = node.selectionEnd = node.cursorPosition;
            writeInputBufferValue(node, type, nextRaw);
            announce(`Value: ${nextRaw}`);
            validateNode(node, type);
            node.dirty = true;
            scheduleRender();
            return true;
        }
        return false;
    }

    // Home key
        if (event.home) {
            ensureCursor();
            const val = getInputBufferValue(node, type);
            
        if (isMultiline) {
                const lines = val.split('\n');
            const cursor = node.cursorPosition ?? val.length;
                
                let charCount = 0;
                for (let i = 0; i < lines.length; i++) {
                    const lineLen = lines[i].length;
                    if (charCount + lineLen >= cursor) {
                    node.cursorPosition = charCount;
                        node.selectionStart = node.selectionEnd = charCount;
                        break;
                    }
                    charCount += lineLen + 1;
                }
            } else {
            node.cursorPosition = 0;
                node.selectionStart = node.selectionEnd = 0;
            }
            scheduleRender();
            return true;
        }
        
    // End key
        if (event.end) {
            ensureCursor();
            const val = getInputBufferValue(node, type);
            
        if (isMultiline) {
                const lines = val.split('\n');
            const cursor = node.cursorPosition ?? val.length;
                
                let charCount = 0;
                for (let i = 0; i < lines.length; i++) {
                    const lineLen = lines[i].length;
                    if (charCount + lineLen >= cursor || i === lines.length - 1) {
                        const endPos = charCount + lineLen;
                    node.cursorPosition = endPos;
                        node.selectionStart = node.selectionEnd = endPos;
                        break;
                    }
                    charCount += lineLen + 1;
                }
            } else {
            node.cursorPosition = val.length;
                node.selectionStart = node.selectionEnd = val.length;
            }
            scheduleRender();
            return true;
        }
        
    // Printable characters
        const isPrintable =
            event.key.length === 1 &&
            !event.ctrl &&
            !event.meta &&
            !event.tab &&
            !event.escape &&
            !event.return;

        if (isPrintable) {
            const ch = event.key;
            
        // For number inputs, only allow numeric characters
        if (isNumeric) {
                const val = getInputBufferValue(node, type);
                ensureCursor();
            const cursor = Math.max(0, node.cursorPosition ?? val.length);
                
                const isDigit = ch >= '0' && ch <= '9';
                const isMinus = ch === '-' && cursor === 0 && !val.includes('-');
                const isDecimal = ch === '.' && !val.includes('.');
                
                if (!isDigit && !isMinus && !isDecimal) {
                return true; // Ignore non-numeric
                }
                
                const nextRaw = val.slice(0, cursor) + ch + val.slice(cursor);
            node.cursorPosition = cursor + 1;
            node.selectionStart = node.selectionEnd = node.cursorPosition;
                writeInputBufferValue(node, type, nextRaw);
                validateNode(node, type);
                node.dirty = true;
                scheduleRender();
                return true;
            }
            
            const val = getInputBufferValue(node, type);
            ensureCursor();
        const cursor = Math.max(0, node.cursorPosition ?? val.length);
        const maxLength = node.maxLength;
            if (typeof maxLength === 'number' && maxLength >= 0 && val.length >= maxLength) {
                announce(`Invalid: Max length ${maxLength}`);
                return true;
            }
            const nextRaw = val.slice(0, cursor) + ch + val.slice(cursor);
        node.cursorPosition = cursor + 1;
        node.selectionStart = node.selectionEnd = node.cursorPosition;
            writeInputBufferValue(node, type, nextRaw);
            validateNode(node, type);
            node.dirty = true;
            scheduleRender();
            return true;
        }

    // Enter key
        if (event.key === 'Enter') {
        if (isMultiline) {
            // Insert newline
            const val = getInputBufferValue(node, type);
            ensureCursor();
            const cursor = Math.max(0, node.cursorPosition ?? val.length);
            const nextRaw = val.slice(0, cursor) + '\n' + val.slice(cursor);
            node.cursorPosition = cursor + 1;
            node.selectionStart = node.selectionEnd = node.cursorPosition;
            writeInputBufferValue(node, type, nextRaw);
            node.dirty = true;
            scheduleRender();
            return true;
        } else {
            // Commit value
            if (node.dirty) {
                commitIfNeeded(node, type);
                    validateNode(node, type);
                    announce(`Value: ${getInputBufferValue(node, type)}`);
                node.dirty = false;
                }
                return true;
        }
        }

    // Tab
        if (event.tab) {
        fireChangeOnBlur(node, 'focus-move');
            moveFocus(event.shift ? 'prev' : 'next');
            return true;
        }

        return false;
}

/**
 * Handle keyboard events for interactive elements (summary, a).
 * These are focusable elements that aren't form controls.
 */
function handleInteractiveKey(node: CliNode, event: KeyPressEvent): boolean {
    const tag = node.nodeName;
    
    // Handle summary element (toggle parent details)
    if (tag === 'summary') {
        if (event.key === ' ' || event.key === 'Enter') {
            const detailsParent = node.parent;
            if (detailsParent && detailsParent.nodeName === 'details') {
                const openProp = detailsParent as CliNode & { open?: boolean };
                openProp.open = !openProp.open;
                scheduleRender();
            }
            return true;
        }
        return false;
    }
    
    // Handle anchor elements
    if (tag === 'a') {
        if (event.key === 'Enter') {
            emitMouse(node, 'click');
            return true;
        }
        return false;
    }
    
    return false;
}

/**
 * Handle keyboard events for form controls (input, select, textarea, button, label).
 */
function handleFormKey(node: CliNode, event: KeyPressEvent): boolean {
    const tag = node.nodeName;
    const type = (node.inputType || '').toLowerCase();
    if (tag !== 'input' && node.disabled) return true;

    if (tag === 'input') {
        const inputState = readInputState(node);

        if (inputState.disabled) {
            return true;
        }

        if (inputState.readonly && event.key.length === 1) {
            return true;
        }

        if (type === 'checkbox') {
            if (event.key === ' ' || event.key === 'Enter') {
                const next = !node.checked;
                node.checked = next;
                node.__setChecked?.(next);
                // Handle checkbox group bindings (Svelte bind:group)
                const bindingGroup = node.__bindingGroup;
                if (Array.isArray(bindingGroup)) {
                    let groupValue = node.__groupGet?.() ?? [];
                    groupValue = Array.isArray(groupValue) ? groupValue : [];
                    const val = node.__value ?? node.value;
                    if (next) {
                        if (!groupValue.includes(val)) groupValue = [...groupValue, val];
                    } else {
                        groupValue = groupValue.filter((v: unknown) => v !== val);
                    }
                    node.__groupSet?.(groupValue);
                    for (const input of bindingGroup) {
                        if (input !== node) {
                            input.checked = groupValue.includes(input.__value ?? input.value);
                        }
                    }
                }
                node.onChange?.({ value: next });
                emitChangeEvent(node, { value: next });
                announce(`Checked: ${next}`);
                validateNode(node, type);
                scheduleRender();
                return true;
            }
            return false;
        }

        if (type === 'radio') {
            if (event.key === ' ' || event.key === 'Enter') {
                const name = node.name || '__default';
                activeFocusState.radioGroups[name] ??= new Set();
                activeFocusState.radioGroups[name].forEach(n => {
                    n.checked = false;
                    n.__setChecked?.(false);
                });
                node.checked = true;
                activeFocusState.radioGroups[name].add(node);
                node.__setChecked?.(true);
                // Handle radio group bindings (Svelte bind:group)
                const bindingGroup = node.__bindingGroup;
                if (Array.isArray(bindingGroup)) {
                    const val = node.__value ?? node.value;
                    node.__groupSet?.(val);
                    for (const input of bindingGroup) {
                        if (input !== node) {
                            input.checked = (input.__value ?? input.value) === val;
                        }
                    }
                }
                node.onChange?.({ value: node.value });
                emitChangeEvent(node, { value: node.value });
                announce(`Selected: ${node.label ?? node.value ?? 'option'}`);
                scheduleRender();
                return true;
            }
            return false;
        }

        if (type === 'button' || type === 'submit') {
            if (event.key === ' ' || event.key === 'Enter') {
                node.onKeyDown?.(event);
                node.onChange?.({ value: true });
                emitChangeEvent(node, { value: true });
                emitMouse(node, 'click');
                return true;
            }
            return false;
        }

        // Text input types use unified handler
        return handleTextInput(node, event, false, type === 'number');
    }

    if (tag === 'textarea') {
        if (node.disabled) {
            return true;
        }
        if (node.readonly && event.key.length === 1) {
            return true;
        }
        return handleTextInput(node, event, true, false);
    }

    if (tag === 'select') {
        const opts = collectOptions(node);
        if (opts.length === 0) return false;
        if (node.disabled) return true;
        const multiple = Boolean(node.multiple);
        const dropdownOpen = multiple ? true : Boolean(node.__dropdownOpen);
        if (!multiple && event.escape && dropdownOpen) {
            node.__dropdownOpen = false;
            clearTypeahead(node);
            scheduleRender();
            return true;
        }
        if (!multiple && (event.key === 'Enter' || event.key === ' ') && !dropdownOpen) {
            node.__dropdownOpen = true;
            scheduleRender();
            return true;
        }
        if (event.tab) {
            node.__dropdownOpen = false;
            clearTypeahead(node);
            fireChangeOnBlur(node, 'focus-move');
            moveFocus(event.shift ? 'prev' : 'next');
            return true;
        }

        let idx = node.selectedIndex ?? 0;
        const findNext = (start: number, dir: number) => {
            let i = start;
            for (let count = 0; count < opts.length; count++) {
                i = (i + dir + opts.length) % opts.length;
                if (!opts[i].disabled) return i;
            }
            return start;
        };

        if (event.upArrow) {
            idx = findNext(idx, -1);
            clearTypeahead(node);
        } else if (event.downArrow) {
            idx = findNext(idx, 1);
            clearTypeahead(node);
        } else if (event.key === 'Enter' || event.key === ' ') {
            if (multiple) {
                const target = opts[idx];
                target.selected = !target.selected;
                const values = opts.filter(o => o.selected).map(o => o.value);
                node.__setValue?.(values);
                node.onInput?.({ value: values });
                emitInputEvent(node);
                node.onChange?.({ value: values });
                emitChangeEvent(node, { value: values });
                announce(`Selected: ${values.join(', ') || 'none'}`);
            } else {
                node.onChange?.({ value: opts[idx].value });
                emitChangeEvent(node, { value: opts[idx].value });
                announce(`Selected: ${opts[idx].label}`);
                node.__setValue?.(opts[idx].value);
                node.__dropdownOpen = false;
                clearTypeahead(node);
            }
            scheduleRender();
            return true;
        } else if (dropdownOpen && event.key.length === 1 && !event.ctrl && !event.alt && !event.meta) {
            // Type-ahead: search for matching option
            const matchedIdx = handleSelectTypeahead(node, opts, event.key);
            if (matchedIdx !== -1) {
                idx = matchedIdx;
            }
        } else if (!dropdownOpen && !multiple) {
            return false;
        }

        node.selectedIndex = idx;
        if (!multiple) {
            node.__setValue?.(opts[idx].value);
            node.onInput?.({ value: opts[idx].value });
            emitInputEvent(node);
            announce(`Selected: ${opts[idx].label}`);
            node.onChange?.({ value: opts[idx].value });
            emitChangeEvent(node, { value: opts[idx].value });
            validateNode(node, type);
        }
        scheduleRender();
        return true;
    }

    if (tag === 'label') {
        if (event.key === ' ' || event.key === 'Enter') {
            const htmlFor = node.htmlFor;
            if (htmlFor) {
                const target = lookupNodeById(htmlFor);
                if (target && !target.disabled) {
                    setFocus(target);
                    return true;
                }
            }
            const descendant = findFocusableDescendant(node);
            if (descendant) {
                setFocus(descendant);
                return true;
            }
            emitMouse(node, 'click');
        }
    }

    if (tag === 'button') {
        if (event.key === ' ' || event.key === 'Enter') {
            // Button type is stored in inputType (from the HTML type attribute)
            const btnType = (node.inputType || 'button').toLowerCase();
            if (btnType === 'reset') {
                resetForm(node);
            } else if (btnType === 'submit') {
                submitForm(node);
            }
            node.onChange?.({ value: true });
            emitChangeEvent(node, { value: true });
            node.onKeyDown?.(event);
            emitMouse(node, 'click');
            scheduleRender();
            return true;
        }
    }

    return false;
}

/**
 * Locate the first focusable descendant of a label that is not disabled.
 * @param node - Label node to search beneath.
 */
function findFocusableDescendant(node: CliNode): CliNode | null {
    const queue: CliNode[] = [...getNodeChildren(node)];
    while (queue.length) {
        const current = queue.shift()!;
        if (current.focusable && !current.disabled) {
            return current;
        }
        const nextChildren = getNodeChildren(current);
        if (nextChildren.length) {
            queue.push(...nextChildren);
        }
    }
    return null;
}

function collectControlsFromDomRoot(root?: CliNode | null): CliNode[] {
    if (!root || getNodeTag(root) !== FORM_TAG_NAME) return [];
    const result: CliNode[] = [];
    const stack: CliNode[] = [];
    const children = getNodeChildren(root);
    stack.push(...children);
    while (stack.length) {
        const current = stack.pop()!;
        const tag = getNodeTag(current);
        if (tag === FORM_TAG_NAME) {
            continue;
        }
        if (isFormControlNode(current)) {
            result.push(current);
        }
        const descendants = getNodeChildren(current);
        if (descendants.length) {
            stack.push(...descendants);
        }
    }
    return result;
}

function collectControlsForFormId(formId: string): CliNode[] {
    const selector = `[form="${escapeAttributeSelector(formId)}"]`;
    const domMatches = document?.querySelectorAll?.(selector) ?? [];
    const domControls = Array.from(domMatches)
        .map(node => getCliNode(node as unknown as Node))
        .filter((node): node is CliNode => Boolean(node) && isFormControlNode(node));
    const associated = activeFocusState.formAssociations.get(formId);
    const fallback = associated ? Array.from(associated) : [];
    return dedupeControls([...domControls, ...fallback]);
}

function findAncestorFormNode(node: CliNode): CliNode | null {
    let current = node.parent;
    while (current) {
        if (getNodeTag(current) === FORM_TAG_NAME) {
            return current;
        }
        current = current.parent;
    }
    return null;
}

function resolveFormNode(origin: CliNode, formId?: string | null): CliNode | null {
    if (formId) {
        const resolved = lookupNodeById(formId);
        if (resolved) return resolved;
    }
    return findAncestorFormNode(origin);
}

function dedupeControls(nodes: Array<CliNode | undefined>): CliNode[] {
    const seen = new Set<CliNode>();
    const result: CliNode[] = [];
    for (const node of nodes) {
        if (!node) continue;
        if (!seen.has(node)) {
            seen.add(node);
            result.push(node);
        }
    }
    return result;
}

function isFormControlNode(node?: CliNode | null): boolean {
    if (!node) return false;
    return FORM_CONTROL_TAGS.has(getNodeTag(node));
}

function lookupNodeById(id?: string | null): CliNode | null {
    if (!id) return null;
    const domNode = document?.getElementById?.(id) ?? null;
    return getCliNode(domNode as Node | null);
}

const cssEscape: ((value: string) => string) | undefined =
    typeof globalThis.CSS?.escape === 'function' ? globalThis.CSS.escape : undefined;

function escapeAttributeSelector(value: string): string {
    if (cssEscape) {
        return cssEscape(value);
    }
    return value.replace(/["\\]/g, '\\$&');
}

export function updateFormAssociation(node: CliNode, formId?: string | null): void {
    const nodeSymbols = node as unknown as Record<symbol, string | null>;
    const previous = nodeSymbols[FORM_ASSOC_KEY];
    if (previous && activeFocusState.formAssociations.has(previous)) {
        const set = activeFocusState.formAssociations.get(previous)!;
        set.delete(node);
        if (set.size === 0) {
            activeFocusState.formAssociations.delete(previous);
        }
    }
    if (formId) {
        const normalized = String(formId);
        let set = activeFocusState.formAssociations.get(normalized);
        if (!set) {
            set = new Set();
            activeFocusState.formAssociations.set(normalized, set);
        }
        set.add(node);
        nodeSymbols[FORM_ASSOC_KEY] = normalized;
    } else {
        nodeSymbols[FORM_ASSOC_KEY] = null;
    }
}

/**
 * Collect selectable options from a select element for keyboard navigation.
 * This returns only actual options (not optgroups), with proper disabled state
 * inherited from parent optgroups.
 */
function collectOptions(node: CliNode): SelectOption[] {
    const result: SelectOption[] = [];
    
    function processChildren(parent: CliNode, groupDisabled: boolean): void {
        for (const child of getNodeChildren(parent)) {
            const tag = getNodeTag(child);
            if (tag === 'optgroup') {
                // Process children of optgroup, inheriting disabled state
                const isDisabled = groupDisabled || !!child.disabled;
                processChildren(child, isDisabled);
            } else if (tag === 'option') {
                const label = child.textContent ?? child.value ?? '';
                const value = child.value ?? label;
                result.push({
                    label: String(label).trim(),
                    value,
                    disabled: groupDisabled || !!child.disabled,
                    selected: !!child.selected,
                });
        }
    }
    }
    
    processChildren(node, false);
    
    if (result.length === 0 && Array.isArray(node.options)) {
        return node.options as SelectOption[];
    }
    return result;
}

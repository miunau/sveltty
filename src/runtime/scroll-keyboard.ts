/**
 * Scroll Keyboard Configuration
 * 
 * Provides browser-like keyboard scrolling with CSS customization.
 * 
 * Modes (--scroll-keyboard):
 * - 'auto' (default): Arrow keys scroll unless element captures them (browser-like)
 * - 'enabled': Use explicit key bindings from --scroll-key-* properties
 * - 'disabled': No keyboard scrolling
 * 
 * Key format for explicit bindings: "modifier+key" where modifier is ctrl, alt, 
 * shift, meta, or combinations like "ctrl+shift+k". Multiple keys separated by ", ".
 */

import type { CliNode, KeyPressEvent } from './types.js';
import { 
    isScrollContainer, 
    findScrollParent, 
    getScrollState, 
    scrollBy, 
    setScrollPosition,
    getMaxScroll,
} from './scroll.js';

/**
 * Scroll keyboard mode.
 */
export type ScrollKeyboardMode = 'auto' | 'enabled' | 'disabled';

/**
 * Scroll actions that can be configured via CSS.
 */
export type ScrollAction = 
    | 'up'
    | 'down'
    | 'pageUp'
    | 'pageDown'
    | 'halfUp'
    | 'halfDown'
    | 'top'
    | 'bottom';

/**
 * Resolved key bindings for a scroll container.
 * Each action can have multiple key patterns.
 */
export interface ScrollKeyBindings {
    /** Scroll up by one line. */
    up?: string[];
    /** Scroll down by one line. */
    down?: string[];
    /** Scroll up by one page (viewport height). */
    pageUp?: string[];
    /** Scroll down by one page (viewport height). */
    pageDown?: string[];
    /** Scroll up by half page. */
    halfUp?: string[];
    /** Scroll down by half page. */
    halfDown?: string[];
    /** Scroll to top. */
    top?: string[];
    /** Scroll to bottom. */
    bottom?: string[];
}

/**
 * Mapping from CSS property names to ScrollAction keys.
 */
const CSS_PROP_TO_ACTION: Record<string, ScrollAction> = {
    scrollKeyUp: 'up',
    scrollKeyDown: 'down',
    scrollKeyPageUp: 'pageUp',
    scrollKeyPageDown: 'pageDown',
    scrollKeyHalfUp: 'halfUp',
    scrollKeyHalfDown: 'halfDown',
    scrollKeyTop: 'top',
    scrollKeyBottom: 'bottom',
};

/**
 * Mapping from shorthand action names to ScrollAction keys.
 * Used in --scroll-keys shorthand property.
 */
const SHORTHAND_ACTION_MAP: Record<string, ScrollAction> = {
    'up': 'up',
    'down': 'down',
    'page-up': 'pageUp',
    'page-down': 'pageDown',
    'half-up': 'halfUp',
    'half-down': 'halfDown',
    'top': 'top',
    'bottom': 'bottom',
};

/**
 * Element types that capture arrow keys for their own use.
 */
const ARROW_CAPTURING_TYPES = new Set([
    'number',
    'range',
]);

/**
 * Check if an element captures arrow keys for its own behavior.
 * These elements should not trigger default scrolling on arrow keys.
 * 
 * @param node - The focused node to check
 * @returns True if the element uses arrow keys internally
 */
export function elementCapturesArrows(node: CliNode): boolean {
    const tag = (node.nodeName ?? '').toLowerCase();
    const type = (node.inputType || node.type || '').toLowerCase();
    
    // textarea uses up/down for cursor movement
    if (tag === 'textarea') {
        return true;
    }
    
    // select uses up/down for option navigation
    if (tag === 'select') {
        return true;
    }
    
    // input types that use arrows
    if (tag === 'input' && ARROW_CAPTURING_TYPES.has(type)) {
        return true;
    }
    
    return false;
}

/**
 * Get the scroll keyboard mode for a node or its scroll parent.
 * Walks up the tree to find the nearest scroll container with a mode setting.
 * 
 * @param node - Starting node
 * @returns The scroll keyboard mode (defaults to 'auto')
 */
export function getScrollKeyboardMode(node: CliNode): ScrollKeyboardMode {
    let current: CliNode | null = node;
    
    while (current) {
        if (isScrollContainer(current)) {
            const cssStyle = current.__cssStyle ?? {};
            const inlineStyle = current.style ?? {};
            const mode = cssStyle.scrollKeyboard ?? inlineStyle.scrollKeyboard;
            
            if (mode === 'disabled') return 'disabled';
            if (mode === 'enabled') return 'enabled';
            // 'auto' or undefined means auto mode
            return 'auto';
        }
        current = current.parent;
    }
    
    // No scroll container found, default to auto
    return 'auto';
}

/**
 * Parse a CSS key binding value into an array of key patterns.
 * Handles multiple keys separated by ", ".
 * 
 * @param value - CSS value like "ctrl+u" or "ctrl+u, PageUp"
 * @returns Array of key patterns
 */
export function parseKeyBinding(value: string): string[] {
    if (!value || typeof value !== 'string') return [];
    
    return value
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(s => s.length > 0);
}

/**
 * Parse the shorthand --scroll-keys property.
 * Format: "action:key, action:key" e.g. "page-up:ctrl+u, page-down:ctrl+d"
 * 
 * @param value - Shorthand CSS value
 * @returns Partial ScrollKeyBindings
 */
export function parseScrollKeysShorthand(value: string): Partial<ScrollKeyBindings> {
    if (!value || typeof value !== 'string') return {};
    
    const bindings: Partial<ScrollKeyBindings> = {};
    const pairs = value.split(',').map(s => s.trim());
    
    for (const pair of pairs) {
        const colonIdx = pair.indexOf(':');
        if (colonIdx === -1) continue;
        
        const actionName = pair.slice(0, colonIdx).trim().toLowerCase();
        const keyPattern = pair.slice(colonIdx + 1).trim().toLowerCase();
        
        if (!actionName || !keyPattern) continue;
        
        const action = SHORTHAND_ACTION_MAP[actionName];
        if (!action) continue;
        
        if (!bindings[action]) {
            bindings[action] = [];
        }
        bindings[action]!.push(keyPattern);
    }
    
    return bindings;
}

/**
 * Get resolved key bindings for a scroll container.
 * Returns null if keyboard scrolling is not in 'enabled' mode.
 * 
 * @param node - The scroll container node
 * @returns Resolved key bindings or null
 */
export function getScrollKeyBindings(node: CliNode): ScrollKeyBindings | null {
    const cssStyle = node.__cssStyle ?? {};
    const inlineStyle = node.style ?? {};
    
    // Only return bindings in 'enabled' mode
    const scrollKeyboard = cssStyle.scrollKeyboard ?? inlineStyle.scrollKeyboard;
    if (scrollKeyboard !== 'enabled') {
        return null;
    }
    
    const bindings: ScrollKeyBindings = {};
    
    // Parse shorthand property first (lower specificity)
    const shorthandValue = cssStyle.scrollKeys ?? inlineStyle.scrollKeys;
    if (shorthandValue) {
        const shorthandBindings = parseScrollKeysShorthand(shorthandValue);
        Object.assign(bindings, shorthandBindings);
    }
    
    // Parse individual properties (higher specificity, override shorthand)
    const cssRecord = cssStyle as Record<string, unknown>;
    const inlineRecord = inlineStyle as Record<string, unknown>;
    for (const [cssProp, action] of Object.entries(CSS_PROP_TO_ACTION)) {
        const value = cssRecord[cssProp] ?? inlineRecord[cssProp];
        if (typeof value === 'string') {
            bindings[action] = parseKeyBinding(value);
        }
    }
    
    return bindings;
}

/**
 * Normalize a key event into a comparable pattern string.
 * 
 * @param event - Key press event
 * @returns Normalized key pattern like "ctrl+k" or "shift+pageup"
 */
function normalizeKeyEvent(event: KeyPressEvent): string {
    const parts: string[] = [];
    
    if (event.ctrl) parts.push('ctrl');
    if (event.alt) parts.push('alt');
    if (event.shift) parts.push('shift');
    if (event.meta) parts.push('meta');
    
    // Normalize the key name
    let keyName = event.key.toLowerCase();
    
    // Handle special keys
    if (event.upArrow) keyName = 'arrowup';
    else if (event.downArrow) keyName = 'arrowdown';
    else if (event.leftArrow) keyName = 'arrowleft';
    else if (event.rightArrow) keyName = 'arrowright';
    else if (event.home) keyName = 'home';
    else if (event.end) keyName = 'end';
    else if (event.return) keyName = 'enter';
    else if (event.backspace) keyName = 'backspace';
    else if (event.delete) keyName = 'delete';
    else if (event.tab) keyName = 'tab';
    else if (event.escape) keyName = 'escape';
    
    // Handle PageUp/PageDown which come as key names
    if (keyName === 'pageup' || keyName === 'page_up' || keyName === 'page up') {
        keyName = 'pageup';
    } else if (keyName === 'pagedown' || keyName === 'page_down' || keyName === 'page down') {
        keyName = 'pagedown';
    }
    
    parts.push(keyName);
    
    return parts.join('+');
}

/**
 * Check if a key event matches a binding pattern.
 * 
 * @param event - Key press event
 * @param pattern - Key pattern like "ctrl+k" or "pageup"
 * @returns True if event matches pattern
 */
export function matchesKeyBinding(event: KeyPressEvent, pattern: string): boolean {
    const eventPattern = normalizeKeyEvent(event);
    const normalizedPattern = pattern.toLowerCase().replace(/\s+/g, '');
    
    // Handle "g g" style patterns (sequence of keys) - not implemented yet
    if (normalizedPattern.includes(' ')) {
        // For now, skip sequence patterns
        return false;
    }
    
    return eventPattern === normalizedPattern;
}

/**
 * Scroll a container by a delta, with chaining to parent containers at boundaries.
 * When the inner container reaches its scroll boundary, the scroll action bubbles
 * to the next outer scroll container.
 * 
 * @param scrollContainer - The scroll container to scroll
 * @param deltaX - Horizontal delta
 * @param deltaY - Vertical delta
 * @returns True if any scrolling occurred
 */
export function scrollByWithChaining(
    scrollContainer: CliNode,
    deltaX: number,
    deltaY: number
): boolean {
    const state = getScrollState(scrollContainer);
    const { maxScrollTop, maxScrollLeft } = getMaxScroll(scrollContainer);
    
    // Check if we can scroll in the requested direction
    let canScroll = false;
    
    if (deltaY < 0 && state.scrollTop > 0) {
        canScroll = true;
    } else if (deltaY > 0 && state.scrollTop < maxScrollTop) {
        canScroll = true;
    }
    
    if (deltaX < 0 && state.scrollLeft > 0) {
        canScroll = true;
    } else if (deltaX > 0 && state.scrollLeft < maxScrollLeft) {
        canScroll = true;
    }
    
    if (canScroll) {
        scrollBy(scrollContainer, deltaX, deltaY);
        return true;
    }
    
    // Can't scroll this container, try parent
    const parentScroller = findScrollParent(scrollContainer);
    if (parentScroller) {
        return scrollByWithChaining(parentScroller, deltaX, deltaY);
    }
    
    return false;
}

/**
 * Execute a scroll action on a scroll container with chaining.
 * 
 * @param scrollContainer - The scroll container node
 * @param action - The scroll action to execute
 * @returns True if action was executed (scrolling occurred)
 */
function executeScrollAction(scrollContainer: CliNode, action: ScrollAction): boolean {
    const state = getScrollState(scrollContainer);
    const { clientHeight, scrollHeight } = state;
    
    switch (action) {
        case 'up':
            return scrollByWithChaining(scrollContainer, 0, -1);
            
        case 'down':
            return scrollByWithChaining(scrollContainer, 0, 1);
            
        case 'pageUp':
            return scrollByWithChaining(scrollContainer, 0, -clientHeight);
            
        case 'pageDown':
            return scrollByWithChaining(scrollContainer, 0, clientHeight);
            
        case 'halfUp':
            return scrollByWithChaining(scrollContainer, 0, -Math.floor(clientHeight / 2));
            
        case 'halfDown':
            return scrollByWithChaining(scrollContainer, 0, Math.floor(clientHeight / 2));
            
        case 'top':
            setScrollPosition(scrollContainer, { top: 0 });
            return true;
            
        case 'bottom': {
            const maxScroll = Math.max(0, scrollHeight - clientHeight);
            setScrollPosition(scrollContainer, { top: maxScroll });
            return true;
        }
            
        default:
            return false;
    }
}

/**
 * Handle explicit scroll keyboard bindings (--scroll-keyboard: enabled mode).
 * Checks if the event matches any configured key bindings and executes
 * the corresponding scroll action.
 * 
 * @param node - The focused node (will find scroll parent)
 * @param event - Key press event
 * @returns True if the event was handled
 */
export function handleExplicitScrollKeyboard(node: CliNode, event: KeyPressEvent): boolean {
    // Find the scroll container - either the node itself or its parent
    const scrollContainer = isScrollContainer(node) ? node : findScrollParent(node);
    if (!scrollContainer) {
        return false;
    }
    
    // Get key bindings for this scroll container (only in 'enabled' mode)
    const bindings = getScrollKeyBindings(scrollContainer);
    if (!bindings) {
        return false;
    }
    
    // Check each action's bindings
    for (const action of Object.keys(bindings) as ScrollAction[]) {
        const patterns = bindings[action];
        if (!patterns) continue;
        
        for (const pattern of patterns) {
            if (matchesKeyBinding(event, pattern)) {
                return executeScrollAction(scrollContainer, action);
            }
        }
    }
    
    return false;
}

/**
 * Handle default browser-like scroll behavior (--scroll-keyboard: auto mode).
 * Arrow up/down scroll by one line unless the focused element captures them.
 * 
 * @param node - The focused node
 * @param event - Key press event
 * @returns True if scrolling was performed
 */
export function handleDefaultScroll(node: CliNode, event: KeyPressEvent): boolean {
    // Only handle arrow up/down without modifiers in auto mode
    if (event.ctrl || event.alt || event.meta || event.shift) {
        return false;
    }
    
    // Check if this element captures arrow keys
    if (elementCapturesArrows(node)) {
        return false;
    }
    
    // Check mode - only proceed in 'auto' mode
    const mode = getScrollKeyboardMode(node);
    if (mode !== 'auto') {
        return false;
    }
    
    // Find scroll container
    const scrollContainer = isScrollContainer(node) ? node : findScrollParent(node);
    if (!scrollContainer) {
        return false;
    }
    
    // Handle arrow keys
    if (event.upArrow) {
        return scrollByWithChaining(scrollContainer, 0, -1);
    }
    if (event.downArrow) {
        return scrollByWithChaining(scrollContainer, 0, 1);
    }
    
    return false;
}

/**
 * Handle scroll keyboard events.
 * Supports both explicit bindings mode and auto (browser-like) mode.
 * 
 * @param node - The focused node
 * @param event - Key press event
 * @returns True if the event was handled
 */
export function handleScrollKeyboard(node: CliNode, event: KeyPressEvent): boolean {
    const mode = getScrollKeyboardMode(node);
    
    if (mode === 'disabled') {
        return false;
    }
    
    if (mode === 'enabled') {
        return handleExplicitScrollKeyboard(node, event);
    }
    
    // Auto mode: try explicit bindings first (if any), then default behavior
    if (handleExplicitScrollKeyboard(node, event)) {
        return true;
    }
    
    return handleDefaultScroll(node, event);
}

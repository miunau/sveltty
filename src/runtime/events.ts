import type { CliNode, InputEventDetail } from './types.js';
import type { RawKey } from './input/keyboard.js';
import { dispatchNodeEvent } from './operations.js';
import { getDomNode } from './dom/happy.js';
import { window } from './dom/document.js';
import { activatePopoverControl } from './popover.js';

/**
 * Event init options for DOM events.
 */
export interface DomEventInit {
    bubbles?: boolean;
    cancelable?: boolean;
    detail?: unknown;
}

/**
 * Emit a DOM event on a CLI node.
 * 
 * @param node - Target node for the event.
 * @param type - Event type (e.g., 'click', 'input').
 * @param init - Event initialization options.
 * @returns The dispatched Event, or the init object if node has no DOM representation.
 */
export function emitDomEvent(node: CliNode | null, type: string, init: DomEventInit = {}): Event {
    return dispatchNodeEvent(node, type, init);
}

/**
 * Emit a focus event on a node.
 * Focus events do not bubble.
 */
export function emitFocus(node: CliNode): FocusEvent {
    return emitDomEvent(node, 'focus', { bubbles: false }) as FocusEvent;
}

/**
 * Emit a blur event on a node.
 * Blur events do not bubble.
 */
export function emitBlur(node: CliNode): FocusEvent {
    return emitDomEvent(node, 'blur', { bubbles: false }) as FocusEvent;
}

/**
 * Emit an input event on a form control.
 * Input events bubble.
 * 
 * @param node - The form control node.
 * @param detail - Optional event detail. Defaults to { value: node.value }.
 */
export function emitInputEvent(node: CliNode, detail?: InputEventDetail): Event {
    return emitDomEvent(node, 'input', { bubbles: true, detail: detail ?? { value: node.value } });
}

/**
 * Emit a change event on a form control.
 * Change events bubble.
 * 
 * @param node - The form control node.
 * @param detail - Optional event detail. Defaults to { value: node.value }.
 */
export function emitChangeEvent(node: CliNode, detail?: InputEventDetail): Event {
    return emitDomEvent(node, 'change', { bubbles: true, detail: detail ?? { value: node.value } });
}

/**
 * Emit a keyboard event on a node.
 * 
 * @param node - Target node.
 * @param type - Event type ('keydown', 'keyup', 'keypress').
 * @param raw - Raw key data from input.
 * @returns The KeyboardEvent, or null if node has no DOM representation.
 */
export function emitKeyboardEvent(node: CliNode, type: string, raw: RawKey): KeyboardEvent | null {
    const dom = getDomNode(node);
    if (!dom) return null;
    // happy-dom's KeyboardEvent type differs from standard DOM
    const eventInit = {
        key: raw.key,
        code: raw.code,
        ctrlKey: raw.ctrl,
        shiftKey: raw.shift,
        altKey: raw.alt,
        metaKey: raw.meta,
        repeat: raw.repeat,
        bubbles: true,
        cancelable: true,
    };
    // happy-dom expects IKeyboardEventInit, not standard KeyboardEventInit
    const event = new window.KeyboardEvent(type, eventInit as never);
    dom.dispatchEvent(event as unknown as Event);
    return event as unknown as KeyboardEvent;
}

/**
 * Emit a mouse event on a node.
 * Also triggers Svelte's delegated event handlers and popover activation on click.
 * 
 * @param node - Target node.
 * @param type - Event type ('click', 'mousedown', 'mouseup', etc.).
 * @param init - MouseEvent initialization options.
 * @returns The MouseEvent, or null if node has no DOM representation.
 */
export function emitMouse(node: CliNode, type: string, init: MouseEventInit = {}): MouseEvent | null {
    const dom = getDomNode(node);
    if (!dom) return null;
    // happy-dom's MouseEvent type differs from standard DOM
    const eventInit = {
        bubbles: true,
        cancelable: true,
        ...init,
    };
    // happy-dom expects IMouseEventInit, not standard MouseEventInit
    const event = new window.MouseEvent(type, eventInit as never);
    dom.dispatchEvent(event as unknown as Event);
    
    // Call Svelte's delegated event handler if present
    // Svelte 5 sets __eventname on the CLI node (not DOM node)
    const handlerKey = `__${type}`;
    const cliHandler = (node as unknown as Record<string, unknown>)[handlerKey];
    const domHandler = (dom as unknown as Record<string, unknown>)[handlerKey];
    
    if (typeof cliHandler === 'function' && !event.defaultPrevented) {
        (cliHandler as (e: Event) => void).call(node, event as unknown as Event);
    } else if (typeof domHandler === 'function' && !event.defaultPrevented) {
        (domHandler as (e: Event) => void).call(dom, event as unknown as Event);
    }
    
    if (type === 'click' && !event.defaultPrevented) {
        activatePopoverControl(node);
    }
    return event as unknown as MouseEvent;
}

/**
 * Emit a pointer event on a node.
 * Falls back to mouse event if PointerEvent is not available.
 * 
 * @param node - Target node.
 * @param type - Event type ('pointerdown', 'pointerup', etc.).
 * @param init - PointerEvent initialization options.
 * @returns The PointerEvent or MouseEvent, or null if node has no DOM representation.
 */
export function emitPointer(node: CliNode, type: string, init: PointerEventInit = {}): PointerEvent | MouseEvent | null {
    const dom = getDomNode(node);
    if (!dom) return null;
    if (typeof window.PointerEvent === 'function') {
        // happy-dom's PointerEvent type differs from standard DOM
        const eventInit = {
            bubbles: true,
            cancelable: true,
            ...init,
        };
        // happy-dom expects IPointerEventInit, not standard PointerEventInit
        const pointer = new window.PointerEvent(type, eventInit as never);
        dom.dispatchEvent(pointer as unknown as Event);
        return pointer as unknown as PointerEvent;
    }
    return emitMouse(node, type, init);
}

/**
 * Emit a scroll event on a node.
 * Scroll events do not bubble per DOM specification.
 * 
 * @param node - The scroll container node.
 * @returns The dispatched Event.
 */
export function emitScrollEvent(node: CliNode): Event {
    return emitDomEvent(node, 'scroll', { bubbles: false });
}

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
    create_element,
    create_root,
    create_text,
    append,
    free_node,
    set_attribute,
    listen,
} from '../src/runtime/index.js';
import { from_html } from '../src/runtime/client/template.js';
import { child, sibling } from '../src/runtime/client/traversal.js';
import { event } from '../src/runtime/client/events.js';
import { emitMouse } from '../src/runtime/events.js';
import { getDomNode } from '../src/runtime/dom/happy.js';
import type { RawKey } from '../src/runtime/input/keyboard.js';
import {
    dispatchKey,
    getFocused,
    registerFocusable,
    setFocus,
    unregisterFocusable,
    resetFocusState,
} from '../src/runtime/focus.js';
import { mountIntoDocument, trackNode, cleanupTestNodes } from '../test-utils/dom.js';

function baseKey(): RawKey {
    return {
        key: '',
        code: '',
        sequence: '',
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
        repeat: false,
        escape: false,
        enter: false,
        tab: false,
        backspace: false,
        delete: false,
        upArrow: false,
        downArrow: false,
        leftArrow: false,
        rightArrow: false,
        home: false,
        end: false,
    };
}

function makeKey(overrides: Partial<RawKey>): RawKey {
    return { ...baseKey(), ...overrides };
}

describe('form submission', () => {
    afterEach(() => {
        cleanupTestNodes();
        resetFocusState();
    });

    it('registers event listener with correct signature', () => {
        const root = trackNode(create_root());
        const form = trackNode(create_element('form'));
        append(root, form);
        mountIntoDocument(root);

        const handler = vi.fn();
        
        // Test that event() works with Svelte 5 signature: (type, node, handler)
        const cleanup = event('submit', form, handler);
        
        expect(typeof cleanup).toBe('function');
        cleanup();
    });

    it('dispatches submit event when button type=submit is activated', () => {
        const root = trackNode(create_root());
        const form = trackNode(create_element('form'));
        const button = trackNode(create_element('button'));
        
        set_attribute(button, 'type', 'submit');
        set_attribute(button, 'tabIndex', 0);
        
        append(form, button);
        append(root, form);
        mountIntoDocument(root);
        
        registerFocusable(button);
        
        const submitHandler = vi.fn((e: Event) => {
            e.preventDefault();
        });
        
        // Use the event function with Svelte 5 signature
        event('submit', form, submitHandler);
        
        // Focus the button
        setFocus(button);
        expect(getFocused()).toBe(button);
        
        // Press Enter to activate the button
        dispatchKey(makeKey({ key: 'Enter', code: 'Enter', enter: true }));
        
        expect(submitHandler).toHaveBeenCalled();
    });

    it('dispatches submit event when pressing Enter on button', () => {
        const root = trackNode(create_root());
        const form = trackNode(create_element('form'));
        const button = trackNode(create_element('button'));
        
        set_attribute(button, 'type', 'submit');
        set_attribute(button, 'tabIndex', 0);
        
        append(form, button);
        append(root, form);
        mountIntoDocument(root);
        
        registerFocusable(button);
        
        let submitCalled = false;
        
        // Use listen directly to verify the DOM event is dispatched
        listen(form, 'submit', () => {
            submitCalled = true;
        });
        
        setFocus(button);
        dispatchKey(makeKey({ key: 'Enter', code: 'Enter', enter: true }));
        
        expect(submitCalled).toBe(true);
    });

    it('dispatches submit event when pressing Space on button', () => {
        const root = trackNode(create_root());
        const form = trackNode(create_element('form'));
        const button = trackNode(create_element('button'));
        
        set_attribute(button, 'type', 'submit');
        set_attribute(button, 'tabIndex', 0);
        
        append(form, button);
        append(root, form);
        mountIntoDocument(root);
        
        registerFocusable(button);
        
        let submitCalled = false;
        listen(form, 'submit', () => {
            submitCalled = true;
        });
        
        setFocus(button);
        dispatchKey(makeKey({ key: ' ', code: 'Space' }));
        
        expect(submitCalled).toBe(true);
    });

    it('finds ancestor form when submitting', () => {
        const root = trackNode(create_root());
        const form = trackNode(create_element('form'));
        const div = trackNode(create_element('div'));
        const button = trackNode(create_element('button'));
        
        set_attribute(button, 'type', 'submit');
        set_attribute(button, 'tabIndex', 0);
        
        // Button is nested inside div inside form
        append(div, button);
        append(form, div);
        append(root, form);
        mountIntoDocument(root);
        
        registerFocusable(button);
        
        let submitCalled = false;
        listen(form, 'submit', () => {
            submitCalled = true;
        });
        
        setFocus(button);
        dispatchKey(makeKey({ key: 'Enter', code: 'Enter', enter: true }));
        
        expect(submitCalled).toBe(true);
    });

    it('dispatches reset event when button type=reset is activated', () => {
        const root = trackNode(create_root());
        const form = trackNode(create_element('form'));
        const button = trackNode(create_element('button'));
        
        set_attribute(button, 'type', 'reset');
        set_attribute(button, 'tabIndex', 0);
        
        append(form, button);
        append(root, form);
        mountIntoDocument(root);
        
        registerFocusable(button);
        
        let resetCalled = false;
        listen(form, 'reset', () => {
            resetCalled = true;
        });
        
        setFocus(button);
        dispatchKey(makeKey({ key: 'Enter', code: 'Enter', enter: true }));
        
        expect(resetCalled).toBe(true);
    });

    it('event handler receives the event object', () => {
        const root = trackNode(create_root());
        const form = trackNode(create_element('form'));
        const button = trackNode(create_element('button'));
        
        set_attribute(button, 'type', 'submit');
        set_attribute(button, 'tabIndex', 0);
        
        append(form, button);
        append(root, form);
        mountIntoDocument(root);
        
        registerFocusable(button);
        
        let receivedEvent: Event | null = null;
        event('submit', form, (e: Event) => {
            receivedEvent = e;
        });
        
        setFocus(button);
        dispatchKey(makeKey({ key: 'Enter', code: 'Enter', enter: true }));
        
        expect(receivedEvent).not.toBeNull();
        expect(receivedEvent?.type).toBe('submit');
    });

    it('calls Svelte delegated click handler (__click)', () => {
        const root = trackNode(create_root());
        const button = trackNode(create_element('button'));
        
        set_attribute(button, 'tabIndex', 0);
        append(root, button);
        mountIntoDocument(root);
        
        registerFocusable(button);
        
        // Simulate Svelte's event delegation by setting __click
        const dom = getDomNode(button);
        const clickHandler = vi.fn();
        (dom as any)!.__click = clickHandler;
        
        // Emit a click event
        emitMouse(button, 'click');
        
        expect(clickHandler).toHaveBeenCalled();
    });

    it('calls delegated handler when button is activated via keyboard', () => {
        const root = trackNode(create_root());
        const button = trackNode(create_element('button'));
        
        set_attribute(button, 'type', 'button');
        set_attribute(button, 'tabIndex', 0);
        append(root, button);
        mountIntoDocument(root);
        
        registerFocusable(button);
        
        // Simulate Svelte's event delegation
        const dom = getDomNode(button);
        const clickHandler = vi.fn();
        (dom as any).__click = clickHandler;
        
        setFocus(button);
        dispatchKey(makeKey({ key: 'Enter', code: 'Enter', enter: true }));
        
        expect(clickHandler).toHaveBeenCalled();
    });

    it('calls delegated click handler on submit button which triggers form submit', () => {
        const root = trackNode(create_root());
        const form = trackNode(create_element('form'));
        const button = trackNode(create_element('button'));
        
        set_attribute(button, 'type', 'submit');
        set_attribute(button, 'tabIndex', 0);
        
        append(form, button);
        append(root, form);
        mountIntoDocument(root);
        
        registerFocusable(button);
        
        // Track both the delegated click and the form submit
        const dom = getDomNode(button);
        const clickHandler = vi.fn();
        (dom as any).__click = clickHandler;
        
        let submitCalled = false;
        listen(form, 'submit', () => {
            submitCalled = true;
        });
        
        setFocus(button);
        dispatchKey(makeKey({ key: 'Enter', code: 'Enter', enter: true }));
        
        // Both should be called
        expect(clickHandler).toHaveBeenCalled();
        expect(submitCalled).toBe(true);
    });

    it('form submit handler registered via event() is called', () => {
        const root = trackNode(create_root());
        const form = trackNode(create_element('form'));
        const button = trackNode(create_element('button'));
        
        set_attribute(button, 'type', 'submit');
        set_attribute(button, 'tabIndex', 0);
        
        append(form, button);
        append(root, form);
        mountIntoDocument(root);
        
        registerFocusable(button);
        
        // This is how Svelte registers the submit handler
        const submitHandler = vi.fn();
        event('submit', form, submitHandler);
        
        setFocus(button);
        dispatchKey(makeKey({ key: 'Enter', code: 'Enter', enter: true }));
        
        expect(submitHandler).toHaveBeenCalled();
    });

    it('delegated click handler can call state setter', () => {
        const root = trackNode(create_root());
        const form = trackNode(create_element('form'));
        const button = trackNode(create_element('button'));
        
        set_attribute(button, 'type', 'submit');
        set_attribute(button, 'tabIndex', 0);
        
        append(form, button);
        append(root, form);
        mountIntoDocument(root);
        
        registerFocusable(button);
        
        // Simulate what Svelte does - a click handler that modifies state
        let stateValue = false;
        const dom = getDomNode(button);
        (dom as any).__click = () => {
            stateValue = true;
        };
        
        // Also register submit handler via event()
        event('submit', form, () => {
            stateValue = true;
        });
        
        setFocus(button);
        dispatchKey(makeKey({ key: 'Enter', code: 'Enter', enter: true }));
        
        expect(stateValue).toBe(true);
    });

    it('mirrors real app structure with nested button in form', () => {
        // This test mirrors the actual Showcase.svelte structure
        const root = trackNode(create_root());
        const main = trackNode(create_element('main'));
        const form = trackNode(create_element('form'));
        const section = trackNode(create_element('section'));
        const buttonRow = trackNode(create_element('div'));
        const button = trackNode(create_element('button'));
        
        set_attribute(button, 'type', 'submit');
        set_attribute(button, 'tabIndex', 5);
        
        // Build the tree: main > form > section + buttonRow > button
        append(buttonRow, button);
        append(form, section);
        append(form, buttonRow);
        append(main, form);
        append(root, main);
        mountIntoDocument(root);
        
        registerFocusable(button);
        
        // This is exactly how Svelte registers the handler
        let submitted = false;
        event('submit', form, () => {
            submitted = true;
        });
        
        setFocus(button);
        expect(getFocused()).toBe(button);
        
        dispatchKey(makeKey({ key: 'Enter', code: 'Enter', enter: true }));
        
        expect(submitted).toBe(true);
    });

    it('form submit event bubbles from button to form', () => {
        const root = trackNode(create_root());
        const form = trackNode(create_element('form'));
        const div = trackNode(create_element('div'));
        const button = trackNode(create_element('button'));
        
        set_attribute(button, 'type', 'submit');
        set_attribute(button, 'tabIndex', 0);
        
        append(div, button);
        append(form, div);
        append(root, form);
        mountIntoDocument(root);
        
        registerFocusable(button);
        
        // Listen on form for submit event
        const formDom = getDomNode(form);
        let submitReceived = false;
        formDom.addEventListener('submit', () => {
            submitReceived = true;
        });
        
        setFocus(button);
        dispatchKey(makeKey({ key: 'Enter', code: 'Enter', enter: true }));
        
        expect(submitReceived).toBe(true);
    });

    it('works with from_html template like Svelte uses', () => {
        // This mirrors the actual compiled Svelte output
        const template = from_html(`<form><div><button type="submit">Submit</button></div></form>`, 0);
        const formNode = template();
        
        const root = trackNode(create_root());
        append(root, formNode);
        mountIntoDocument(root);
        
        // Navigate to the button like Svelte does
        const div = child(formNode);
        const button = child(div);
        
        set_attribute(button, 'tabIndex', 0);
        registerFocusable(button);
        
        let submitted = false;
        event('submit', formNode, () => {
            submitted = true;
        });
        
        setFocus(button);
        expect(getFocused()).toBe(button);
        
        dispatchKey(makeKey({ key: 'Enter', code: 'Enter', enter: true }));
        
        expect(submitted).toBe(true);
    });
});


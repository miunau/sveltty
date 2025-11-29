import { describe, it, expect, afterEach } from 'vitest';
import {
    append,
    create_element,
    create_root,
    detach,
    set_attribute,
} from '../src/runtime/index.js';
import {
    dispatchKey,
    getLiveMessage,
    setFocus,
} from '../src/runtime/focus.js';
import type { RawKey } from '../src/runtime/input/keyboard.js';
import { mountIntoDocument, trackNode, cleanupTestNodes } from '../test-utils/dom.js';

afterEach(() => {
    cleanupTestNodes();
});

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
        tab: false,
        escape: false,
        enter: false,
        backspace: false,
        delete: false,
        upArrow: false,
        downArrow: false,
        leftArrow: false,
        rightArrow: false,
    };
}

function makeKey(overrides: Partial<RawKey>): RawKey {
    return { ...baseKey(), ...overrides };
}

function parseLivePayload(): Record<string, any> {
    const live = getLiveMessage();
    const start = live.indexOf('{');
    if (start === -1) return {};
    try {
        return JSON.parse(live.slice(start));
    } catch {
        return {};
    }
}

describe('form associations', () => {
    it('re-evaluates external controls based on current DOM membership', () => {
        const root = trackNode(create_root());
        const form = trackNode(create_element('form'));
        set_attribute(form, 'id', 'dom-form');

        const submit = trackNode(create_element('button'));
        submit.inputType = 'submit';
        append(form, submit);
        append(root, form);

        const external = trackNode(create_element('input'));
        external.name = 'external';
        external.value = 'alpha';
        set_attribute(external, 'form', 'dom-form');
        append(root, external);

        mountIntoDocument(root);

        setFocus(submit);
        dispatchKey(makeKey({ key: ' ', sequence: ' ' }));
        const initialPayload = parseLivePayload();
        expect(initialPayload.external).toBe('alpha');

        detach(external);

        setFocus(submit);
        dispatchKey(makeKey({ key: ' ', sequence: ' ' }));
        const afterDetach = parseLivePayload();
        expect(afterDetach.external).toBeUndefined();

        append(root, external);
        external.value = 'beta';
        mountIntoDocument(external);

        setFocus(submit);
        dispatchKey(makeKey({ key: ' ', sequence: ' ' }));
        const afterReattach = parseLivePayload();
        expect(afterReattach.external).toBe('beta');
    });
});



import { describe, it, expect, vi, afterEach } from 'vitest';
import { create_element, create_root, append, free_node, set_attribute } from '../src/runtime/index.js';
import { renderInput } from '../src/runtime/render/input.js';
import type { GridCell } from '../src/runtime/render/types.js';
import type { RawKey } from '../src/runtime/input/keyboard.js';
import {
    dispatchKey,
    getFocused,
    getLiveMessage,
    registerFocusable,
    setFocus,
    unregisterFocusable,
} from '../src/runtime/focus.js';
import { setRangeText } from '../src/runtime/client/bindings.js';
import { listen } from '../src/runtime/operations.js';
import { readInputState } from '../src/runtime/input/state.js';
import { mountIntoDocument, trackNode, cleanupTestNodes, renderWithDom } from '../test-utils/dom.js';

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

function createNumberInput() {
    const input = create_element('input');
    input.inputType = 'number';
    input.type = 'number';
    return input;
}

afterEach(() => {
    cleanupTestNodes();
});

describe('number input focus handling', () => {
    it('defers binding updates until commit', () => {
        const input = createNumberInput();
        trackNode(input);
        const setValue = vi.fn();
        const onInput = vi.fn();
        const onChange = vi.fn();
        input.__setValue = setValue;
        input.onInput = onInput;
        input.onChange = onChange;

        setFocus(input);

        dispatchKey(makeKey({ key: '5' }));
        expect(onInput).toHaveBeenCalledWith({ value: '5' });
        expect(setValue).not.toHaveBeenCalled();
        expect(input.__rawValue).toBe('5');
        expect(input.dirty).toBe(true);

        dispatchKey(makeKey({ key: 'Enter', enter: true }));
        expect(setValue).toHaveBeenCalledWith(5);
        expect(onChange).toHaveBeenCalledWith({ value: 5 });
        expect(input.dirty).toBe(false);

        setValue.mockClear();
        onChange.mockClear();
        dispatchKey(makeKey({ key: 'Enter', enter: true }));
        expect(setValue).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('commits dirty values on tab navigation', () => {
        const first = createNumberInput();
        const second = createNumberInput();
        trackNode(first);
        trackNode(second);
        first.tabIndex = 0;
        second.tabIndex = 1;

        const setValue = vi.fn();
        first.__setValue = setValue;
        first.onInput = vi.fn();
        first.onChange = vi.fn();

        setFocus(first);
        dispatchKey(makeKey({ key: '3' }));

        dispatchKey(makeKey({ key: 'Tab', tab: true }));

        expect(setValue).toHaveBeenCalledWith(3);
        expect(getFocused()).toBe(second);
        expect(first.dirty).toBe(false);
    });

    it('updates committed value on arrow step without firing change', () => {
        const input = createNumberInput();
        trackNode(input);
        const onChange = vi.fn();
        input.onChange = onChange;

        setFocus(input);
        dispatchKey(makeKey({ key: '', upArrow: true }));

        expect(input.__committedValue).toBe(1);
        expect(onChange).not.toHaveBeenCalled();

        dispatchKey(makeKey({ key: 'Enter', enter: true }));
        expect(onChange).toHaveBeenCalledWith({ value: 1 });
    });
});

describe('input rendering', () => {
    it('renders staged raw number text', () => {
        const input = create_element('input');
        trackNode(input);
        input.inputType = 'number';
        input.__rawValue = '42';
        input.value = '';
        input.style.width = 6;
        input.style.height = 3; // Height 3 to account for borders

        const grid: GridCell[][] = Array.from({ length: 3 }, () =>
            Array.from({ length: 6 }, () => ({ char: ' ' }))
        );

        // Height 3 = 1 top border + 1 content + 1 bottom border
        // textStyle with borderStyle to enable borders
        renderInput(input, grid, 0, 0, 6, 3, false, { borderStyle: 'single' });

        // Content is at row 1 (inside borders)
        expect(grid[1][1]?.char).toBe('4');
        expect(grid[1][2]?.char).toBe('2');
    });

    it('shows overflow indicator when textarea content exceeds rows', () => {
        const input = create_element('input');
        trackNode(input);
        input.inputType = 'textarea';
        input.__rawValue = 'line one\nline two';
        input.rows = 1;
        input.style.width = 6;

        const grid: GridCell[][] = Array.from({ length: 3 }, () =>
            Array.from({ length: 6 }, () => ({ char: ' ' }))
        );

        // Height 3 = 1 top border + 1 content + 1 bottom border
        renderInput(input, grid, 0, 0, 6, 3, false, { borderStyle: 'single' });

        // Vertical overflow shows ↓ indicator
        const hasOverflow = grid.some(row => row.some(cell => cell?.char === '↓'));
        expect(hasOverflow).toBe(true);
    });
});

describe('clipboard helpers', () => {
    it('setRangeText preserves backward selection direction', () => {
        const input = trackNode(create_element('input'));
        input.value = 'abcd';

        setRangeText(input, 'ZZ', 3, 1);

        expect(input.value).toBe('aZZd');
        expect(input.selectionStart).toBe(1);
        expect(input.selectionEnd).toBe(1);
        expect(input.selectionDirection).toBe('backward');
    });
});

describe('validation messaging', () => {
    it('announces readable max length errors', () => {
        const input = trackNode(create_element('input'));
        set_attribute(input, 'maxLength', 1);

        setFocus(input);
        dispatchKey(makeKey({ key: 'a' }));
        dispatchKey(makeKey({ key: 'b' }));

        expect(getLiveMessage()).toBe('Invalid: Max length 1');
    });

    it('does not announce max length when unlimited', () => {
        const input = trackNode(create_element('input'));

        setFocus(input);
        dispatchKey(makeKey({ key: 'a' }));
        dispatchKey(makeKey({ key: 'b' }));

        expect(getLiveMessage()).not.toContain('Invalid: Max length');
    });
});

describe('CSS styling', () => {
    it('applies background color from CSS style', () => {
        const input = trackNode(create_element('input'));
        set_attribute(input, 'value', 'ok');

        // Grid needs to be large enough for borders (height 3 = 1 content + 2 borders)
        const grid: GridCell[][] = Array.from({ length: 3 }, () =>
            Array.from({ length: 8 }, () => ({ char: ' ' } as GridCell))
        );

        // Height 3 to account for borders
        // textStyle includes the backgroundColor from CSS (simulating :focus styling)
        renderInput(input, grid, 0, 0, 8, 3, true, { backgroundColor: '#0a2540' });
        
        // Content is at row 1 (inside borders). Position [1][1] is the caret with inverse style,
        // so check position [1][2] which is the first content character with background
        expect(grid[1][2]?.style?.backgroundColor).toBe('#0a2540');
    });
});

describe('input state helper', () => {
    it('masks password values when computing display text', () => {
        const input = trackNode(create_element('input'));
        input.inputType = 'password';
        input.value = 'secret';
        renderWithDom(input);

        const state = readInputState(input);
        expect(state.rawValue).toBe('secret');
        expect(state.displayValue).toBe('******');
    });

    it('falls back to placeholder text', () => {
        const input = trackNode(create_element('input'));
        input.placeholder = 'enter value';
        renderWithDom(input);

        const state = readInputState(input);
        expect(state.displayValue).toBe('enter value');
    });
});

describe('labels and forms', () => {
    it('activates nested focusable child when htmlFor target is disabled', () => {
        const root = trackNode(create_root());
        mountIntoDocument(root);
        const disabledInput = trackNode(create_element('input'));
        set_attribute(disabledInput, 'id', 'primary');
        disabledInput.disabled = true;
        append(root, disabledInput);

        const nestedInput = trackNode(create_element('input'));
        set_attribute(nestedInput, 'id', 'secondary');

        const wrapper = trackNode(create_element('box'));
        append(wrapper, nestedInput);

        const label = trackNode(create_element('label'));
        label.focusable = true;
        registerFocusable(label);
        label.htmlFor = 'primary';
        append(label, wrapper);
        append(root, label);

        setFocus(label);
        dispatchKey(makeKey({ key: ' ' }));

        expect(getFocused()).toBe(nestedInput);
    });

    it('submits form controls from DOM tree and by form id', () => {
        const root = trackNode(create_root());
        const form = trackNode(create_element('form'));
        set_attribute(form, 'id', 'demo-form');

        const inlineInput = trackNode(create_element('input'));
        inlineInput.name = 'inline';
        inlineInput.value = 'alpha';

        const nestedWrapper = trackNode(create_element('box'));
        const nestedInput = trackNode(create_element('input'));
        nestedInput.name = 'deep';
        nestedInput.value = 'beta';
        append(nestedWrapper, nestedInput);

        const externalInput = trackNode(create_element('input'));
        externalInput.name = 'external';
        externalInput.value = 'gamma';
        set_attribute(externalInput, 'form', 'demo-form');

        const submit = trackNode(create_element('button'));
        submit.inputType = 'submit';

        append(form, inlineInput);
        append(form, nestedWrapper);
        append(form, submit);
        append(root, form);
        append(root, externalInput);
        mountIntoDocument(root);

        setFocus(submit);
        dispatchKey(makeKey({ key: ' ' }));

        const live = getLiveMessage();
        const payloadStart = live.indexOf('{');
        expect(payloadStart).toBeGreaterThan(-1);
        const payload = JSON.parse(live.slice(payloadStart));
        expect(payload.inline).toBe('alpha');
        expect(payload.deep).toBe('beta');
        expect(payload.external).toBe('gamma');
    });
});

describe('keyboard events', () => {
    it('respects preventDefault from DOM keydown handlers', () => {
        const input = trackNode(create_element('input'));
        setFocus(input);

        const handler = vi.fn(event => event.preventDefault());
        listen(input, 'keydown', handler);

        dispatchKey(makeKey({ key: 'a', code: 'KeyA', sequence: 'a' }));

        expect(handler).toHaveBeenCalled();
        expect(input.value).toBe('');
    });

    it('emits keyboard metadata on events', () => {
        const input = trackNode(create_element('input'));
        setFocus(input);
        const seen: any[] = [];
        listen(input, 'keydown', event => seen.push(event));

        dispatchKey(makeKey({ key: 'Tab', code: 'Tab', tab: true }));

        expect(seen).toHaveLength(1);
        expect(seen[0].key).toBe('Tab');
        expect(seen[0].code).toBe('Tab');
    });
});


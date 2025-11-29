import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    append,
    computeLayout,
    create_element,
    create_root,
    create_text,
    free_node,
    set_attribute,
    showDialogModal,
} from '../src/runtime/index.js';
import { append_styles } from '../src/runtime/client/styles.js';
import { resetStylesheets, computeStylesheetStyle } from '../src/runtime/style/stylesheet.js';
import { resetFocusState } from '../src/runtime/focus.js';
import type { CliNode } from '../src/runtime/types.js';

describe('pseudo-class selectors', () => {
    beforeEach(() => {
        resetStylesheets();
        resetFocusState();
    });

    afterEach(() => {
        resetStylesheets();
        resetFocusState();
    });

    describe(':focus', () => {
        it('matches when element has __focusState set to focused', () => {
            append_styles(null, 'test-focus', '.field-focus:focus { color: blue; }');

            const root = create_root();
            const input = create_element('input');
            set_attribute(input, 'class', 'field-focus');
            append(root, input);

            // Clear auto-focus for testing
            delete input.__focusState;

            // Not focused initially
            let style = computeStylesheetStyle(input);
            expect(style.color).toBeUndefined();

            // Set focus state
            input.__focusState = 'focused';
            style = computeStylesheetStyle(input);
            expect(style.color).toBe('blue');

            free_node(root);
        });
    });

    describe(':focus-within', () => {
        it('matches when a descendant is focused', () => {
            append_styles(null, 'test-fw', '.container-fw:focus-within { background-color: yellow; }');

            const root = create_root();
            const container = create_element('div');
            set_attribute(container, 'class', 'container-fw');
            append(root, container);

            const input = create_element('input');
            append(container, input);

            // Clear auto-focus for testing
            delete input.__focusState;

            // Not focused initially
            let style = computeStylesheetStyle(container);
            expect(style.backgroundColor).toBeUndefined();

            // Focus the child input
            input.__focusState = 'focused';
            style = computeStylesheetStyle(container);
            expect(style.backgroundColor).toBe('yellow');

            free_node(root);
        });

        it('matches when element itself is focused', () => {
            append_styles(null, 'test-fw2', '.item:focus-within { color: green; }');

            const root = create_root();
            const item = create_element('div');
            set_attribute(item, 'class', 'item');
            append(root, item);

            item.__focusState = 'focused';
            const style = computeStylesheetStyle(item);
            expect(style.color).toBe('green');

            free_node(root);
        });
    });

    describe(':disabled and :enabled', () => {
        it(':disabled matches when element has disabled property', () => {
            append_styles(null, 'test-dis', '.btn:disabled { color: gray; }');

            const root = create_root();
            const btn = create_element('button');
            set_attribute(btn, 'class', 'btn');
            append(root, btn);

            let style = computeStylesheetStyle(btn);
            expect(style.color).toBeUndefined();

            btn.disabled = true;
            style = computeStylesheetStyle(btn);
            expect(style.color).toBe('gray');

            free_node(root);
        });

        it(':enabled matches when element is not disabled', () => {
            append_styles(null, 'test-en', '.btn:enabled { color: green; }');

            const root = create_root();
            const btn = create_element('button');
            set_attribute(btn, 'class', 'btn');
            append(root, btn);

            const style = computeStylesheetStyle(btn);
            expect(style.color).toBe('green');

            btn.disabled = true;
            const style2 = computeStylesheetStyle(btn);
            expect(style2.color).toBeUndefined();

            free_node(root);
        });
    });

    describe(':checked', () => {
        it('matches when checkbox is checked', () => {
            append_styles(null, 'test-chk', '.checkbox:checked { color: blue; }');

            const root = create_root();
            const cb = create_element('input');
            set_attribute(cb, 'class', 'checkbox');
            set_attribute(cb, 'type', 'checkbox');
            append(root, cb);

            let style = computeStylesheetStyle(cb);
            expect(style.color).toBeUndefined();

            cb.checked = true;
            style = computeStylesheetStyle(cb);
            expect(style.color).toBe('blue');

            free_node(root);
        });
    });

    describe(':required and :optional', () => {
        it(':required matches when element has required property', () => {
            append_styles(null, 'test-req', '.field:required { border-color: red; }');

            const root = create_root();
            const input = create_element('input');
            set_attribute(input, 'class', 'field');
            append(root, input);

            let style = computeStylesheetStyle(input);
            expect(style.borderColor).toBeUndefined();

            input.required = true;
            style = computeStylesheetStyle(input);
            expect(style.borderColor).toBe('red');

            free_node(root);
        });

        it(':optional matches when element is not required', () => {
            append_styles(null, 'test-opt', '.field:optional { border-color: gray; }');

            const root = create_root();
            const input = create_element('input');
            set_attribute(input, 'class', 'field');
            append(root, input);

            const style = computeStylesheetStyle(input);
            expect(style.borderColor).toBe('gray');

            free_node(root);
        });
    });

    describe(':valid and :invalid', () => {
        it(':valid matches when element passes validation', () => {
            append_styles(null, 'test-val', '.field:valid { border-color: green; }');

            const root = create_root();
            const input = create_element('input');
            set_attribute(input, 'class', 'field');
            append(root, input);

            // Valid by default (no validation message)
            const style = computeStylesheetStyle(input);
            expect(style.borderColor).toBe('green');

            free_node(root);
        });

        it(':invalid matches when element fails validation', () => {
            append_styles(null, 'test-inv', '.field:invalid { border-color: red; }');

            const root = create_root();
            const input = create_element('input');
            set_attribute(input, 'class', 'field');
            append(root, input);

            input.valid = false;
            const style = computeStylesheetStyle(input);
            expect(style.borderColor).toBe('red');

            free_node(root);
        });

        it(':invalid matches when element has validationMessage', () => {
            append_styles(null, 'test-inv2', '.field:invalid { color: red; }');

            const root = create_root();
            const input = create_element('input');
            set_attribute(input, 'class', 'field');
            append(root, input);

            input.validationMessage = 'This field is required';
            const style = computeStylesheetStyle(input);
            expect(style.color).toBe('red');

            free_node(root);
        });
    });

    describe(':read-only and :read-write', () => {
        it(':read-only matches when element is read-only', () => {
            append_styles(null, 'test-ro', '.field:read-only { background-color: gray; }');

            const root = create_root();
            const input = create_element('input');
            set_attribute(input, 'class', 'field');
            append(root, input);

            input.readonly = true;
            const style = computeStylesheetStyle(input);
            expect(style.backgroundColor).toBe('gray');

            free_node(root);
        });

        it(':read-write matches when element is editable', () => {
            append_styles(null, 'test-rw', '.field:read-write { background-color: white; }');

            const root = create_root();
            const input = create_element('input');
            set_attribute(input, 'class', 'field');
            append(root, input);

            const style = computeStylesheetStyle(input);
            expect(style.backgroundColor).toBe('white');

            free_node(root);
        });
    });

    describe(':placeholder-shown', () => {
        it('matches when input shows placeholder', () => {
            append_styles(null, 'test-ph', '.field:placeholder-shown { color: gray; }');

            const root = create_root();
            const input = create_element('input');
            set_attribute(input, 'class', 'field');
            input.placeholder = 'Enter text';
            input.value = '';
            append(root, input);

            const style = computeStylesheetStyle(input);
            expect(style.color).toBe('gray');

            // With value, placeholder is not shown
            input.value = 'Hello';
            const style2 = computeStylesheetStyle(input);
            expect(style2.color).toBeUndefined();

            free_node(root);
        });
    });

    describe(':empty', () => {
        it('matches elements with no children', () => {
            append_styles(null, 'test-empty', '.box:empty { background-color: red; }');

            const root = create_root();
            const box = create_element('div');
            set_attribute(box, 'class', 'box');
            append(root, box);

            const style = computeStylesheetStyle(box);
            expect(style.backgroundColor).toBe('red');

            // Add a child
            const text = create_text('Content');
            append(box, text);
            const style2 = computeStylesheetStyle(box);
            expect(style2.backgroundColor).toBeUndefined();

            free_node(root);
        });
    });

    describe(':first-child and :last-child', () => {
        it(':first-child matches first element child', () => {
            append_styles(null, 'test-fc', '.item:first-child { color: blue; }');

            const root = create_root();
            const container = create_element('div');
            append(root, container);

            const item1 = create_element('div');
            set_attribute(item1, 'class', 'item');
            append(container, item1);

            const item2 = create_element('div');
            set_attribute(item2, 'class', 'item');
            append(container, item2);

            expect(computeStylesheetStyle(item1).color).toBe('blue');
            expect(computeStylesheetStyle(item2).color).toBeUndefined();

            free_node(root);
        });

        it(':last-child matches last element child', () => {
            append_styles(null, 'test-lc', '.item:last-child { color: green; }');

            const root = create_root();
            const container = create_element('div');
            append(root, container);

            const item1 = create_element('div');
            set_attribute(item1, 'class', 'item');
            append(container, item1);

            const item2 = create_element('div');
            set_attribute(item2, 'class', 'item');
            append(container, item2);

            expect(computeStylesheetStyle(item1).color).toBeUndefined();
            expect(computeStylesheetStyle(item2).color).toBe('green');

            free_node(root);
        });
    });

    describe(':only-child', () => {
        it('matches when element is the only child', () => {
            append_styles(null, 'test-oc', '.item:only-child { color: purple; }');

            const root = create_root();
            const container = create_element('div');
            append(root, container);

            const item = create_element('div');
            set_attribute(item, 'class', 'item');
            append(container, item);

            expect(computeStylesheetStyle(item).color).toBe('purple');

            // Add another child
            const item2 = create_element('div');
            set_attribute(item2, 'class', 'item');
            append(container, item2);

            expect(computeStylesheetStyle(item).color).toBeUndefined();

            free_node(root);
        });
    });

    describe(':first-of-type and :last-of-type', () => {
        it(':first-of-type matches first element of its type', () => {
            append_styles(null, 'test-fot', 'span:first-of-type { color: blue; }');

            const root = create_root();
            const container = create_element('div');
            append(root, container);

            const div1 = create_element('div');
            append(container, div1);

            const span1 = create_element('span');
            append(container, span1);

            const span2 = create_element('span');
            append(container, span2);

            expect(computeStylesheetStyle(span1).color).toBe('blue');
            expect(computeStylesheetStyle(span2).color).toBeUndefined();

            free_node(root);
        });

        it(':last-of-type matches last element of its type', () => {
            append_styles(null, 'test-lot', 'span:last-of-type { color: green; }');

            const root = create_root();
            const container = create_element('div');
            append(root, container);

            const span1 = create_element('span');
            append(container, span1);

            const span2 = create_element('span');
            append(container, span2);

            const div1 = create_element('div');
            append(container, div1);

            expect(computeStylesheetStyle(span1).color).toBeUndefined();
            expect(computeStylesheetStyle(span2).color).toBe('green');

            free_node(root);
        });
    });

    describe(':nth-child', () => {
        it('matches specific index', () => {
            append_styles(null, 'test-nth1', '.item:nth-child(2) { color: blue; }');

            const root = create_root();
            const container = create_element('div');
            append(root, container);

            const items: CliNode[] = [];
            for (let i = 0; i < 4; i++) {
                const item = create_element('div');
                set_attribute(item, 'class', 'item');
                append(container, item);
                items.push(item);
            }

            expect(computeStylesheetStyle(items[0]).color).toBeUndefined();
            expect(computeStylesheetStyle(items[1]).color).toBe('blue');
            expect(computeStylesheetStyle(items[2]).color).toBeUndefined();
            expect(computeStylesheetStyle(items[3]).color).toBeUndefined();

            free_node(root);
        });

        it('matches odd children', () => {
            append_styles(null, 'test-nth-odd', '.item:nth-child(odd) { color: red; }');

            const root = create_root();
            const container = create_element('div');
            append(root, container);

            const items: CliNode[] = [];
            for (let i = 0; i < 4; i++) {
                const item = create_element('div');
                set_attribute(item, 'class', 'item');
                append(container, item);
                items.push(item);
            }

            expect(computeStylesheetStyle(items[0]).color).toBe('red'); // 1st
            expect(computeStylesheetStyle(items[1]).color).toBeUndefined(); // 2nd
            expect(computeStylesheetStyle(items[2]).color).toBe('red'); // 3rd
            expect(computeStylesheetStyle(items[3]).color).toBeUndefined(); // 4th

            free_node(root);
        });

        it('matches even children', () => {
            append_styles(null, 'test-nth-even', '.item:nth-child(even) { color: green; }');

            const root = create_root();
            const container = create_element('div');
            append(root, container);

            const items: CliNode[] = [];
            for (let i = 0; i < 4; i++) {
                const item = create_element('div');
                set_attribute(item, 'class', 'item');
                append(container, item);
                items.push(item);
            }

            expect(computeStylesheetStyle(items[0]).color).toBeUndefined(); // 1st
            expect(computeStylesheetStyle(items[1]).color).toBe('green'); // 2nd
            expect(computeStylesheetStyle(items[2]).color).toBeUndefined(); // 3rd
            expect(computeStylesheetStyle(items[3]).color).toBe('green'); // 4th

            free_node(root);
        });

        it('matches formula 2n+1', () => {
            append_styles(null, 'test-nth-2n1', '.item:nth-child(2n+1) { color: purple; }');

            const root = create_root();
            const container = create_element('div');
            append(root, container);

            const items: CliNode[] = [];
            for (let i = 0; i < 5; i++) {
                const item = create_element('div');
                set_attribute(item, 'class', 'item');
                append(container, item);
                items.push(item);
            }

            expect(computeStylesheetStyle(items[0]).color).toBe('purple'); // 1
            expect(computeStylesheetStyle(items[1]).color).toBeUndefined(); // 2
            expect(computeStylesheetStyle(items[2]).color).toBe('purple'); // 3
            expect(computeStylesheetStyle(items[3]).color).toBeUndefined(); // 4
            expect(computeStylesheetStyle(items[4]).color).toBe('purple'); // 5

            free_node(root);
        });

        it('matches formula 3n', () => {
            append_styles(null, 'test-nth-3n', '.item:nth-child(3n) { color: orange; }');

            const root = create_root();
            const container = create_element('div');
            append(root, container);

            const items: CliNode[] = [];
            for (let i = 0; i < 6; i++) {
                const item = create_element('div');
                set_attribute(item, 'class', 'item');
                append(container, item);
                items.push(item);
            }

            expect(computeStylesheetStyle(items[0]).color).toBeUndefined(); // 1
            expect(computeStylesheetStyle(items[1]).color).toBeUndefined(); // 2
            expect(computeStylesheetStyle(items[2]).color).toBe('orange'); // 3
            expect(computeStylesheetStyle(items[3]).color).toBeUndefined(); // 4
            expect(computeStylesheetStyle(items[4]).color).toBeUndefined(); // 5
            expect(computeStylesheetStyle(items[5]).color).toBe('orange'); // 6

            free_node(root);
        });
    });

    describe(':nth-last-child', () => {
        it('matches from the end', () => {
            append_styles(null, 'test-nlc', '.item:nth-last-child(1) { color: blue; }');

            const root = create_root();
            const container = create_element('div');
            append(root, container);

            const items: CliNode[] = [];
            for (let i = 0; i < 3; i++) {
                const item = create_element('div');
                set_attribute(item, 'class', 'item');
                append(container, item);
                items.push(item);
            }

            expect(computeStylesheetStyle(items[0]).color).toBeUndefined();
            expect(computeStylesheetStyle(items[1]).color).toBeUndefined();
            expect(computeStylesheetStyle(items[2]).color).toBe('blue'); // last

            free_node(root);
        });
    });

    describe(':has()', () => {
        it('matches when element has matching descendant', () => {
            append_styles(null, 'test-has', '.container:has(.special) { background-color: yellow; }');

            const root = create_root();
            const container = create_element('div');
            set_attribute(container, 'class', 'container');
            append(root, container);

            // Initially no special child
            let style = computeStylesheetStyle(container);
            expect(style.backgroundColor).toBeUndefined();

            // Add a special child
            const special = create_element('div');
            set_attribute(special, 'class', 'special');
            append(container, special);

            style = computeStylesheetStyle(container);
            expect(style.backgroundColor).toBe('yellow');

            free_node(root);
        });

        it('matches nested descendants', () => {
            append_styles(null, 'test-has2', '.outer:has(.deep) { color: green; }');

            const root = create_root();
            const outer = create_element('div');
            set_attribute(outer, 'class', 'outer');
            append(root, outer);

            const middle = create_element('div');
            append(outer, middle);

            const deep = create_element('div');
            set_attribute(deep, 'class', 'deep');
            append(middle, deep);

            const style = computeStylesheetStyle(outer);
            expect(style.color).toBe('green');

            free_node(root);
        });
    });

    describe(':not()', () => {
        it('matches when element does not match selector', () => {
            append_styles(null, 'test-not', '.item:not(.special) { color: gray; }');

            const root = create_root();
            const container = create_element('div');
            append(root, container);

            const item1 = create_element('div');
            set_attribute(item1, 'class', 'item');
            append(container, item1);

            const item2 = create_element('div');
            set_attribute(item2, 'class', 'item special');
            append(container, item2);

            expect(computeStylesheetStyle(item1).color).toBe('gray');
            expect(computeStylesheetStyle(item2).color).toBeUndefined();

            free_node(root);
        });
    });

    describe(':is()', () => {
        it('matches any of the selectors', () => {
            append_styles(null, 'test-is', ':is(.a, .b, .c) { color: blue; }');

            const root = create_root();
            const container = create_element('div');
            append(root, container);

            const itemA = create_element('div');
            set_attribute(itemA, 'class', 'a');
            append(container, itemA);

            const itemB = create_element('div');
            set_attribute(itemB, 'class', 'b');
            append(container, itemB);

            const itemD = create_element('div');
            set_attribute(itemD, 'class', 'd');
            append(container, itemD);

            expect(computeStylesheetStyle(itemA).color).toBe('blue');
            expect(computeStylesheetStyle(itemB).color).toBe('blue');
            expect(computeStylesheetStyle(itemD).color).toBeUndefined();

            free_node(root);
        });
    });

    describe(':popover-open', () => {
        it('matches when popover is open', () => {
            append_styles(null, 'test-pop', '.popup:popover-open { background-color: white; }');

            const root = create_root();
            const popup = create_element('div');
            set_attribute(popup, 'class', 'popup');
            append(root, popup);

            let style = computeStylesheetStyle(popup);
            expect(style.backgroundColor).toBeUndefined();

            popup.__popoverOpen = true;
            style = computeStylesheetStyle(popup);
            expect(style.backgroundColor).toBe('white');

            free_node(root);
        });
    });

    describe(':modal', () => {
        it('matches when element is modal', () => {
            append_styles(null, 'test-modal', 'dialog:modal { border-color: blue; }');

            const root = create_root();
            const dialog = create_element('dialog');
            set_attribute(dialog, 'class', 'dialog');
            append(root, dialog);

            let style = computeStylesheetStyle(dialog);
            expect(style.borderColor).toBeUndefined();

            // Use the proper dialog API to open as modal
            showDialogModal(dialog);
            style = computeStylesheetStyle(dialog);
            expect(style.borderColor).toBe('blue');

            free_node(root);
        });
    });

    describe(':root', () => {
        it('matches root element', () => {
            append_styles(null, 'test-root', ':root { background-color: black; }');

            const root = create_root();
            const child = create_element('div');
            append(root, child);

            expect(computeStylesheetStyle(root).backgroundColor).toBe('black');
            expect(computeStylesheetStyle(child).backgroundColor).toBeUndefined();

            free_node(root);
        });
    });

    describe(':indeterminate', () => {
        it('matches when checkbox is indeterminate', () => {
            append_styles(null, 'test-ind', '.checkbox:indeterminate { color: orange; }');

            const root = create_root();
            const cb = create_element('input');
            set_attribute(cb, 'class', 'checkbox');
            set_attribute(cb, 'type', 'checkbox');
            append(root, cb);

            let style = computeStylesheetStyle(cb);
            expect(style.color).toBeUndefined();

            cb.indeterminate = true;
            style = computeStylesheetStyle(cb);
            expect(style.color).toBe('orange');

            free_node(root);
        });
    });

    describe('combined pseudo-classes', () => {
        it('combines multiple pseudo-classes', () => {
            append_styles(null, 'test-combo', '.field-combo:focus:valid { border-color: green; }');

            const root = create_root();
            const input = create_element('input');
            set_attribute(input, 'class', 'field-combo');
            append(root, input);

            // Clear auto-focus for testing
            delete input.__focusState;

            // Not focused (valid by default, but :focus:valid requires both)
            let style = computeStylesheetStyle(input);
            expect(style.borderColor).toBeUndefined();

            // Just focused (valid by default since no validation message)
            input.__focusState = 'focused';
            style = computeStylesheetStyle(input);
            expect(style.borderColor).toBe('green');

            // Focused but invalid
            input.valid = false;
            style = computeStylesheetStyle(input);
            expect(style.borderColor).toBeUndefined();

            free_node(root);
        });
    });
});


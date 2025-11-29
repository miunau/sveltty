import { describe, expect, it, vi } from 'vitest';
import {
    valueBindingAction,
    checkedBindingAction,
    selectValueBindingAction,
} from '../src/runtime/actions/bindings.js';
import { CliNode } from '../src/runtime/types.js';

function makeNode(tag: string) {
    return {
        nodeName: tag,
        style: {},
        tabIndex: 0,
    } as CliNode;
}

describe('binding actions', () => {
    it('binds text input values', () => {
        const node = makeNode('input');
        let current = 'alpha';
        const action = valueBindingAction(node, {
            get: () => current,
            set: value => {
                current = value;
            },
        });

        expect(node.value).toBe('alpha');
        node.__setValue?.('beta');
        expect(current).toBe('beta');

        action.update({
            get: () => 'gamma',
            set: value => {
                current = value;
            },
        });
        expect(node.value).toBe('gamma');
    });

    it('binds checked state', () => {
        const node = makeNode('input');
        let checked = false;
        const action = checkedBindingAction(node, {
            get: () => checked,
            set: value => {
                checked = value;
            },
        });

        expect(node.checked).toBe(false);
        node.__setChecked?.(true);
        expect(checked).toBe(true);
        action.destroy();
        expect(node.__setChecked).toBeUndefined();
    });

    it('binds select values', () => {
        const node = makeNode('select');
        const spy = vi.fn();
        selectValueBindingAction(node, {
            get: () => 'a',
            set: spy,
        });
        expect(node.value).toBe('a');
        node.__setValue?.('b');
        expect(spy).toHaveBeenCalledWith('b');
    });
});


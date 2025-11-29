import { describe, expect, it, vi } from 'vitest';
import {
    announce,
    createFocusController,
    dispatchKey,
    getFocused,
    getLiveMessage,
    moveFocus,
    registerFocusable,
    setFocus,
    setRenderScheduler,
    withFocusController,
} from '../src/runtime/focus.js';
import type { CliNode } from '../src/runtime/types.js';
import type { RawKey } from '../src/runtime/input/keyboard.js';

function makeNode(tag: string, label: string = tag): CliNode {
    return {
        nodeName: tag,
        label,
        style: {},
        children: [],
        tabIndex: 0,
    } as unknown as CliNode;
}

function rawChar(ch: string): RawKey {
    return {
        key: ch,
        code: `Key${ch.toUpperCase()}`,
        sequence: ch,
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

describe('focus controller', () => {
    it('cycles focus order per controller', () => {
        const controller = createFocusController();
        const scheduler = vi.fn();
        withFocusController(controller, () => {
            setRenderScheduler(scheduler);

            const first = makeNode('input', 'first');
            const second = makeNode('button', 'second');

            registerFocusable(first);
            registerFocusable(second);

            expect(getFocused()).toBe(first);
            moveFocus('next');
            expect(getFocused()).toBe(second);
            moveFocus('next');
            expect(getFocused()).toBe(first);
            expect(scheduler).toHaveBeenCalled();
        });
    });

    it('updates input state when typing', () => {
        const controller = createFocusController();
        withFocusController(controller, () => {
            setRenderScheduler(() => {});
            const inputNode = makeNode('input');
            Object.assign(inputNode, {
                inputType: 'text',
                value: '',
                __rawValue: '',
                onInput: vi.fn(),
            });

            registerFocusable(inputNode);
            setFocus(inputNode);

            dispatchKey(rawChar('a'));
            expect(inputNode.__rawValue).toBe('a');
            expect(inputNode.value).toBe('a');
            expect(inputNode.onInput).toHaveBeenCalledTimes(1);

            announce('typing');
            expect(getLiveMessage()).toBe('typing');
        });
    });
});


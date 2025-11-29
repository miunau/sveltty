import { describe, it, expect } from 'vitest';
import {
    create_root,
    create_element,
    create_text,
    append,
    set_style,
    computeLayout,
    renderToString,
    set_text,
    free_node,
} from '../src/runtime/index.js';
import {
    effect_root,
    mutable_source,
    set as set_state,
    get,
    flush,
    user_effect,
} from '../src/runtime/client/index.js';

const ANSI_REGEX = /\x1B\[[0-9;?]*[A-Za-z]/g;

describe('CLI rendering reactivity', () => {
    it('updates rendered text when reactive state changes', () => {
        const root = create_root();
        set_style(root, { width: 30, height: 5 });

        const box = create_element();
        set_style(box, { width: 20, height: 3, padding: 1, borderStyle: 'single' });

        const text = create_text('');
        append(box, text);
        append(root, box);

        const count = mutable_source(0);

        effect_root(() => {
            user_effect(() => {
                set_text(text, `Count: ${get(count)}`);
            });
        });

        computeLayout(root, 30, 5);

        flush();
        let { output } = renderToString(root);
        let plain = output.replace(ANSI_REGEX, '');
        expect(plain).toContain('Count: 0');

        set_state(count, 1);
        flush();
        ({ output } = renderToString(root));
        plain = output.replace(ANSI_REGEX, '');
        expect(plain).toContain('Count: 1');

        free_node(root);
    });
});

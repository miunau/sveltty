import { beforeEach, describe, expect, it } from 'vitest';
import {
    append,
    computeLayout,
    create_element,
    create_root,
    create_text,
    free_node,
    renderToString,
    set_attribute,
} from '../src/runtime/index.js';
import { append_styles } from '../src/runtime/client/styles.js';
import { resetStylesheets } from '../src/runtime/style/stylesheet.js';

describe('stylesheet-driven styles', () => {
    beforeEach(() => {
        resetStylesheets();
    });

    it('applies class selectors to elements', () => {
        append_styles(
            null,
            'svelte-accent',
            '.accent.svelte-accent { color: red; background-color: blue; }'
        );

        const root = create_root();
        set_attribute(root, 'width', 20);
        set_attribute(root, 'height', 4);

        const box = create_element('box');
        set_attribute(box, 'class', 'accent svelte-accent');
        append(root, box);

        const text = create_text('Styled');
        append(box, text);

        computeLayout(root, 20, 4);
        const { output } = renderToString(root, {});
        free_node(root);

        // All colors use 24-bit ANSI codes for consistency
        expect(output).toContain('\x1b[38;2;255;0;0m'); // red foreground (24-bit)
        expect(output).toContain('\x1b[48;2;0;0;255m'); // blue background (24-bit)
    });

    it('maps hex colors to nearest ANSI colors', () => {
        append_styles(
            null,
            'svelte-tone',
            '.tone.svelte-tone { color: #ff0000; background-color: #00ff00; }'
        );

        const root = create_root();
        set_attribute(root, 'width', 12);
        set_attribute(root, 'height', 3);

        const box = create_element('box');
        set_attribute(box, 'class', 'tone svelte-tone');
        append(root, box);
        const text = create_text('Hexy');
        append(box, text);

        computeLayout(root, 12, 3);
        const { output } = renderToString(root, {});
        free_node(root);

        expect(output).toMatch(/\x1b\[38;2;255;0;0m/);
        expect(output).toContain('\x1b[48;2;0;255;0m');
    });
});


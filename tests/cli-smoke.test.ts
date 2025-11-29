import { describe, it, expect } from 'vitest';
import {
    create_root,
    create_element,
    create_text,
    append,
    set_style,
    computeLayout,
    renderToString,
    free_node,
} from '../src/runtime/index.js';

const ANSI_REGEX = /\x1B\[[0-9;?]*[A-Za-z]/g;

describe('CLI smoke render', () => {
    it('renders text and borders with inherited background', () => {
        const root = create_root();
        set_style(root, { width: 40, height: 8 });

        const box = create_element();
        set_style(box, { width: 30, height: 6, padding: 1, borderStyle: 'single', borderColor: 'green', borderBg: 'blue', backgroundColor: 'blue' });

        const text = create_text('Demo');
        append(box, text);
        append(root, box);

        computeLayout(root, 40, 8);
        const { output } = renderToString(root);
        const plain = output.replace(ANSI_REGEX, '');

        expect(plain).toContain('Demo');
        expect(plain).toMatch(/[┌┐└┘]/);
        // background applied via 24-bit ANSI codes
        expect(output).toContain('\x1b[48;2;0;0;255m'); // blue background (24-bit)

        free_node(root);
    });
});

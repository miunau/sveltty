import { describe, it, expect } from 'vitest';
import {
    create_root,
    create_element,
    append,
    free_node,
} from '../src/runtime/index.js';

describe('free_node safety', () => {
    it('can be called multiple times without crashing', () => {
        const root = create_root();
        const child = create_element('box');
        append(root, child);

        free_node(root);
        expect(() => free_node(root)).not.toThrow();
    });
});


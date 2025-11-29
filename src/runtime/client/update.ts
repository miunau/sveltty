/**
 * Update operations for CLI nodes
 * Replaces DOM update functions
 */

import type { TextNode } from '../types.js';
import { scheduleRender } from '../mount.js';
import { set_text as set_text_operation } from '../operations.js';

/**
 * Set text content of a text node
 * Replaces: $.set_text()
 */
export function set_text(node: TextNode | null, value: string): void {
    if (!node) {
        console.warn('set_text called with null node');
        return;
    }

    if (node.type !== 'text') {
        console.warn('set_text called on non-text node');
        return;
    }

    // Delegate to core operation so Yoga sizing and rendering stay in sync
    set_text_operation(node, value);
}

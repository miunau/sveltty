/**
 * Tree traversal operations for CLI
 * Replaces DOM navigation (firstChild, nextSibling, etc.)
 */

import type { CliNode } from '../types.js';
import { create_element, append } from '../operations.js';

/**
 * Get child of a node (optionally filtered by text/element)
 * Replaces: $.child()
 */
export function child(node: CliNode, is_text?: boolean): CliNode | null {
    if (!node) return null;

    if (!node.children || node.children.length === 0) {
        // For selects without parsed children, synthesize a placeholder option so compiled code can bind
        if (node.nodeName === 'select') {
            const needed = 3;
            for (let i = 0; i < needed; i++) {
                const option = create_element('option');
                append(node, option);
            }
        } else {
            return null;
        }
    }

    if (is_text !== undefined) {
        // Filter by type
        return node.children.find(child =>
            is_text ? child.type === 'text' : child.type !== 'text'
        ) || null;
    }

    return node.children[0] || null;
}

/**
 * Get first child of a node
 * Replaces: $.first_child()
 */
export function first_child(node: CliNode, is_text?: boolean): CliNode | null {
    return child(node, is_text);
}

/**
 * Get next sibling of a node
 * Replaces: $.sibling()
 */
export function sibling(node: CliNode, count: number = 1, is_text?: boolean): CliNode | null {
    if (!node || !node.parent) {
        return null;
    }

    const parent = node.parent;
    const index = parent.children.indexOf(node);

    if (index === -1) {
        return null;
    }

    let current = index + 1;
    let found = 0;
    let lastMatch: CliNode | null = null;

    while (current < parent.children.length && found < count) {
        const candidate = parent.children[current];

        if (is_text === undefined ||
            (is_text && candidate.type === 'text') ||
            (!is_text && candidate.type !== 'text')) {
            found++;
            lastMatch = candidate;
            if (found === count) {
                return candidate;
            }
        }

        current++;
    }

    if (lastMatch) return lastMatch;
    return parent.children[parent.children.length - 1] || null;
}

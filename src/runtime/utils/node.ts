/**
 * Shared utilities for accessing CLI node properties.
 * Consolidates repeated node access patterns used across the runtime.
 */

import type { CliNode } from '../types.js';

/**
 * Get the lowercase tag name of a node.
 */
export function getNodeTag(node: CliNode | null): string {
    return String(node?.nodeName ?? '').toLowerCase();
}

/**
 * Get the children of a node, handling both childNodes and children properties.
 */
export function getNodeChildren(node: CliNode | null): CliNode[] {
    if (!node) return [];
    return (node.childNodes ?? node.children ?? []) as CliNode[];
}

/**
 * Get the input type of a node (for input elements).
 */
export function getInputType(node: CliNode): string {
    return String(node.inputType ?? node.type ?? '').toLowerCase();
}

/**
 * Check if a tag name is a form control element.
 */
export function isFormControlTag(tag: string): boolean {
    return tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button';
}

/**
 * Common set of form control tag names.
 */
export const FORM_CONTROL_TAGS = new Set(['input', 'select', 'textarea', 'button']);

/**
 * Interactive elements that are focusable but not form controls.
 */
export const INTERACTIVE_TAGS = new Set(['summary', 'a']);


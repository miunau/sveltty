import type { CliNode, Style } from '../types.js';
import { set_attribute as applyAttribute, set_style as setStyleOp } from '../operations.js';
import { scheduleRender } from '../mount.js';

/**
 * Apply attribute updates using the shared operations pipeline. Objects passed into
 * `style` (e.g., Svelte's `style:width`) are forwarded to `set_style` so Yoga gets
 * the right signals; everything else flows through `applyAttribute`.
 */
export function set_attribute(node: CliNode, name: string, value: any): void {
    if (!node) return;
    if (name === 'style' && value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [prop, val] of Object.entries(value as Partial<Style>)) {
            set_style(node, prop, val);
        }
        return;
    }
    applyAttribute(node, name, value);
}

/**
 * Assign CSS classes. For parity with the DOM we forward through the same attribute helper.
 */
export function set_class(node: CliNode, value: string): void {
    applyAttribute(node, 'class', value);
}

/**
 * Inline style mutations emitted by Svelte (e.g., `style:width={x}`) continue to use
 * the Yoga-backed style helper so layout re-calculations happen eagerly.
 */
export function set_style(
    node: CliNode,
    property: string,
    value: any
): void {
    setStyleOp(node, { [property]: value });
    scheduleRender();
}

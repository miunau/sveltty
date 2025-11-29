/**
 * Special elements and features
 */

import { noop } from 'svelte/internal/client';

/**
 * HTML insertion (not applicable to CLI)
 * Replaces: $.html()
 */
export function html(node: any, get_value: () => string, svg: boolean): void {
    // TODO: Can't insert raw HTML in CLI
    console.warn('HTML insertion not supported in CLI');
}

/**
 * CSS custom properties (stub)
 * Replaces: $.css_props()
 */
export function css_props(node: any, is_custom_element: boolean, props: Record<string, any>): void {
    // TODO
}

/**
 * Head element (not applicable)
 * Replaces: $.head()
 */
export function head(fn: Function): void {
    // No <head> in CLI
}

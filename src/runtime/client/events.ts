/**
 * Event handling for CLI
 * Will be replaced with keyboard/input handling
 */

import { noop } from 'svelte/internal/client';
import { listen } from '../operations.js';

/**
 * Add event listener
 * Signature matches Svelte 5: event(event_name, dom, handler, capture?, passive?)
 */
export function event(
    type: string,
    node: any,
    handler: Function,
    capture?: boolean,
    passive?: boolean
): () => void {
    return listen(node, type, handler as (event: any) => void, { capture, passive });
}

/**
 * Apply event handler (stub)
 * Replaces: $.apply()
 */
export function apply(node: any, fn: Function): void {
    fn?.(node);
}

/**
 * Event delegation (not applicable to CLI)
 * Replaces: $.delegate()
 */
export function delegate(handlers: any[]): void {
    // Not needed for CLI
}

/**
 * Replay events (not applicable)
 * Replaces: $.replay_events()
 */
export function replay_events(): void {
    // Not needed
}

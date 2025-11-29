/**
 * Transitions and animations for CLI
 * Future: Implement terminal animations
 */

import { noop } from 'svelte/internal/client';

/**
 * Transition (stub for now)
 * Replaces: $.transition()
 */
export function transition(node: any, get_params: () => any, is_intro: boolean, name: string): () => void {
    // TODO: Implement CLI transitions (fade, slide, etc.)
    return noop;
}

/**
 * Animation (stub)
 * Replaces: $.animation()
 */
export function animation(node: any, get_params: () => any, name: string): () => void {
    // Not implemented yet
    return noop;
}

/**
 * Action (stub)
 * Replaces: $.action()
 */
export function action(node: any, action_fn: Function, ...args: any[]): void {
    // Call action but ignore destroy
    action_fn?.(node, ...args);
}

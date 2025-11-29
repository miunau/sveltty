/**
 * Type declarations for Svelte components
 */

declare module '*.svelte' {
    import type { ComponentType } from 'svelte';
    const component: ComponentType;
    export default component;
}

/**
 * Element Renderer Registry
 * 
 * A declarative system for registering element-specific renderers.
 * Replaces hardcoded if/else chains in paint.ts with a clean registry pattern.
 * 
 * Each renderer declares:
 * - Which tags it handles
 * - Whether it has custom layout (calculates own dimensions)
 * - Whether it handles its own children (vs default recursive painting)
 * - The render function itself
 */

import type { CliNode, TextStyle } from '../types.js';
import type { PaintContext, NodeBounds } from './pipeline/context.js';

/**
 * Callback for painting child nodes.
 * Provided to renderers that need to paint children at custom positions.
 */
export type PaintChildFn = (
    child: CliNode,
    ctx: PaintContext
) => void;

/**
 * Callback for painting constrained content.
 * Provided to renderers that need to paint content within bounded areas.
 */
export type PaintConstrainedFn = (
    node: CliNode,
    ctx: PaintContext,
    bounds: { x: number; y: number; width: number; height: number }
) => void;

/**
 * Render context passed to element renderers.
 * Extends PaintContext with utility functions for rendering.
 */
export interface RenderContext extends PaintContext {
    /** Paint a child node. */
    paintChild: PaintChildFn;
    /** Paint content within constrained bounds. */
    paintConstrained: PaintConstrainedFn;
}

/**
 * Element renderer interface.
 * 
 * Renderers are registered by tag name and called during the paint phase
 * to render specific element types.
 */
export interface ElementRenderer {
    /**
     * Tag names this renderer handles.
     * A renderer can handle multiple tags (e.g., ['input', 'textarea']).
     */
    tags: string[];
    
    /**
     * Whether this renderer calculates its own layout dimensions.
     * If true, the element's dimensions come from the renderer, not Yoga.
     * Used by tables, images, and form controls.
     */
    customLayout?: boolean;
    
    /**
     * Whether this renderer handles painting its own children.
     * If true, the default child painting is skipped.
     * Used by tables, form controls, and select elements.
     */
    customChildren?: boolean;
    
    /**
     * Whether this renderer should be skipped in the first render pass.
     * Elements with skipInFirstPass will be collected and rendered later.
     * Used by top-layer elements like popovers.
     */
    skipInFirstPass?: boolean;
    
    /**
     * Render the element.
     * 
     * @param node - The CLI node to render.
     * @param ctx - The render context with paint utilities.
     * @param bounds - The computed bounds for this node.
     * @param computedStyle - The fully computed style for this node.
     */
    render(
        node: CliNode,
        ctx: RenderContext,
        bounds: NodeBounds,
        computedStyle: TextStyle
    ): void;
}

/** Registry of element renderers by tag name. */
const rendererRegistry = new Map<string, ElementRenderer>();

/**
 * Register an element renderer.
 * 
 * @param renderer - The renderer to register.
 */
export function registerRenderer(renderer: ElementRenderer): void {
    for (const tag of renderer.tags) {
        rendererRegistry.set(tag.toLowerCase(), renderer);
    }
}

/**
 * Unregister an element renderer.
 * 
 * @param tags - The tags to unregister.
 */
export function unregisterRenderer(tags: string[]): void {
    for (const tag of tags) {
        rendererRegistry.delete(tag.toLowerCase());
    }
}

/**
 * Get the renderer for a tag.
 * 
 * @param tag - The tag name.
 * @returns The renderer, or undefined if none registered.
 */
export function getRenderer(tag: string): ElementRenderer | undefined {
    return rendererRegistry.get(tag.toLowerCase());
}

/**
 * Check if a tag has a registered renderer.
 * 
 * @param tag - The tag name.
 * @returns True if a renderer is registered.
 */
export function hasRenderer(tag: string): boolean {
    return rendererRegistry.has(tag.toLowerCase());
}

/**
 * Clear all registered renderers.
 * Primarily used for testing.
 */
export function clearRegistry(): void {
    rendererRegistry.clear();
}

/**
 * Get all registered renderer tags.
 * Primarily used for debugging and testing.
 */
export function getRegisteredTags(): string[] {
    return Array.from(rendererRegistry.keys());
}

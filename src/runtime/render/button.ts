/**
 * Button element renderer for CLI.
 * 
 * Styling is driven by computed CSS styles. The user-agent stylesheet defines defaults,
 * and pseudo-classes (:focus, :disabled) are resolved before rendering.
 */
import type { CliNode, TextStyle } from '../types.js';
import type { ClipRect, GridCell } from './types.js';
import type { ElementRenderer } from './registry.js';
import { registerRenderer } from './registry.js';
import { getDomNode } from '../dom/happy.js';
import { resolveClip } from './utils.js';
import {
    type FormControlContext,
    getInteriorRect,
    fillInterior,
    drawCenteredText,
} from './form-control.js';
import { getNodeChildren } from '../utils/node.js';

export function renderButton(
    node: CliNode,
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    isFocused: boolean,
    textStyle: TextStyle,
    clip?: ClipRect
): void {
    const ctx: FormControlContext = {
        node: node,
        grid,
        x,
        y,
        width,
        height,
        isFocused,
        style: textStyle,
        clip: resolveClip(grid, clip),
    };
    
    const domButton = getDomNode(ctx.node) as HTMLButtonElement | undefined;
    const disabled = domButton?.disabled ?? node.disabled;
    
    // Get button text content
    let content = domButton?.textContent?.trim() || node.textContent || node.label || '';
    if (!content) {
        const textNodes = getNodeChildren(ctx.node).filter((c: CliNode) => c.type === 'text');
        content = textNodes.map((t: CliNode) => t.value).join('').trim();
    }
    if (!content) {
        content = domButton?.value || 'Button';
    }
    
    // textStyle already has :focus/:disabled styles applied by stylesheet
    // Apply dim for disabled state if not already styled
    const buttonStyle: TextStyle = disabled 
        ? { ...textStyle, dim: textStyle.dim ?? true }
        : textStyle;
    
    // Buttons don't use padding for content centering
    const interior = getInteriorRect(ctx, false);
    
    fillInterior(grid, interior, buttonStyle);
    drawCenteredText(grid, interior, content, buttonStyle);
}

/**
 * Button element renderer.
 * Registered with the element registry to handle <button> elements.
 */
export const buttonRenderer: ElementRenderer = {
    tags: ['button'],
    customChildren: true,
    
    render(node, ctx, bounds, computedStyle) {
        const isFocused = node.__focusState === 'focused';
        renderButton(
            node,
            ctx.grid,
            bounds.absX,
            bounds.absY,
            bounds.width,
            bounds.height,
            isFocused,
            computedStyle,
            bounds.clip
        );
    },
};

// Register the button renderer
registerRenderer(buttonRenderer);

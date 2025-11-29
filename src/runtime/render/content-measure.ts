/**
 * Content Measurement for Scroll Containers
 * 
 * Provides utilities for measuring the total content size of a node,
 * which is needed to calculate scroll dimensions (scrollWidth, scrollHeight).
 * 
 * The measurement uses computed Yoga layouts when available, which is the
 * authoritative source for element positions and sizes after layout has run.
 */

import type { CliNode } from '../types.js';
import { measureWrappedText, getWrapOptionsFromStyle } from './text-wrap.js';
import { getNodeChildren } from '../utils/node.js';
import { computeStylesheetStyle } from '../style/stylesheet.js';

/**
 * Measure the total content size of a node's children.
 * This calculates the full size of content, which may exceed the container bounds
 * when overflow: scroll or overflow: auto is set.
 * 
 * Uses computed layout positions from Yoga, which already account for:
 * - Child sizes (including their padding/borders)
 * - Gap between flex children
 * - Margins
 * - Flex positioning
 * 
 * @param node - The container node to measure content for.
 * @returns The total width and height of all content.
 */
export function measureContentSize(node: CliNode): { width: number; height: number } {
    const children = getNodeChildren(node);
    
    if (children.length === 0) {
        return { width: 0, height: 0 };
    }
    
    // Get padding offset - child layouts are relative to parent's content box,
    // but their `top`/`left` values include the padding offset
    let paddingTop = 0;
    let paddingLeft = 0;
    const yogaNode = node.yogaNode;
    if (yogaNode) {
        // Yoga.EDGE_LEFT = 0, Yoga.EDGE_TOP = 1
        paddingLeft = yogaNode.getComputedPadding(0) || 0;
        paddingTop = yogaNode.getComputedPadding(1) || 0;
    }
    
    let maxRight = 0;
    let maxBottom = 0;
    
    // Iterate through all children and find the maximum extent
    for (const child of children) {
        const childNode = child as CliNode;
        const { width: childWidth, height: childHeight, top: childTop, left: childLeft } = 
            getChildExtent(childNode, paddingTop, paddingLeft);
        
        const childRight = childLeft + childWidth;
        const childBottom = childTop + childHeight;
        
        maxRight = Math.max(maxRight, childRight);
        maxBottom = Math.max(maxBottom, childBottom);
    }
    
    return { width: maxRight, height: maxBottom };
}

/**
 * Get the extent (position and size) of a child node.
 * 
 * After computeLayout() runs, all element nodes have computed layouts.
 * Text nodes are the only exception - they don't get Yoga nodes because
 * they're inline content rendered by their parent element.
 * 
 * @param node - The child node.
 * @param parentPaddingTop - Parent's top padding for coordinate conversion.
 * @param parentPaddingLeft - Parent's left padding for coordinate conversion.
 * @returns The child's position and size in content-relative coordinates.
 */
function getChildExtent(
    node: CliNode,
    parentPaddingTop: number,
    parentPaddingLeft: number
): { width: number; height: number; top: number; left: number } {
    // Text nodes don't have computed layouts - they're inline content
    // Their size is handled by the parent element's text rendering
    if (node.type === 'text' || node.nodeType === 3) {
        return { width: 0, height: 0, top: 0, left: 0 };
    }
    
    // All element nodes should have computed layouts after computeLayout() runs
    if (!node.computedLayout) {
        // This indicates a bug - an element node without layout in a rendered tree
        console.warn('measureContentSize: element node missing computedLayout', node);
        return { width: 0, height: 0, top: 0, left: 0 };
    }
    
    const layout = node.computedLayout;
    return {
        // Convert from layout coordinates (include padding) to content coordinates
        left: layout.left - parentPaddingLeft,
        top: layout.top - parentPaddingTop,
        width: layout.width,
        height: layout.height,
    };
}


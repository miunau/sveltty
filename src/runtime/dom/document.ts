import { happyDocument, happyWindow, getCliNode } from './happy.js';
import type { CliNode } from '../types.js';

export const document = happyDocument;
export const window = happyWindow;

/**
 * Get a CLI node by its DOM ID.
 * This wraps document.getElementById and returns the associated CliNode.
 * 
 * @param id - The element ID to look up.
 * @returns The CliNode with that ID, or null if not found.
 */
export function getCliNodeById(id: string): CliNode | null {
    const dom = document.getElementById(id);
    return getCliNode(dom as Node | null);
}

/**
 * Query a single CLI node by CSS selector.
 * 
 * @param selector - CSS selector string.
 * @returns The first matching CliNode, or null if none found.
 */
export function queryCliNode(selector: string): CliNode | null {
    const dom = document.querySelector(selector);
    return getCliNode(dom as Node | null);
}

/**
 * Query all CLI nodes matching a CSS selector.
 * 
 * @param selector - CSS selector string.
 * @returns Array of matching CliNodes.
 */
export function queryCliNodes(selector: string): CliNode[] {
    const list = document.querySelectorAll(selector);
    return Array.from(list)
        .map(node => getCliNode(node as unknown as Node))
        .filter((node): node is CliNode => node !== null);
}

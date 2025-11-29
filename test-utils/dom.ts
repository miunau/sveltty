import { getDomNode } from '../src/runtime/dom/happy.js';
import { free_node } from '../src/runtime/index.js';
import { unregisterFocusable } from '../src/runtime/focus.js';

const trackedNodes = new Set<any>();

export function mountIntoDocument(node: any): void {
    const dom = getDomNode(node);
    const body = globalThis.document?.body;
    if (dom && body && !dom.parentNode) {
        body.appendChild(dom);
    }
}

/**
 * Mount a CLI node into the Happy DOM document before running the callback.
 */
export function renderWithDom<T>(node: any, fn?: () => T): T | void {
    mountIntoDocument(node);
    return fn?.();
}

/**
 * Track a CLI node so the test harness can dispose of it after the test run.
 */
export function trackNode<T>(node: T): T {
    trackedNodes.add(node);
    return node;
}

/**
 * Dispose of any tracked nodes and reset the DOM between tests.
 */
export function cleanupTestNodes(): void {
    for (const node of trackedNodes) {
        unregisterFocusable(node);
    }
    for (const node of trackedNodes) {
        const parent = node.parent;
        if (!parent || !trackedNodes.has(parent)) {
            free_node(node);
        }
    }
    trackedNodes.clear();
    resetDocument();
}

export function resetDocument(): void {
    const body = globalThis.document?.body;
    if (body) {
        body.innerHTML = '';
    }
}

/**
 * Await a short delay so asynchronous render cycles have a chance to run.
 *
 * @param delay - Milliseconds to wait before resolving.
 */
export function flushRenders(delay: number = 10): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delay));
}


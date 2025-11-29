import type { CliNode, ComputedLayout } from './types.js';
import { TEXT_NODE } from './types.js';
import { getNodeTag, getNodeChildren } from './utils/node.js';

export interface CliSnapshot {
    nodeName: string;
    type: number;
    text?: string;
    layout?: ComputedLayout;
    children: CliSnapshot[];
}

export interface SnapshotOptions {
    includeLayout?: boolean;
}

export const DEVTOOLS_GLOBAL_KEY = '__SVELTTY_DEVTOOLS__';

/**
 * Create a serializable snapshot of the CLI node tree for inspection.
 *
 * @param node - Root CLI node to snapshot.
 * @param options - Snapshot behavior flags.
 */
export function snapshotTree(node: CliNode, options: SnapshotOptions = {}): CliSnapshot {
    const includeLayout = options.includeLayout ?? false;
    const snapshot: CliSnapshot = {
        nodeName: getNodeTag(node) || String(node.nodeName ?? ''),
        type: node.nodeType ?? 1,
        children: [],
    };

    if (snapshot.type === TEXT_NODE) {
        snapshot.text = (node as CliNode & { textContent?: string }).textContent ?? (node as CliNode & { value?: string }).value ?? '';
    }

    if (includeLayout && node.computedLayout) {
        snapshot.layout = { ...node.computedLayout };
    }

    snapshot.children = getNodeChildren(node).map(child => snapshotTree(child, options));

    return snapshot;
}

/**
 * Publish the provided snapshot to the global devtools hook so external tooling
 * can read the current CLI tree without poking into internals.
 */
export function publishSnapshot(snapshot: CliSnapshot): void {
    (globalThis as any)[DEVTOOLS_GLOBAL_KEY] = snapshot;
}


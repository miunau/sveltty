import type { CliNode } from '../../types.js';

export interface RenderMetrics {
    width: number;
    height: number;
}

export function measureRoot(root: CliNode): RenderMetrics {
    if (!root.computedLayout) {
        throw new Error('Layout must be computed before rendering');
    }
    const width = Math.max(0, Math.ceil(root.computedLayout.width));
    const height = Math.max(0, Math.ceil(root.computedLayout.height));
    return { width, height };
}



import type { GridCell } from '../types.js';

export function createRenderGrid(width: number, height: number): GridCell[][] {
    const safeWidth = Math.max(0, Math.ceil(width));
    const safeHeight = Math.max(0, Math.ceil(height));
    return Array.from({ length: safeHeight }, () =>
        Array.from({ length: safeWidth }, () => ({ char: ' ' }))
    );
}



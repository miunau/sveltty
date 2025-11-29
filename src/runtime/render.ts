/**
 * Main render entry point.
 * 
 * All styling is driven by computed CSS styles from the user-agent stylesheet.
 */
import type { CliNode } from './types.js';
import type { RenderOutput } from './types.js';
import { measureRoot } from './render/pipeline/measure.js';
import { createRenderGrid } from './render/pipeline/layout.js';
import { paintTree } from './render/pipeline/paint.js';
import { getOcclusionZones } from './render/occlusion.js';
import { diffAndSerialize } from './render/pipeline/diff.js';
import { measureText } from './render/text.js';
import { serializeRenderedImages, markImageDirtyRows } from './render/image.js';
import { log } from './logger.js';

/** ANSI escape codes for cursor control. */
const HIDE_CURSOR = '\x1b[?25l';

export interface RenderOptions {
    statusLine?: string;
}

export function renderToString(root: CliNode, options: RenderOptions = {}): RenderOutput {
    log('renderToString:enter');
    
    log('renderToString:measureRoot');
    const metrics = measureRoot(root);
    log('renderToString:measureRoot:done', { width: metrics.width, height: metrics.height });
    
    log('renderToString:createGrid');
    const grid = createRenderGrid(metrics.width, metrics.height);
    log('renderToString:createGrid:done', { rows: grid.length, cols: grid[0]?.length ?? 0 });
    
    log('renderToString:paintTree');
    paintTree(root, grid);
    log('renderToString:paintTree:done');
    
    // Mark rows dirty where images have moved away from
    // This must happen BEFORE diffAndSerialize so those rows get re-rendered
    log('renderToString:markImageDirtyRows');
    markImageDirtyRows();
    log('renderToString:markImageDirtyRows:done');
    
    // Hide cursor during all rendering operations (and keep it hidden)
    let output = HIDE_CURSOR;
    
    // Serialize grid to ANSI output
    log('renderToString:diffAndSerialize');
    output += diffAndSerialize(root, grid, options.statusLine);
    log('renderToString:diffAndSerialize:done');
    
    // Serialize images (and clear any that were removed)
    // Always call this - even with no images, we may need to clear removed images
    log('renderToString:serializeImages');
    output += serializeRenderedImages(getOcclusionZones());
    log('renderToString:serializeImages:done');
    
    log('renderToString:exit');
    return {
        output,
        width: metrics.width,
        height: metrics.height,
    };
}

export { measureText };

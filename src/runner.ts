import { mount } from './runtime/mount.js';
import type { MountOptions } from './runtime/types.js';
import { setLogFile, enableLogging, log } from './runtime/logger.js';
import { loadFile } from './loader.js';

export interface RunOptions extends Omit<MountOptions, 'exitOnCtrlC'> {
    /** Auto-unmount after this many milliseconds (0 = keep running) */
    once?: number;
    /** Enable Ctrl+C handling (default true) */
    exitOnCtrlC?: boolean;
    /** Path to debug log file. Enables file-based debug logging. */
    debugLog?: string;
    /** 
     * Base directory for resolving relative .svelte paths.
     * Defaults to the calling file's directory (detected automatically).
     */
    baseDir?: string;
}

// Re-export logging utilities for use by app code
export { log, setLogFile, enableLogging } from './runtime/logger.js';

// Re-export loader utilities
export { loadFile, compileSvelte, clearModuleCache, invalidateModule, type LoadSvelteOptions } from './loader.js';

export function runComponent(Component: any, opts: RunOptions = {}) {
    const {
        props = {},
        stdout,
        stdin,
        debug = false,
        clearOnExit = false,
        exitOnCtrlC = true,
        once = 0,
        debugLog,
    } = opts;

    // Enable file-based debug logging if path provided
    if (debugLog) {
        setLogFile(debugLog);
        enableLogging(true);
        log('runComponent', { component: Component?.name ?? 'unknown', debug, once });
    }

    const app = mount(Component, {
        props,
        stdout,
        stdin,
        debug,
        clearOnExit,
        exitOnCtrlC,
    });

    if (once > 0) {
        setTimeout(() => app.unmount(), once);
    }

    return app;
}

/**
 * Load and run a Svelte component from a file path.
 * Combines loadFile and runComponent for convenience.
 * 
 * Relative paths are resolved from the calling file's directory by default.
 * 
 * @param filePath - Path to the .svelte file (absolute or relative)
 * @param opts - Run options (same as runComponent, plus baseDir for path resolution)
 * @returns The mounted application instance
 * 
 * @example
 * ```typescript
 * import { runFile } from 'sveltty/runner';
 * 
 * // Just works - relative to your script
 * await runFile('./App.svelte');
 * 
 * // With props
 * await runFile('./App.svelte', {
 *     props: { name: 'World' },
 * });
 * ```
 */
export async function runFile(filePath: string, opts: RunOptions = {}) {
    const { baseDir, ...runOpts } = opts;
    const Component = await loadFile(filePath, { baseDir });
    return runComponent(Component, runOpts);
}

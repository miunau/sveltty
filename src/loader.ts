/**
 * Runtime Svelte Loader
 * 
 * Compiles .svelte files on-the-fly for use with sveltty.
 * This eliminates the need for Vite or other build tools.
 * Supports nested component imports - child .svelte files are compiled recursively.
 */

import { readFile, writeFile, mkdir, unlink, rm } from 'fs/promises';
import { resolve, basename, dirname, isAbsolute } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { compile } from 'svelte/compiler';

/**
 * Get the directory of the calling file by parsing the error stack.
 * This allows us to resolve relative paths from the caller's location.
 */
function getCallerDir(): string | null {
    const originalPrepare = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, stack) => stack;
    const err = new Error();
    const stack = err.stack as unknown as NodeJS.CallSite[];
    Error.prepareStackTrace = originalPrepare;
    
    // Find the first call site outside of this file and sveltty internals
    for (const site of stack) {
        const filename = site.getFileName();
        if (!filename) continue;
        
        // Skip internal sveltty files
        if (filename.includes('/sveltty/') || filename.includes('\\sveltty\\')) continue;
        if (filename.includes('/loader.') || filename.includes('/runner.')) continue;
        
        // Found the caller
        if (filename.startsWith('file://')) {
            return dirname(fileURLToPath(filename));
        }
        return dirname(filename);
    }
    
    return null;
}

/** Cache of compiled modules to avoid recompilation */
const moduleCache = new Map<string, unknown>();

/** Temp directory for compiled modules */
let tempDir: string | null = null;

/** Map of source paths to their compiled temp file paths */
const compiledPaths = new Map<string, string>();
 
/** Resolved absolute file:// URLs for sveltty imports */
let resolvedUrls: Record<string, string> | null = null;

/**
 * Get the resolved absolute URLs for sveltty imports.
 * Uses import.meta.resolve which works with ESM exports.
 */
async function getResolvedUrls(): Promise<Record<string, string>> {
    if (!resolvedUrls) {
        // import.meta.resolve returns file:// URLs
        const adapterUrl = import.meta.resolve('sveltty/runtime/adapter');
        const discloseUrl = import.meta.resolve('sveltty/runtime/client/disclose-version');
        const operationsUrl = import.meta.resolve('sveltty/runtime/operations');
        
        resolvedUrls = {
            'svelte/internal/client': adapterUrl,
            'svelte/internal/disclose-version': discloseUrl,
            'svelte/internal/client/dom/operations': operationsUrl,
        };
    }
    return resolvedUrls;
}

/**
 * Svelte internal imports that should be removed (no-ops in sveltty).
 * These are typically feature flags or optional modules.
 */
const REMOVE_IMPORTS = [
    'svelte/internal/flags/legacy',
    'svelte/internal/flags/async',
    'svelte/internal/flags/tracing',
];

/**
 * Get or create the temp directory for compiled modules.
 */
async function getTempDir(): Promise<string> {
    if (!tempDir) {
        tempDir = resolve(tmpdir(), `sveltty-${randomBytes(6).toString('hex')}`);
        await mkdir(tempDir, { recursive: true });
    }
    return tempDir;
}

/**
 * Transform compiled Svelte JS to redirect internal imports to absolute sveltty paths.
 * @param code - Compiled JavaScript code
 * @returns Transformed code with redirected imports
 */
async function transformImports(code: string): Promise<string> {
    const urls = await getResolvedUrls();
    let result = code;
    
    // Remove no-op imports (feature flags that sveltty doesn't use)
    for (const removeImport of REMOVE_IMPORTS) {
        result = result.replace(
            new RegExp(`import\\s+['"]${escapeRegExp(removeImport)}['"];?\\n?`, 'g'),
            ''
        );
    }
    
    for (const [from, fileUrl] of Object.entries(urls)) {
        // Handle both quoted styles for 'from' imports
        result = result.replace(
            new RegExp(`from\\s+["']${escapeRegExp(from)}["']`, 'g'),
            `from "${fileUrl}"`
        );
        // Handle dynamic imports
        result = result.replace(
            new RegExp(`import\\(\\s*["']${escapeRegExp(from)}["']\\s*\\)`, 'g'),
            `import("${fileUrl}")`
        );
    }
    
    // Also handle bare 'svelte/internal/...' side-effect imports
    const discloseUrl = urls['svelte/internal/disclose-version'];
    result = result.replace(
        /import\s+['"]svelte\/internal\/disclose-version['"]/g,
        `import '${discloseUrl}'`
    );
    
    return result;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compile a Svelte component source to JavaScript.
 * @param source - Svelte component source code
 * @param filename - Filename for error messages and sourcemaps
 * @returns Compiled and transformed JavaScript code
 */
export async function compileSvelte(source: string, filename: string): Promise<string> {
    const result = compile(source, {
        filename,
        generate: 'client',
        dev: false,
        css: 'injected',
    });
    
    // Log any warnings
    for (const warning of result.warnings) {
        console.warn(`[sveltty] ${warning.filename}:${warning.start?.line ?? '?'} - ${warning.message}`);
    }
    
    return transformImports(result.js.code);
}

/**
 * Regex to find .svelte imports in compiled code.
 * Matches: import X from './path.svelte' or import './path.svelte'
 */
const SVELTE_IMPORT_REGEX = /import\s+(?:(\w+)\s+from\s+)?['"]([^'"]+\.svelte)['"]/g;

/**
 * Find all .svelte imports in compiled code.
 * @param code - Compiled JavaScript code
 * @param sourceDir - Directory of the source file for resolving relative paths
 * @returns Array of absolute paths to imported .svelte files
 */
function findSvelteImports(code: string, sourceDir: string): string[] {
    const imports: string[] = [];
    let match;
    
    while ((match = SVELTE_IMPORT_REGEX.exec(code)) !== null) {
        const importPath = match[2];
        // Resolve relative to source file's directory
        const absolutePath = resolve(sourceDir, importPath);
        imports.push(absolutePath);
    }
    
    return imports;
}

/**
 * Recursively compile a Svelte file and all its .svelte dependencies.
 * @param absolutePath - Absolute path to the .svelte file
 * @param compiled - Set of already-compiled paths (to avoid cycles)
 * @returns Map of source paths to compiled temp file paths
 */
async function compileRecursive(
    absolutePath: string,
    compiled: Set<string> = new Set()
): Promise<void> {
    // Skip if already compiled
    if (compiled.has(absolutePath) || compiledPaths.has(absolutePath)) {
        return;
    }
    compiled.add(absolutePath);
    
    // Read and compile source
    const source = await readFile(absolutePath, 'utf-8');
    let code = await compileSvelte(source, absolutePath);
    
    const sourceDir = dirname(absolutePath);
    
    // Find and recursively compile all .svelte imports
    const svelteImports = findSvelteImports(code, sourceDir);
    for (const importPath of svelteImports) {
        await compileRecursive(importPath, compiled);
    }
    
    // Rewrite .svelte imports to point to compiled temp files
    code = rewriteSvelteImports(code, sourceDir);
    
    // Write to temp file
    const dir = await getTempDir();
    const tempFile = resolve(dir, `${basename(absolutePath, '.svelte')}-${randomBytes(4).toString('hex')}.mjs`);
    await writeFile(tempFile, code, 'utf-8');
    
    compiledPaths.set(absolutePath, tempFile);
}

/**
 * Rewrite .svelte imports in compiled code to point to their temp files.
 * @param code - Compiled JavaScript code
 * @param sourceDir - Directory of the source file
 * @returns Code with rewritten imports
 */
function rewriteSvelteImports(code: string, sourceDir: string): string {
    return code.replace(SVELTE_IMPORT_REGEX, (match, name, importPath) => {
        const absolutePath = resolve(sourceDir, importPath);
        const tempFile = compiledPaths.get(absolutePath);
        
        if (tempFile) {
            const tempUrl = pathToFileURL(tempFile).href;
            if (name) {
                return `import ${name} from '${tempUrl}'`;
            } else {
                return `import '${tempUrl}'`;
            }
        }
        
        // Shouldn't happen, but return original if not found
        return match;
    });
}

export interface LoadSvelteOptions {
    /** Cache compiled modules (default: true) */
    cache?: boolean;
    /** 
     * Base directory for resolving relative paths.
     * Defaults to the calling file's directory (detected via call stack).
     * Falls back to process.cwd() if detection fails.
     */
    baseDir?: string;
}

/**
 * Load a Svelte component from a file path.
 * Recursively compiles all imported .svelte files.
 * 
 * Relative paths are resolved from the calling file's directory by default.
 * 
 * @param filePath - Path to the .svelte file (absolute or relative)
 * @param options - Load options
 * @returns The compiled Svelte component constructor
 * 
 * @example
 * ```typescript
 * import { loadSvelteFile, runComponent } from 'sveltty';
 * 
 * // Relative to calling script (automatic)
 * const App = await loadSvelteFile('./App.svelte');
 * 
 * runComponent(App, { props: { name: 'World' } });
 * ```
 */
export async function loadSvelteFile(
    filePath: string,
    options: LoadSvelteOptions = {}
): Promise<unknown> {
    const { cache = true } = options;
    
    // Resolve to absolute path
    let absolutePath: string;
    if (isAbsolute(filePath)) {
        absolutePath = filePath;
    } else {
        // Use provided baseDir, or detect caller's directory, or fall back to cwd
        const baseDir = options.baseDir ?? getCallerDir() ?? process.cwd();
        absolutePath = resolve(baseDir, filePath);
    }
    
    // Check cache
    if (cache && moduleCache.has(absolutePath)) {
        return moduleCache.get(absolutePath);
    }
    
    // Recursively compile this file and all its .svelte dependencies
    await compileRecursive(absolutePath);
    
    const tempFile = compiledPaths.get(absolutePath);
    if (!tempFile) {
        throw new Error(`Failed to compile ${filePath}`);
    }
    
    const module = await import(pathToFileURL(tempFile).href);
    const component = module.default;
    
    // Cache it
    if (cache) {
        moduleCache.set(absolutePath, component);
    }
    
    return component;
}

/**
 * Clear the module cache and clean up temp files.
 * Useful for hot reloading or testing.
 */
export async function clearModuleCache(): Promise<void> {
    moduleCache.clear();
    
    // Clean up temp files
    for (const tempFile of compiledPaths.values()) {
        await unlink(tempFile).catch(() => {});
    }
    compiledPaths.clear();
    
    // Remove temp directory
    if (tempDir) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
        tempDir = null;
    }
}

/**
 * Remove a specific file from the module cache.
 * Also removes all compiled files since dependencies may have changed.
 * @param filePath - Path to the .svelte file
 */
export async function invalidateModule(filePath: string): Promise<void> {
    const absolutePath = resolve(process.cwd(), filePath);
    moduleCache.delete(absolutePath);
    
    // For simplicity, clear all compiled paths when any module is invalidated
    // This ensures stale dependencies are recompiled
    for (const tempFile of compiledPaths.values()) {
        await unlink(tempFile).catch(() => {});
    }
    compiledPaths.clear();
}


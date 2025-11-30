/**
 * Node.js ESM Loader Hooks for Svelte files
 * 
 * These hooks intercept .svelte imports and compile them on-the-fly.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import { compile } from 'svelte/compiler';

/** Resolved absolute file:// URLs for sveltty imports */
let resolvedUrls: Record<string, string> | null = null;

/**
 * Svelte internal imports that should be removed (no-ops in sveltty).
 */
const REMOVE_IMPORTS = [
    'svelte/internal/flags/legacy',
    'svelte/internal/flags/async',
    'svelte/internal/flags/tracing',
];

/**
 * Get the resolved absolute URLs for sveltty imports.
 * Resolves relative to this file's location within the sveltty package.
 */
function getResolvedUrls(): Record<string, string> {
    if (!resolvedUrls) {
        // Resolve relative to this file's location: register/hooks.js -> runtime/...
        const thisDir = dirname(fileURLToPath(import.meta.url));
        const runtimeDir = new URL('../runtime/', pathToFileURL(thisDir + '/')).href;
        
        resolvedUrls = {
            'svelte/internal/client': runtimeDir + 'adapter.js',
            'svelte/internal/disclose-version': runtimeDir + 'client/disclose-version.js',
            'svelte/internal/client/dom/operations': runtimeDir + 'operations.js',
        };
    }
    return resolvedUrls;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Transform compiled Svelte JS to redirect internal imports to sveltty.
 */
function transformImports(code: string): string {
    const urls = getResolvedUrls();
    let result = code;
    
    // Remove no-op imports
    for (const removeImport of REMOVE_IMPORTS) {
        result = result.replace(
            new RegExp(`import\\s+['"]${escapeRegExp(removeImport)}['"];?\\n?`, 'g'),
            ''
        );
    }
    
    // Redirect svelte internal imports to sveltty
    for (const [from, fileUrl] of Object.entries(urls)) {
        result = result.replace(
            new RegExp(`from\\s+["']${escapeRegExp(from)}["']`, 'g'),
            `from "${fileUrl}"`
        );
        result = result.replace(
            new RegExp(`import\\(\\s*["']${escapeRegExp(from)}["']\\s*\\)`, 'g'),
            `import("${fileUrl}")`
        );
    }
    
    // Handle bare side-effect imports
    const discloseUrl = urls['svelte/internal/disclose-version'];
    result = result.replace(
        /import\s+['"]svelte\/internal\/disclose-version['"]/g,
        `import '${discloseUrl}'`
    );
    
    return result;
}

/**
 * Compile a Svelte file to JavaScript.
 */
async function compileSvelteFile(filePath: string): Promise<string> {
    const source = await readFile(filePath, 'utf-8');
    
    const result = compile(source, {
        filename: filePath,
        generate: 'client',
        dev: false,
        css: 'injected',
    });
    
    // Log warnings
    for (const warning of result.warnings) {
        console.warn(`[sveltty] ${warning.filename}:${warning.start?.line ?? '?'} - ${warning.message}`);
    }
    
    return transformImports(result.js.code);
}

// Types for Node.js loader hooks
interface ResolveContext {
    conditions: string[];
    importAttributes: Record<string, string>;
    parentURL?: string;
}

interface ResolveResult {
    url: string;
    shortCircuit?: boolean;
    format?: string;
}

interface LoadContext {
    conditions: string[];
    importAttributes: Record<string, string>;
    format?: string;
}

interface LoadResult {
    format: string;
    source: string | ArrayBuffer;
    shortCircuit?: boolean;
}

type NextResolve = (specifier: string, context: ResolveContext) => Promise<ResolveResult>;
type NextLoad = (url: string, context: LoadContext) => Promise<LoadResult>;

/**
 * Resolve hook - handles module resolution.
 * For .svelte files, we ensure they resolve to file:// URLs.
 */
export async function resolve(
    specifier: string,
    context: ResolveContext,
    nextResolve: NextResolve
): Promise<ResolveResult> {
    // Handle .svelte imports
    if (specifier.endsWith('.svelte')) {
        // If it's a relative import, resolve it relative to the parent
        if (specifier.startsWith('.') && context.parentURL) {
            const parentPath = dirname(fileURLToPath(context.parentURL));
            const resolved = new URL(specifier, pathToFileURL(parentPath + '/'));
            return {
                url: resolved.href,
                shortCircuit: true,
                format: 'svelte',
            };
        }
    }
    
    // Let Node handle everything else
    return nextResolve(specifier, context);
}

/**
 * Load hook - handles loading and transforming modules.
 * For .svelte files, we compile them to JavaScript.
 */
export async function load(
    url: string,
    context: LoadContext,
    nextLoad: NextLoad
): Promise<LoadResult> {
    // Handle .svelte files
    if (url.endsWith('.svelte') || context.format === 'svelte') {
        const filePath = fileURLToPath(url);
        const source = await compileSvelteFile(filePath);
        
        return {
            format: 'module',
            source,
            shortCircuit: true,
        };
    }
    
    // Let Node handle everything else
    return nextLoad(url, context);
}


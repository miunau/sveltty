import { resolve } from 'path';
import { fileURLToPath } from 'url';
import type { Plugin } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const RUNTIME_DIR = resolve(__dirname, '../runtime');
const CLIENT_IDS = new Set([
    'svelte/internal/client',
    'svelte/internal/client/index',
    'svelte/internal/client/index.js',
]);

type PluginMode = 'package' | 'workspace';

export function svelteCliAliasPlugin(mode: PluginMode = 'package'): Plugin {
    const isPackageMode = mode === 'package';
    const aliasMap = isPackageMode
        ? new Map<string, string>([
              ['svelte/internal/client', 'sveltty/runtime/adapter'],
              ['svelte/internal/client/index', 'sveltty/runtime/adapter'],
              ['svelte/internal/client/index.js', 'sveltty/runtime/adapter'],
              ['svelte/internal/disclose-version', 'sveltty/runtime/client/disclose-version'],
              ['svelte/internal/client/dom/operations', 'sveltty/runtime/operations'],
              ['svelte/internal/client/dom/operations.js', 'sveltty/runtime/operations'],
          ])
        : workspaceAliasMap();
    return {
        name: 'sveltty-alias',
        enforce: 'pre',
        resolveId(source, importer) {
            const target = aliasMap.get(source);
            if (!target) {
                return null;
            }
            if (isPackageMode) {
                return { id: target, external: true };
            }
            if (importer && importer.startsWith(RUNTIME_DIR) && CLIENT_IDS.has(source)) {
                return null;
            }
            return target;
        },
    };
}

function workspaceAliasMap(): Map<string, string> {
    return new Map<string, string>([
        ['svelte/internal/client', resolve(RUNTIME_DIR, 'adapter.ts')],
        ['svelte/internal/client/index', resolve(RUNTIME_DIR, 'adapter.ts')],
        ['svelte/internal/client/index.js', resolve(RUNTIME_DIR, 'adapter.ts')],
        ['svelte/internal/disclose-version', resolve(RUNTIME_DIR, 'client/disclose-version.ts')],
        ['svelte/internal/client/dom/operations', resolve(RUNTIME_DIR, 'operations.ts')],
        ['svelte/internal/client/dom/operations.js', resolve(RUNTIME_DIR, 'operations.ts')],
        ['sveltty/runtime/client', resolve(RUNTIME_DIR, 'client/index.ts')],
        ['sveltty/runtime/adapter', resolve(RUNTIME_DIR, 'adapter.ts')],
        ['sveltty/runtime/client/disclose-version', resolve(RUNTIME_DIR, 'client/disclose-version.ts')],
        ['sveltty/runtime/operations', resolve(RUNTIME_DIR, 'operations.ts')],
    ]);
}


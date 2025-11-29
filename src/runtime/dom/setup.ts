import { document, window } from './document.js';
import {
    getScrollPropertyDescriptors,
    getScrollMethodDescriptors,
} from '../scroll.js';

async function loadOperations() {
    try {
        // Prefer aliased path (handled by bundler/plugin)
        // @ts-ignore
        return await import('svelte/internal/client/dom/operations.js');
    } catch (err) {
        const fallback = new URL('../../../node_modules/svelte/src/internal/client/dom/operations.js', import.meta.url).href;
        // @ts-ignore
        return await import(fallback);
    }
}

let globalsInstalled = false;
let runtimeReady: Promise<void> | null = null;

export function ensureDomGlobals(): void {
    installDomBindings();
    if (globalsInstalled) return;
    globalsInstalled = true;

    const targets = [globalThis];
    if (typeof global !== 'undefined') {
        targets.push(global);
    }

    for (const target of targets) {
        if (!target.document) target.document = document as unknown as Document;
        if (!target.window) target.window = window as unknown as Window & typeof globalThis;
    }

    if (!globalThis.navigator) {
        Object.defineProperty(globalThis, 'navigator', {
            value: window.navigator,
            writable: true,
            configurable: true,
        });
    }

}

let scrollPatchApplied = false;

/**
 * Patch Element prototype with DOM-compatible scroll properties and methods.
 * This enables standard scroll API (scrollTop, scrollLeft, scroll(), scrollBy(), etc.)
 * on CLI nodes.
 */
function patchElementScrollAPI(): void {
    if (scrollPatchApplied) return;
    scrollPatchApplied = true;
    
    const ElementProto = window.Element?.prototype;
    if (!ElementProto) return;
    
    // Add scroll properties (scrollTop, scrollLeft, scrollWidth, scrollHeight, clientWidth, clientHeight)
    const propertyDescriptors = getScrollPropertyDescriptors();
    for (const [name, descriptor] of Object.entries(propertyDescriptors)) {
        // Only define if not already present or if we want to override
        if (!(name in ElementProto)) {
            Object.defineProperty(ElementProto, name, descriptor);
        }
    }
    
    // Add scroll methods (scroll, scrollTo, scrollBy, scrollIntoView)
    const methodDescriptors = getScrollMethodDescriptors();
    for (const [name, descriptor] of Object.entries(methodDescriptors)) {
        // Override existing methods to use our CLI-aware implementation
        Object.defineProperty(ElementProto, name, descriptor);
    }
}

function installDomBindings(): void {
    const targets = [globalThis];
    if (typeof global !== 'undefined') {
        targets.push(global);
    }

    for (const target of targets) {
        if (!target.document) target.document = document as unknown as Document;
        if (!target.window) target.window = window as unknown as Window & typeof globalThis;
    }

    if (!globalThis.navigator) {
        Object.defineProperty(globalThis, 'navigator', {
            value: window.navigator,
            writable: true,
            configurable: true,
        });
    }

    const domTypes: Array<keyof typeof window> = [
        'Element',
        'HTMLElement',
        'Node',
        'Text',
        'Document',
        'CustomEvent',
        'KeyboardEvent',
        'MouseEvent',
        'PointerEvent',
    ];

    for (const typeName of domTypes) {
        const ctor = window[typeName];
        if (ctor && !(globalThis as Record<string | number | symbol, any>)[typeName]) {
            Object.defineProperty(globalThis, typeName, {
                value: ctor,
                writable: true,
                configurable: true,
            });
        }
    }
    
    // Patch Element prototype with scroll API
    patchElementScrollAPI();
}

export function ensureRuntimeReady(): Promise<void> {
    if (runtimeReady) return runtimeReady;
    ensureDomGlobals();
    runtimeReady = loadOperations().then(operations => {
        if (typeof operations.init_operations === 'function') {
            operations.init_operations();
        }
    });
    return runtimeReady;
}

export { document, window };

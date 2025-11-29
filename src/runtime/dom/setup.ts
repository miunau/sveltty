import { document, window } from './document.js';
import {
    getScrollPropertyDescriptors,
    getScrollMethodDescriptors,
} from '../scroll.js';

/**
 * Initialize Svelte's internal DOM state.
 * This mirrors what svelte/internal/client/dom/operations.js does in init_operations().
 * We implement it ourselves to avoid path resolution issues when sveltty is installed
 * as a package in different environments (npm, pnpm, yarn, etc.).
 */
function initSvelteOperations(): void {
    const elementPrototype = window.Element?.prototype;
    const textPrototype = window.Text?.prototype;
    
    if (elementPrototype) {
        // Performance optimizations that Svelte adds to Element prototype
        // These properties are used by Svelte's compiled output
        const ext = elementPrototype as unknown as Record<string, unknown>;
        if (ext.__click === undefined) ext.__click = undefined;
        if (ext.__className === undefined) ext.__className = undefined;
        if (ext.__attributes === undefined) ext.__attributes = null;
        if (ext.__style === undefined) ext.__style = undefined;
        if (ext.__e === undefined) ext.__e = undefined;
    }
    
    if (textPrototype) {
        const ext = textPrototype as unknown as Record<string, unknown>;
        if (ext.__t === undefined) ext.__t = undefined;
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
    // Initialize Svelte's DOM state synchronously
    initSvelteOperations();
    runtimeReady = Promise.resolve();
    return runtimeReady;
}

export { document, window };

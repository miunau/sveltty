import { ensureDomGlobals, ensureRuntimeReady as setupRuntime } from './dom/setup.js';

ensureDomGlobals();
void setupRuntime();

export async function ensureRuntimeReady(): Promise<void> {
    await setupRuntime();
}

export * from './client/index.js';
export { document } from './dom/document.js';
export { mount } from './mount.js';

/**
 * Mount and render Svelte components to the terminal
 * Using DOM-compatible architecture
 */

import { ensureDomGlobals, ensureRuntimeReady } from './dom/setup.js';
import { create_root, set_style, computeLayout, renderToString, free_node } from './index.js';
import type { AppInstance, CliNode, MountOptions, RootNode } from './types.js';
import { effect_root, flush } from 'svelte/internal/client';
import {
    createFocusController,
    dispatchKey,
    ensureDefaultFocus,
    setRenderScheduler,
    withFocusController,
} from './focus.js';
import { decodeKey } from './input/keyboard.js';
import { snapshotTree, publishSnapshot } from './devtools.js';
import { ensureBaseStyles } from './style/stylesheet.js';
import { log } from './logger.js';
import { Component } from 'svelte';

ensureDomGlobals();
const runtimeReady = ensureRuntimeReady();
let currentContext: MountContext | null = null;
const activeContexts = new Set<MountContext>();

function registerMountContext(ctx: MountContext): void {
    activeContexts.add(ctx);
    currentContext = ctx;
}

function unregisterMountContext(ctx: MountContext): void {
    activeContexts.delete(ctx);
    if (currentContext === ctx) {
        const next = activeContexts.values().next().value ?? null;
        currentContext = next ?? null;
    }
}

class MountContext {
    root = create_root();
    stdout: NodeJS.WriteStream;
    stdin: NodeJS.ReadStream;
    rafId: NodeJS.Timeout | null = null;
    isUnmounted = false;
    exitPromise: Promise<void>;
    exitResolve: (() => void) | null = null;
    clearOnExit: boolean;
    debug: boolean;
    exitOnCtrlC: boolean;
    props: Record<string, any>;
    Component: Component;
    private focusController = createFocusController();

    constructor(Component: Component, options: MountOptions) {
        ensureBaseStyles();
        const {
            props = {},
            stdout = process.stdout,
            stdin = process.stdin,
            exitOnCtrlC = true,
            clearOnExit = true,
            debug = false,
        } = options;
        this.Component = Component;
        this.props = props;
        this.stdout = stdout;
        this.stdin = stdin;
        this.clearOnExit = clearOnExit;
        this.debug = debug;
        this.exitOnCtrlC = exitOnCtrlC;
        this.exitPromise = new Promise(resolve => {
            this.exitResolve = resolve;
        });
    }

    private runWithFocus<T>(fn: () => T): T {
        return withFocusController(this.focusController, fn);
    }

    async start(): Promise<void> {
        if (!activeContexts.has(this)) {
            registerMountContext(this);
        }
        this.runWithFocus(() => {
        setRenderScheduler(() => this.scheduleRender());
        });
        this.attachInput();
        try {
            await runtimeReady;
            this.runWithFocus(() => {
            effect_root(() => {
                // Cast root to satisfy Svelte's internal type expectations
                this.Component(this.root as never, this.props);
                });
                flush();
            });
            await Promise.resolve();
            flush();
            this.scheduleRender();
        } catch (error) {
            if (this.debug) {
            log('mount:error', { error: String(error) });
            }
            throw error;
        }
    }

    attachInput(): void {
        if (!this.stdin) return;
        if (!this.exitOnCtrlC) return;
        try {
            this.stdin.setRawMode?.(true);
            this.stdin.on('data', this.handleStdinData);
        } catch {
            // stdin may not support raw mode
        }
    }

    detachInput(): void {
        if (!this.stdin) return;
        this.stdin.off('data', this.handleStdinData);
        try {
            this.stdin.setRawMode?.(false);
        } catch {
            // ignore
        }
    }

    handleStdinData = (data: Buffer): void => {
        this.runWithFocus(() => {
        const raw = decodeKey(data);
        if (!raw) return;

        if (raw.ctrl && raw.key.toLowerCase() === 'c') {
            this.unmount();
            process.exit(0);
            return;
        }

        // All other keys go through dispatchKey which:
        // 1. Emits keydown event to focused element
        // 2. Checks defaultPrevented
        // 3. Runs built-in behaviors (Tab, Escape, form controls) only if not prevented
        ensureDefaultFocus();
        dispatchKey(raw);
        });
    };

    scheduleRender = (): void => {
        if (this.isUnmounted) return;
        if (this.rafId) {
            clearTimeout(this.rafId);
        }
        this.rafId = setTimeout(this.render, 0);
    };

    render = (): void => {
        if (this.isUnmounted) return;
        log('render:enter');
        this.runWithFocus(() => {
        try {
                log('render:beforeFlush');
                flush();
                log('render:afterFlush');
                
            const columns = this.stdout.columns || 80;
            const rows = this.stdout.rows || 24;
            set_style(this.root, { width: columns, height: rows });

            if (this.debug) {
                const snapshot = snapshotTree(this.root, { includeLayout: true });
                publishSnapshot(snapshot);
                log('render:treeStructure');
                logTree(this.root, 0);
            }

            log('render:beforeComputeLayout');
            computeLayout(this.root, columns, rows);
            log('render:afterComputeLayout');
            log('render:beforeRenderToString');
            const { output } = renderToString(this.root, {});
            log('render:afterRenderToString');
            this.stdout.write(output);
            log('render:exit');
        } catch (error) {
            log('render:error', { error: String(error) });
            if (this.debug) {
            log('render:error', { error: String(error) });
            }
        }
        });
    };

    unmount(): void {
        if (this.isUnmounted) return;
        this.isUnmounted = true;
        if (this.rafId) {
            clearTimeout(this.rafId);
            this.rafId = null;
        }
        this.detachInput();
        free_node(this.root);
        unregisterMountContext(this);
        if (this.clearOnExit) {
            this.stdout.write('\x1b[2J\x1b[H');
        }
        if (this.exitResolve) {
            this.exitResolve();
        }
    }
}

/**
 * Get the current root node (for component execution)
 */
export function getCurrentRoot(): RootNode | null {
    return currentContext?.root || null;
}

/**
 * Mount a Svelte component to the terminal
 *
 * @param Component - Svelte component constructor
 * @param options - Mount options
 * @returns AppInstance with control methods
 */
export function mount(
    Component: Component,
    options: MountOptions = {}
): AppInstance {
    const ctx = createMountContext(Component, options);
    void ctx.start();

    return {
        unmount: () => ctx.unmount(),
        waitUntilExit: () => ctx.exitPromise,
        rerender: () => ctx.scheduleRender(),
    };
}

/**
 * Instantiate a MountContext without automatically mounting the component.
 * Consumers can call `start()`/`unmount()` directly to orchestrate lifecycles.
 *
 * @param Component - Svelte component constructor.
 * @param options - Mount configuration options.
 */
export function createMountContext(Component: Component, options: MountOptions = {}): MountContext {
    return new MountContext(Component, options);
}

/**
 * Schedule a render on the next tick
 */
export function scheduleRender(): void {
    for (const ctx of activeContexts) {
        ctx.scheduleRender();
    }
}

/**
 * Debug: Log tree structure
 */
function logTree(node: CliNode, depth: number): void {
    const indent = '  '.repeat(depth);
    const nodeInfo = node.nodeType === 3 // TEXT_NODE
        ? `text: "${node.textContent}"`
        : node.nodeName;
    const children = node.childNodes ?? node.children ?? [];
    const childCount = children.length;
    const styleKeys = Object.keys(node.style || {});
    console.error(`${indent}${nodeInfo} (${childCount} children) style: ${styleKeys.join(',')}`);
    for (const child of children) {
        logTree(child, depth + 1);
    }
}

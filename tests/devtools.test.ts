import { describe, it, expect, afterEach } from 'vitest';
import { snapshotTree, DEVTOOLS_GLOBAL_KEY } from '../src/runtime/devtools.js';
import { create_element, create_root, create_text, append, CliNode } from '../src/runtime/index.js';
import { createMountContext } from '../src/runtime/mount.js';
import { flushRenders, cleanupTestNodes, trackNode } from '../test-utils/dom.js';

afterEach(() => {
    cleanupTestNodes();
    delete globalThis[DEVTOOLS_GLOBAL_KEY];
});

describe('devtools snapshot', () => {
    it('captures node tree with layout metadata', () => {
        const root = trackNode(create_root());
        const box = trackNode(create_element('box'));
        const text = trackNode(create_text('hello'));
        append(box, text);
        append(root, box);
        root.computedLayout = { left: 0, top: 0, width: 10, height: 4 };
        box.computedLayout = { left: 0, top: 0, width: 10, height: 2 };
        text.computedLayout = { left: 0, top: 0, width: 5, height: 1 };

        const snapshot = snapshotTree(root, { includeLayout: true });
        expect(snapshot.nodeName).toBe('root');
        expect(snapshot.children).toHaveLength(1);
        expect(snapshot.children[0].children[0].text).toBe('hello');
        expect(snapshot.children[0].layout?.width).toBe(10);
    });

    it('publishes snapshot when debug mode is enabled', async () => {
        const stdout = {
            columns: 20,
            rows: 10,
            write() {
                // noop for tests
            },
        } as unknown as NodeJS.WriteStream;
        const stdin = {
            setRawMode() {},
            on() {},
            off() {},
        } as unknown as NodeJS.ReadStream;

        const ctx = createMountContext((target: CliNode) => {
            const node = create_element('box');
            append(target, node);
        }, { stdout, stdin, exitOnCtrlC: false, clearOnExit: false, debug: true });

        await ctx.start();
        await flushRenders();
        expect(globalThis[DEVTOOLS_GLOBAL_KEY]).toBeTruthy();

        ctx.unmount();
    });
});



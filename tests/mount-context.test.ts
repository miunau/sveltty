import { describe, it, expect, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import {
    createMountContext,
    scheduleRender,
} from '../src/runtime/mount.js';
import { create_element, create_text, append, set_text } from '../src/runtime/index.js';
import type { CliNode, TextNode } from '../src/runtime/types.js';
import { flushRenders } from '../test-utils/dom.js';

class MockStdin extends EventEmitter {
    setRawMode(): void {
        // no-op
    }
}

function createMockStdout() {
    const writes: string[] = [];
    const stdout = {
        columns: 40,
        rows: 10,
        write(chunk: any) {
            writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
        },
    } as unknown as NodeJS.WriteStream;
    return { stdout, writes };
}

function labelComponent(nodes: TextNode[]) {
    return (target: CliNode, props: { label: string }) => {
        const box = create_element('box');
        const text = create_text(props.label);
        nodes.push(text);
        append(box as CliNode, text as CliNode);
        append(target, box as CliNode);
    };
}

const activeContexts: Array<ReturnType<typeof createMountContext>> = [];

afterEach(() => {
    while (activeContexts.length) {
        const ctx = activeContexts.pop();
        ctx?.unmount();
    }
});

describe('MountContext factory', () => {
    it('supports multiple active contexts scheduling renders', async () => {
        const nodesA: TextNode[] = [];
        const nodesB: TextNode[] = [];
        const stdinA = new MockStdin();
        const stdinB = new MockStdin();
        const { stdout: stdoutA, writes: writesA } = createMockStdout();
        const { stdout: stdoutB, writes: writesB } = createMockStdout();

        const ctxA = createMountContext(labelComponent(nodesA), {
            props: { label: 'A' },
            stdout: stdoutA,
            stdin: stdinA as unknown as NodeJS.ReadStream,
            exitOnCtrlC: false,
            clearOnExit: false,
        });
        const ctxB = createMountContext(labelComponent(nodesB), {
            props: { label: 'B' },
            stdout: stdoutB,
            stdin: stdinB as unknown as NodeJS.ReadStream,
            exitOnCtrlC: false,
            clearOnExit: false,
        });

        activeContexts.push(ctxA, ctxB);
        await ctxA.start();
        await ctxB.start();
        await flushRenders();

        const initialWritesA = writesA.length;
        const initialWritesB = writesB.length;
        expect(initialWritesA).toBeGreaterThan(0);
        expect(initialWritesB).toBeGreaterThan(0);

        set_text(nodesA[0], 'AA');
        scheduleRender();
        await flushRenders();

        expect(writesA.length).toBeGreaterThan(initialWritesA);
        expect(writesB.length).toBeGreaterThan(initialWritesB);

        ctxA.unmount();
        const idx = activeContexts.indexOf(ctxA);
        if (idx !== -1) activeContexts.splice(idx, 1);
        scheduleRender();
        await flushRenders();

        const writesAfterUnmountA = writesA.length;
        const writesAfterUnmountB = writesB.length;
        expect(writesAfterUnmountA).toBeGreaterThan(initialWritesA);
        expect(writesAfterUnmountB).toBeGreaterThan(initialWritesB);
    });
});



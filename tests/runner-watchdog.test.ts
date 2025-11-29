import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { compile } from 'svelte/compiler';
import { runComponent } from '../src/runner.js';
import { EventEmitter } from 'node:events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
let testAppPromise: Promise<any> | null = null;

function getTestApp() {
    testAppPromise ??= loadTestApp();
    return testAppPromise;
}

async function loadTestApp() {
    const sourcePath = resolve(__dirname, './fixtures/TestApp.svelte');
    const source = readFileSync(sourcePath, 'utf-8');
    const { js } = compile(source, {
        filename: sourcePath,
        generate: 'client',
    });
    const outDir = mkdtempSync(join(tmpdir(), 'sveltty-'));
    const outFile = join(outDir, `testapp.compiled.mjs`);
    writeFileSync(outFile, js.code, 'utf-8');
    const mod = await import(pathToFileURL(outFile).href);
    rmSync(outDir, { recursive: true, force: true });
    return mod.default;
}

function createStdoutCollector() {
    const chunks: string[] = [];
    const stdout = new Writable({
        write(chunk, _encoding, callback) {
            chunks.push(chunk.toString());
            callback();
        },
    });
    return {
        stdout,
        read(): string {
            return chunks.join('');
        },
        clear(): void {
            chunks.length = 0;
        },
    };
}

const noopStdin = {
    setRawMode: () => {},
    on: () => {},
    off: () => {},
} as unknown as NodeJS.ReadStream;

function createMockStdin() {
    const emitter = new EventEmitter();
    return {
        setRawMode: () => {},
        on: (event: string, handler: Function) => emitter.on(event, handler as any),
        off: (event: string, handler: Function) => emitter.off(event, handler as any),
        emit: (event: string, data: any) => emitter.emit(event, data),
    } as unknown as NodeJS.ReadStream & { emit: (event: string, data: any) => boolean };
}

describe('runner watchdog', () => {
    it('mounts TestApp via the public runner entry', async () => {
        const testAppComponent = await getTestApp();
        const { stdout, read } = createStdoutCollector();
        const app = runComponent(testAppComponent, {
            stdout,
            stdin: noopStdin,
            once: 20,
            exitOnCtrlC: false,
            clearOnExit: false,
        });
        await app.waitUntilExit();
        const rendered = read();
        expect(rendered.length).toBeGreaterThan(0);
        expect(rendered).toContain('Count');
        expect(rendered).toContain('Test App');
    });

    it('form submission changes state when submit button is pressed', async () => {
        const testAppComponent = await getTestApp();
        const { stdout, read, clear } = createStdoutCollector();
        const mockStdin = createMockStdin();
        
        const app = runComponent(testAppComponent, {
            stdout,
            stdin: mockStdin,
            once: 0, // Don't auto-exit
            exitOnCtrlC: true, // Need this for stdin handling to work
            clearOnExit: false,
        });

        // Wait for initial render
        await new Promise(r => setTimeout(r, 50));
        
        let rendered = read();
        expect(rendered).toContain('NOT_SUBMITTED');
        
        // Tab to the submit button (it's at tabIndex 3)
        // Tab through: input(0) -> select(1) -> checkbox(2) -> button(3)
        // Since input(0) is already focused by default, we need 3 tabs
        for (let i = 0; i < 3; i++) {
            mockStdin.emit('data', Buffer.from('\t'));
            await new Promise(r => setTimeout(r, 20));
        }
        
        // Wait for focus to settle
        await new Promise(r => setTimeout(r, 50));
        
        // Press Enter to submit
        mockStdin.emit('data', Buffer.from('\r'));
        
        // Wait for re-render
        await new Promise(r => setTimeout(r, 100));
        
        rendered = read();
        
        // After submission, the last occurrence of SUBMITTED should be standalone
        // (not part of NOT_SUBMITTED)
        const lastNotSubmitted = rendered.lastIndexOf('NOT_SUBMITTED');
        const lastSubmitted = rendered.lastIndexOf('SUBMITTED');
        
        // If submission worked, lastSubmitted should be after NOT_SUBMITTED ends
        // NOT_SUBMITTED has "NOT_S" (5 chars) before "UBMITTED", so if lastSubmitted > lastNotSubmitted + 5,
        // it's a standalone SUBMITTED
        expect(lastSubmitted).toBeGreaterThan(lastNotSubmitted + 5);
        
        app.unmount();
    });
});

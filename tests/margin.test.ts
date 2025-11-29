import { afterEach, describe, it, expect } from 'vitest';
import {
    create_root,
    create_element,
    create_text,
    append,
    set_style,
    computeLayout,
    free_node,
} from '../src/runtime/index.js';
import { measureRoot } from '../src/runtime/render/pipeline/measure.js';
import { createRenderGrid } from '../src/runtime/render/pipeline/layout.js';
import { paintTree } from '../src/runtime/render/pipeline/paint.js';
import type { CliNode } from '../src/runtime/types.js';
import { registerStylesheet, resetStylesheets, ensureBaseStyles } from '../src/runtime/style/stylesheet.js';

describe('CSS margins', () => {
    afterEach(() => {
        resetStylesheets();
    });

    function snapshotTextGrid(node: CliNode): string {
        const metrics = measureRoot(node);
        const grid = createRenderGrid(metrics.width, metrics.height);
        paintTree(node, grid);
        return grid.map(row => row.map(cell => cell.char).join('')).join('\n');
    }

    describe('margin-bottom', () => {
        it('creates vertical space below an element', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 10 });
            ensureBaseStyles();
            
            const container = create_element('div');
            append(root, container);
            set_style(container, { flexDirection: 'column' });
            
            const box1 = create_element('div');
            append(container, box1);
            set_style(box1, { width: 5, height: 1, marginBottom: 2, backgroundColor: '#ff0000' });
            const text1 = create_text('AAA');
            append(box1, text1);
            
            const box2 = create_element('div');
            append(container, box2);
            set_style(box2, { width: 5, height: 1, backgroundColor: '#00ff00' });
            const text2 = create_text('BBB');
            append(box2, text2);
            
            computeLayout(root);
            const grid = snapshotTextGrid(root);
            const lines = grid.split('\n');
            
            // Box1 at y=0: "AAA  "
            // Gap at y=1 and y=2 (margin-bottom: 2)
            // Box2 at y=3: "BBB  "
            expect(lines[0].substring(0, 5)).toBe('AAA  ');
            expect(lines[1].substring(0, 5)).toBe('     ');
            expect(lines[2].substring(0, 5)).toBe('     ');
            expect(lines[3].substring(0, 5)).toBe('BBB  ');
            
            free_node(root);
        });
    });

    describe('margin-top', () => {
        it('creates vertical space above an element', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 10 });
            ensureBaseStyles();
            
            const container = create_element('div');
            append(root, container);
            set_style(container, { flexDirection: 'column' });
            
            const box1 = create_element('div');
            append(container, box1);
            set_style(box1, { width: 5, height: 1, backgroundColor: '#ff0000' });
            const text1 = create_text('AAA');
            append(box1, text1);
            
            const box2 = create_element('div');
            append(container, box2);
            set_style(box2, { width: 5, height: 1, marginTop: 2, backgroundColor: '#00ff00' });
            const text2 = create_text('BBB');
            append(box2, text2);
            
            computeLayout(root);
            const grid = snapshotTextGrid(root);
            const lines = grid.split('\n');
            
            // Box1 at y=0
            // Gap at y=1 and y=2 (margin-top: 2 on box2)
            // Box2 at y=3
            expect(lines[0].substring(0, 5)).toBe('AAA  ');
            expect(lines[1].substring(0, 5)).toBe('     ');
            expect(lines[2].substring(0, 5)).toBe('     ');
            expect(lines[3].substring(0, 5)).toBe('BBB  ');
            
            free_node(root);
        });
    });

    describe('margin-left and margin-right', () => {
        it('creates horizontal space around elements', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 5 });
            ensureBaseStyles();
            
            const container = create_element('div');
            append(root, container);
            set_style(container, { flexDirection: 'row' });
            
            const box1 = create_element('div');
            append(container, box1);
            set_style(box1, { width: 3, height: 1, marginRight: 2, backgroundColor: '#ff0000' });
            const text1 = create_text('A');
            append(box1, text1);
            
            const box2 = create_element('div');
            append(container, box2);
            set_style(box2, { width: 3, height: 1, marginLeft: 1, backgroundColor: '#00ff00' });
            const text2 = create_text('B');
            append(box2, text2);
            
            computeLayout(root);
            const grid = snapshotTextGrid(root);
            const lines = grid.split('\n');
            
            // Box1 "A  " at x=0-2
            // Gap of 3 (marginRight: 2 + marginLeft: 1) at x=3-5
            // Box2 "B  " at x=6-8
            expect(lines[0].substring(0, 9)).toBe('A     B  ');
            
            free_node(root);
        });
    });

    describe('negative margins', () => {
        it('pulls elements closer with negative margin-top', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 10 });
            ensureBaseStyles();
            
            const container = create_element('div');
            append(root, container);
            set_style(container, { flexDirection: 'column' });
            
            const box1 = create_element('div');
            append(container, box1);
            set_style(box1, { width: 5, height: 2, backgroundColor: '#ff0000' });
            const text1 = create_text('AAA');
            append(box1, text1);
            
            const box2 = create_element('div');
            append(container, box2);
            set_style(box2, { width: 5, height: 1, marginTop: -1, backgroundColor: '#00ff00' });
            const text2 = create_text('BBB');
            append(box2, text2);
            
            computeLayout(root);
            const grid = snapshotTextGrid(root);
            const lines = grid.split('\n');
            
            // Box1 at y=0-1
            // Box2 at y=1 (overlapping box1's second row due to negative margin)
            expect(lines[0].substring(0, 5)).toBe('AAA  ');
            expect(lines[1].substring(0, 5)).toBe('BBB  '); // Box2 overlaps box1's row
            
            free_node(root);
        });

        it('pulls elements closer with negative margin-left', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 5 });
            ensureBaseStyles();
            
            const container = create_element('div');
            append(root, container);
            set_style(container, { flexDirection: 'row' });
            
            const box1 = create_element('div');
            append(container, box1);
            set_style(box1, { width: 5, height: 1, backgroundColor: '#ff0000' });
            const text1 = create_text('AAAA');
            append(box1, text1);
            
            const box2 = create_element('div');
            append(container, box2);
            set_style(box2, { width: 5, height: 1, marginLeft: -2, backgroundColor: '#00ff00' });
            const text2 = create_text('BBBB');
            append(box2, text2);
            
            computeLayout(root);
            const grid = snapshotTextGrid(root);
            const lines = grid.split('\n');
            
            // Box1 "AAAA " at x=0-4
            // Box2 "BBBB " at x=3-7 (overlapping box1 due to negative margin)
            // Result: "AAABBBB " 
            expect(lines[0].substring(0, 8)).toBe('AAABBBB ');
            
            free_node(root);
        });
    });

    describe('margin shorthand via inline style', () => {
        it('applies margin shorthand with one value', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 10 });
            ensureBaseStyles();
            
            const container = create_element('div');
            append(root, container);
            set_style(container, { flexDirection: 'column', width: 10, height: 8 });
            
            const box = create_element('div');
            append(container, box);
            // margin: 2 applies to all sides
            set_style(box, { width: 3, height: 1, margin: 2 });
            const text = create_text('X');
            append(box, text);
            
            computeLayout(root);
            const grid = snapshotTextGrid(root);
            const lines = grid.split('\n');
            
            // With margin: 2, the box should be offset 2 from top and 2 from left
            expect(lines[0].substring(0, 5)).toBe('     ');
            expect(lines[1].substring(0, 5)).toBe('     ');
            expect(lines[2].substring(0, 5)).toBe('  X  ');
            
            free_node(root);
        });

        it('applies marginX and marginY shorthand', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 10 });
            ensureBaseStyles();
            
            const container = create_element('div');
            append(root, container);
            set_style(container, { flexDirection: 'column', width: 10, height: 8 });
            
            const box = create_element('div');
            append(container, box);
            // marginY: 1 (top/bottom), marginX: 3 (left/right)
            set_style(box, { width: 3, height: 1, marginY: 1, marginX: 3 });
            const text = create_text('X');
            append(box, text);
            
            computeLayout(root);
            const grid = snapshotTextGrid(root);
            const lines = grid.split('\n');
            
            // marginY: 1 means 1 row gap at top
            // marginX: 3 means 3 char offset from left
            expect(lines[0].substring(0, 7)).toBe('       ');
            expect(lines[1].substring(0, 7)).toBe('   X   ');
            
            free_node(root);
        });
    });

    describe('margin via inline style attribute', () => {
        it('parses margin-bottom from inline style string', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 10 });
            ensureBaseStyles();
            
            const container = create_element('div');
            append(root, container);
            set_style(container, { flexDirection: 'column' });
            
            const box1 = create_element('div');
            append(container, box1);
            // Simulate inline style attribute parsing
            box1.setAttribute?.('style', 'margin-bottom: 2ch;');
            set_style(box1, { width: 5, height: 1, marginBottom: 2 });
            const text1 = create_text('TOP');
            append(box1, text1);
            
            const box2 = create_element('div');
            append(container, box2);
            set_style(box2, { width: 5, height: 1 });
            const text2 = create_text('BOT');
            append(box2, text2);
            
            computeLayout(root);
            const grid = snapshotTextGrid(root);
            const lines = grid.split('\n');
            
            expect(lines[0].substring(0, 5)).toBe('TOP  ');
            expect(lines[1].substring(0, 5)).toBe('     ');
            expect(lines[2].substring(0, 5)).toBe('     ');
            expect(lines[3].substring(0, 5)).toBe('BOT  ');
            
            free_node(root);
        });
    });
});


import { describe, it, expect } from 'vitest';
import {
    create_root,
    create_element,
    create_text,
    append,
    set_text,
    set_style,
    computeLayout,
    renderToString,
    free_node,
} from '../src/runtime/index.js';

describe('Runtime', () => {
    describe('Node Creation', () => {
        it('should create a root node', () => {
            const root = create_root();
            expect(root.type).toBe('root');
            expect(root.children).toEqual([]);
            expect(root.parent).toBeNull();
            free_node(root);
        });

        it('should create a box element', () => {
            const box = create_element();
            expect(box.type).toBe('box');
            expect(box.children).toEqual([]);
            free_node(box);
        });

        it('should create a text node', () => {
            const text = create_text('Hello');
            expect(text.type).toBe('text');
            expect(text.value).toBe('Hello');
            free_node(text);
        });
    });

    describe('Tree Manipulation', () => {
        it('should append child to parent', () => {
            const root = create_root();
            const child = create_element();

            append(root, child);

            expect(root.children).toHaveLength(1);
            expect(root.children[0]).toBe(child);
            expect(child.parent).toBe(root);

            free_node(root);
        });

        it('should append multiple children', () => {
            const root = create_root();
            const child1 = create_element();
            const child2 = create_element();
            const child3 = create_text('test');

            append(root, child1);
            append(root, child2);
            append(root, child3);

            expect(root.children).toHaveLength(3);
            expect(root.children[0]).toBe(child1);
            expect(root.children[1]).toBe(child2);
            expect(root.children[2]).toBe(child3);

            free_node(root);
        });

        it('should update text content', () => {
            const text = create_text('initial');
            expect(text.value).toBe('initial');

            set_text(text, 'updated');
            expect(text.value).toBe('updated');

            free_node(text);
        });
    });

    describe('Styling', () => {
        it('should set styles on a node', () => {
            const box = create_element();

            set_style(box, {
                width: 100,
                height: 50,
                padding: 2,
                margin: 1,
            });

            expect(box.style.width).toBe(100);
            expect(box.style.height).toBe(50);
            expect(box.style.padding).toBe(2);
            expect(box.style.margin).toBe(1);

            free_node(box);
        });

        it('should set flexbox properties', () => {
            const box = create_element();

            set_style(box, {
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
            });

            expect(box.style.flexDirection).toBe('column');
            expect(box.style.justifyContent).toBe('center');
            expect(box.style.alignItems).toBe('center');

            free_node(box);
        });

        it('should set text styles', () => {
            const text = create_text('styled');

            set_style(text, {
                color: 'green',
                bold: true,
                underline: true,
            });

            expect(text.style.color).toBe('green');
            expect(text.style.bold).toBe(true);
            expect(text.style.underline).toBe(true);

            free_node(text);
        });
    });

    describe('Layout', () => {
        it('should compute layout for a simple tree', () => {
            const root = create_root();
            const box = create_element();
            const text = create_text('Hello');

            set_style(box, { width: 50, height: 20 });

            append(box, text);
            append(root, box);

            computeLayout(root, 100, 100);

            expect(root.computedLayout).toBeDefined();
            expect(box.computedLayout).toBeDefined();
            expect(text.computedLayout).toBeDefined();

            expect(box.computedLayout?.width).toBe(50);
            expect(box.computedLayout?.height).toBe(20);

            free_node(root);
        });

        it('should handle flexbox layout', () => {
            const root = create_root();
            const container = create_element();

            set_style(container, {
                width: 100,
                flexDirection: 'row',
            });

            const box1 = create_element();
            const box2 = create_element();

            set_style(box1, { flexGrow: 1, height: 20 });
            set_style(box2, { flexGrow: 1, height: 20 });

            append(container, box1);
            append(container, box2);
            append(root, container);

            computeLayout(root, 100, 100);

            // Each box should get 50% of width
            expect(box1.computedLayout?.width).toBe(50);
            expect(box2.computedLayout?.width).toBe(50);

            free_node(root);
        });

        it('should handle padding and margin', () => {
            const root = create_root();
            const box = create_element();

            set_style(box, {
                width: 50,
                height: 30,
                padding: 5,
                margin: 10,
            });

            append(root, box);

            computeLayout(root, 100, 100);

            // Box position should account for margin
            expect(box.computedLayout?.left).toBe(10);
            expect(box.computedLayout?.top).toBe(10);

            // Box size should include padding
            expect(box.computedLayout?.width).toBe(50);
            expect(box.computedLayout?.height).toBe(30);

            free_node(root);
        });
    });

    describe('Rendering', () => {
        it('should render a simple text node', () => {
            const root = create_root();
            const text = create_text('Hello World');

            set_style(root, { width: 80, height: 24 });

            append(root, text);

            computeLayout(root, 80, 24);

            const { output, width, height } = renderToString(root);

            expect(output).toContain('Hello World');
            expect(width).toBe(80);
            expect(height).toBe(24);

            free_node(root);
        });

        it('should render styled text', () => {
            const root = create_root();
            const text = create_text('Styled');

            set_style(text, {
                color: 'green',
                bold: true,
            });
            set_style(root, { width: 50, height: 10 });

            append(root, text);

            computeLayout(root, 50, 10);

            const { output } = renderToString(root);

            // Should contain ANSI codes for green (24-bit) and bold
            expect(output).toContain('\x1b[1m'); // Bold
            expect(output).toContain('\x1b[38;2;0;128;0m'); // Green (24-bit)
            expect(output).toContain('Styled');

            free_node(root);
        });

        it('should render nested boxes', () => {
            const root = create_root();
            const outer = create_element();
            const inner = create_element();
            const text = create_text('Nested');

            set_style(root, { width: 100, height: 50 });
            set_style(outer, { width: 80, height: 40, padding: 10 });
            set_style(inner, { width: 60, height: 20 });

            append(inner, text);
            append(outer, inner);
            append(root, outer);

            computeLayout(root, 100, 50);

            const { output } = renderToString(root);

            expect(output).toContain('Nested');

            free_node(root);
        });

        it('should render with border', () => {
            const root = create_root();
            const box = create_element();

            set_style(root, { width: 50, height: 20 });
            set_style(box, {
                width: 30,
                height: 10,
                borderStyle: 'single',
            });

            append(root, box);

            computeLayout(root, 50, 20);

            const { output } = renderToString(root);

            // Should contain box drawing characters
            expect(output).toMatch(/[┌┐└┘─│]/);

            free_node(root);
        });
    });
});

import { afterEach, describe, it, expect } from 'vitest';
import { from_html } from '../src/runtime/client/template.js';
import { computeLayout, renderToString, free_node, CliNode } from '../src/runtime/index.js';
import { measureRoot } from '../src/runtime/render/pipeline/measure.js';
import { createRenderGrid } from '../src/runtime/render/pipeline/layout.js';
import { paintTree } from '../src/runtime/render/pipeline/paint.js';
import { registerStylesheet, resetStylesheets } from '../src/runtime/style/stylesheet.js';

function getElementChildren(node: any) {
    const children: CliNode[] = node.childNodes ?? node.children ?? [];
    return children.filter(child => child && child.nodeType === 1);
}

function snapshotText(node: any): string {
    const metrics = measureRoot(node);
    const grid = createRenderGrid(metrics.width, metrics.height);
    paintTree(node, grid);
    return grid.map(row => row.map(cell => cell.char).join('')).join('\n');
}

/**
 * Baseline assumptions for template parsing prior to stylesheet support:
 *  - Inline attributes (camelCase or kebab-case) are the sole style source.
 *  - Numeric inline values are interpreted as raw numbers (unitless).
 *  - Flex layouts default to column ordering unless explicitly overridden.
 */

describe('from_html style normalization', () => {
    afterEach(() => {
        resetStylesheets();
    });

    it('preserves camelCase attributes after HTML parsing', () => {
        const tpl = from_html(
            '<div flexDirection="row" backgroundColor="blue" borderStyle="single" borderBg="blue"><span>Demo</span><input /></div>'
        );
        const root = tpl();

        expect(root.style.flexDirection).toBe('row');
        expect(root.style.backgroundColor).toBe('blue');
        expect(root.style.borderStyle).toBe('single');
        expect(root.style.borderBg).toBe('blue');

        const children = getElementChildren(root);
        const label = children.find(child => child.nodeName === 'span');
        const labelTextNode = (label?.childNodes ?? []).find(child => child.type === 'text');
        expect(labelTextNode?.value).toBe('Demo');

        computeLayout(root, 40, 6);
        const { output } = renderToString(root);
        expect(output).toMatch(/[┌┐└┘]/);
        expect(output).toContain('\x1b[48;2;0;0;255m'); // blue background (24-bit)
        free_node(root);
    });

    it('applies flexDirection=row layout from templates', () => {
        const tpl = from_html('<div flexDirection="row"><span>Name:</span><input /></div>');
        const node = tpl();

        computeLayout(node, 40, 6);
        const elements = getElementChildren(node);
        const label = elements.find(child => child.nodeName === 'span');
        const input = elements.find(child => child.nodeName === 'input');
        expect(label).toBeTruthy();
        expect(input).toBeTruthy();
        expect(label?.computedLayout?.top).toBeCloseTo(input?.computedLayout?.top ?? NaN, 5);

        const gridText = snapshotText(node);
        const firstLine = gridText.split('\n')[0];
        expect(firstLine).toContain('Name:');
        expect(firstLine).toMatch(/[┌│]/);
        const { output } = renderToString(node);
        expect(output).toMatch(/[┌│]/);
        free_node(node);
    });

    it('defaults to column layout when flexDirection is omitted', () => {
        const tpl = from_html('<div><span>One</span><span>Two</span></div>');
        const node = tpl();

        computeLayout(node, 10, 4);
        const children = getElementChildren(node);
        expect(children.length).toBe(2);
        const first = children[0];
        const second = children[1];
        expect((first?.computedLayout?.top ?? 0)).toBeLessThan(second?.computedLayout?.top ?? Infinity);
        expect(first?.computedLayout?.left).toBeCloseTo(second?.computedLayout?.left ?? 0, 5);

        const preview = snapshotText(node).split('\n').filter(line => /\S/.test(line));
        expect(preview.length).toBeGreaterThan(1);
        expect(preview[0]).toContain('One');
        expect(preview[1]).toContain('Two');
        free_node(node);
    });

    it('parses inline numeric style values into numbers', () => {
        const tpl = from_html('<div style="width: 11; height: 3;"></div>');
        const node = tpl();

        expect(node.style.width).toBe(11);
        expect(node.style.height).toBe(3);

        computeLayout(node, 20, 10);
        expect(node.computedLayout?.width).toBeCloseTo(11, 5);
        expect(node.computedLayout?.height).toBeCloseTo(3, 5);
        free_node(node);
    });

    it('applies percentage dimensions from stylesheets', () => {
        registerStylesheet('__percent__', '.fill { width: 100%; height: 100%; }');
        const tpl = from_html('<main class="fill"></main>');
        const node = tpl();

        computeLayout(node, 40, 12);
        expect(node.__cssStyle?.width).toBe('100%');
        expect(node.__cssStyle?.height).toBe('100%');
        expect(node.computedLayout?.width).toBeCloseTo(40, 5);
        expect(node.computedLayout?.height).toBeCloseTo(12, 5);
        free_node(node);
    });

    it('resolves fractional percentages from stylesheets', () => {
        registerStylesheet('__percent_half__', '.half { width: 50%; height: 50%; }');
        const tpl = from_html('<section class="half"></section>');
        const node = tpl();

        computeLayout(node, 80, 20);
        expect(node.__cssStyle?.width).toBe('50%');
        expect(node.__cssStyle?.height).toBe('50%');
        expect(node.computedLayout?.width).toBeCloseTo(40, 5);
        expect(node.computedLayout?.height).toBeCloseTo(10, 5);
        free_node(node);
    });
});



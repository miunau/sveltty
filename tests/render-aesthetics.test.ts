import { afterEach, describe, it, expect } from 'vitest';
import {
    create_root,
    create_element,
    create_text,
    append,
    set_attribute,
    set_style,
    computeLayout,
    renderToString,
    free_node,
} from '../src/runtime/index.js';
import { dispatchKey, setFocus, registerFocusable, unregisterFocusable } from '../src/runtime/focus.js';
import { measureRoot } from '../src/runtime/render/pipeline/measure.js';
import { createRenderGrid } from '../src/runtime/render/pipeline/layout.js';
import { paintTree } from '../src/runtime/render/pipeline/paint.js';
import type { CliNode } from '../src/runtime/types.js';
import { registerStylesheet, resetStylesheets, ensureBaseStyles } from '../src/runtime/style/stylesheet.js';
import { showPopover, activatePopoverControl, resetPopovers } from '../src/runtime/popover.js';
import type { RawKey } from '../src/runtime/input/keyboard.js';

const BLUE_BG = '\x1b[48;2;0;0;255m'; // 24-bit blue background

/**
 * These tests codify the renderer contracts so future refactors have concrete baselines.
 */
describe('render aesthetics', () => {
    afterEach(() => {
        resetStylesheets();
        resetPopovers();
    });

    function snapshotTextGrid(node: CliNode): string {
        const metrics = measureRoot(node);
        const grid = createRenderGrid(metrics.width, metrics.height);
        paintTree(node, grid);
        return grid.map(row => row.map(cell => cell.char).join('')).join('\n');
    }

    function paintGrid(node: CliNode) {
        const metrics = measureRoot(node);
        const grid = createRenderGrid(metrics.width, metrics.height);
        paintTree(node, grid);
        return grid;
    }

    function extractInterior(row: string): string {
        const left = row.indexOf('│');
        if (left === -1) {
            return row.trim();
        }
        const right = Math.max(row.lastIndexOf('│'), row.lastIndexOf('|'), row.lastIndexOf('┤'));
        if (right === -1 || right <= left) {
            return row.slice(left + 1);
        }
        return row.slice(left + 1, right);
    }

    function charKey(key: string): RawKey {
        const upper = key.toUpperCase();
        return {
            key,
            code: `Key${upper}`,
            sequence: key,
            ctrl: false,
            shift: upper === key && /[A-Z]/.test(key),
            alt: false,
            meta: false,
            repeat: false,
            tab: false,
            escape: false,
            enter: false,
            backspace: false,
            delete: false,
            upArrow: false,
            downArrow: false,
            leftArrow: false,
            rightArrow: false,
            home: false,
            end: false,
        };
    }

    function arrowKey(direction: 'up' | 'down'): RawKey {
        const isDown = direction === 'down';
        return {
            key: isDown ? 'ArrowDown' : 'ArrowUp',
            code: isDown ? 'ArrowDown' : 'ArrowUp',
            sequence: '',
            ctrl: false,
            shift: false,
            alt: false,
            meta: false,
            repeat: false,
            tab: false,
            escape: false,
            enter: false,
            backspace: false,
            delete: false,
            upArrow: !isDown,
            downArrow: isDown,
            leftArrow: false,
            rightArrow: false,
            home: false,
            end: false,
        };
    }

    it('emits ANSI codes for explicit text colors', () => {
        const root = create_root();
        set_style(root, { width: 20, height: 4 });

        const box = create_element('box');
        set_attribute(box, 'backgroundColor', 'blue');
        append(root, box);

        const textEl = create_element('text');
        set_attribute(textEl, 'color', 'green');
        append(box, textEl);

        const text = create_text('SvelTTY Demo');
        append(textEl, text);

        computeLayout(root, 20, 4);
        const { output } = renderToString(root, {});
        free_node(root);

        // green = rgb(0, 128, 0) -> 38;2;0;128;0
        expect(output).toMatch(/\x1b\[38;2;0;128;0m(?:\x1b\[[0-9;]*m)*SvelTTY Demo/);
    });

    it('preserves distinct text colors for adjacent elements via CSS', () => {
        // Test case: parent has gradient bg, children have different text colors
        // This mirrors the Showcase where "Count" and "79" should have different colors
        registerStylesheet(
            '__text_colors__',
            `.parent { background-color: #ff0000; }
             .label { color: #00ff00; }
             .value { color: #0000ff; }`
        );

        const root = create_root();
        set_style(root, { width: 20, height: 3 });
        set_attribute(root, 'class', 'parent');

        // Create a row with two spans having different colors
        const row = create_element('div');
        set_style(row, { flexDirection: 'row' });
        append(root, row);

        const label = create_element('span');
        set_attribute(label, 'class', 'label');
        append(row, label);
        const labelText = create_text('Label');
        append(label, labelText);

        const value = create_element('span');
        set_attribute(value, 'class', 'value');
        append(row, value);
        const valueText = create_text('Value');
        append(value, valueText);

        computeLayout(root, 20, 3);
        const grid = paintGrid(root);
        free_node(root);

        // Find the cells for "Label" and "Value" text
        const row0 = grid[0];
        
        // Find 'L' from "Label" - should have green color
        const labelLCell = row0.find(c => c.char === 'L');
        expect(labelLCell).toBeDefined();
        expect(labelLCell?.style?.color).toBe('#00ff00');

        // Find 'V' from "Value" - should have blue color
        const valueLCell = row0.find(c => c.char === 'V');
        expect(valueLCell).toBeDefined();
        expect(valueLCell?.style?.color).toBe('#0000ff');
    });

    it('text colors from CSS are applied to text nodes', () => {
        registerStylesheet(
            '__css_text_color__',
            `.bright { color: #24fba5; font-weight: bold; }`
        );

        const root = create_root();
        set_style(root, { width: 10, height: 2 });

        const span = create_element('span');
        set_attribute(span, 'class', 'bright');
        append(root, span);

        const text = create_text('Test');
        append(span, text);

        computeLayout(root, 10, 2);
        const grid = paintGrid(root);
        free_node(root);

        // Check that the 'T' character has the correct color
        const tCell = grid[0].find(c => c.char === 'T');
        expect(tCell).toBeDefined();
        expect(tCell?.style?.color).toBe('#24fba5');
        expect(tCell?.style?.bold).toBe(true);
    });

    it('renders adjacent text with different CSS colors in ANSI output', () => {
        // This test verifies the ANSI output contains correct color codes
        // when adjacent text elements have different colors
        registerStylesheet(
            '__adjacent_colors__',
            `.green { color: #00ff00; }
             .blue { color: #0000ff; }`
        );

        const root = create_root();
        set_style(root, { width: 10, height: 1 });

        const row = create_element('div');
        set_style(row, { flexDirection: 'row' });
        append(root, row);

        const green = create_element('span');
        set_attribute(green, 'class', 'green');
        append(row, green);
        append(green, create_text('AB'));

        const blue = create_element('span');
        set_attribute(blue, 'class', 'blue');
        append(row, blue);
        append(blue, create_text('CD'));

        computeLayout(root, 10, 1);
        const { output } = renderToString(root, {});
        free_node(root);

        // #00ff00 = rgb(0, 255, 0) -> 38;2;0;255;0
        // #0000ff = rgb(0, 0, 255) -> 38;2;0;0;255
        const green24bit = '\x1b[38;2;0;255;0m';
        const blue24bit = '\x1b[38;2;0;0;255m';

        // Output should contain green color code followed by AB
        expect(output).toContain(green24bit);
        expect(output).toContain('AB');
        
        // Output should contain blue color code followed by CD
        expect(output).toContain(blue24bit);
        expect(output).toContain('CD');

        // The blue text should come AFTER the green text with proper color switch
        const greenIdx = output.indexOf(green24bit);
        const blueIdx = output.indexOf(blue24bit);
        expect(blueIdx).toBeGreaterThan(greenIdx);
    });

    it('preserves text colors over gradient backgrounds in ANSI output', () => {
        // This mimics the Showcase scenario: gradient bg with colored text
        registerStylesheet(
            '__gradient_text__',
            `.container { background: linear-gradient(90deg, red, blue); }
             .title { color: #f8e838; font-weight: bold; }
             .value { color: #24fba5; font-weight: bold; }`
        );

        const root = create_root();
        set_style(root, { width: 20, height: 3 });
        set_attribute(root, 'class', 'container');

        const title = create_element('div');
        set_attribute(title, 'class', 'title');
        append(root, title);
        append(title, create_text('lorem ipsum'));

        const row = create_element('div');
        set_style(row, { flexDirection: 'row' });
        append(root, row);

        const label = create_element('span');
        append(row, label);
        append(label, create_text('Count'));

        const value = create_element('span');
        set_attribute(value, 'class', 'value');
        append(row, value);
        append(value, create_text('79'));

        computeLayout(root, 20, 3);
        
        // First check the grid has correct colors
        const grid = paintGrid(root);
        
        // Find 'l' from "lorem" - should have yellow color
        const loremCell = grid[0].find(c => c.char === 'l');
        expect(loremCell?.style?.color).toBe('#f8e838');
        
        // Find '7' from "79" - should have bright green color
        const valueCell = grid[1].find(c => c.char === '7');
        expect(valueCell?.style?.color).toBe('#24fba5');

        // Now check ANSI output
        const { output } = renderToString(root, {});
        free_node(root);

        // #f8e838 = rgb(248, 232, 56) -> 38;2;248;232;56
        const yellow24bit = '\x1b[38;2;248;232;56m';
        // #24fba5 = rgb(36, 251, 165) -> 38;2;36;251;165
        const green24bit = '\x1b[38;2;36;251;165m';

        // Output should contain the color codes
        expect(output).toContain(yellow24bit);
        expect(output).toContain(green24bit);
        
        // The text characters should be present (with ANSI codes between them due to gradient)
        // Check that 'l', 'o', 'r', 'e', 'm' appear in sequence (after the color code)
        const loremMatch = output.match(/l[^\n]*o[^\n]*r[^\n]*e[^\n]*m/);
        expect(loremMatch).not.toBeNull();
        
        // Check that '7', '9' appear in sequence
        const valueMatch = output.match(/7[^\n]*9/);
        expect(valueMatch).not.toBeNull();
        
        // Verify the yellow color appears followed by 'l' (with possible bg color in between)
        // The pattern is: yellow fg code, then bg code, then 'l'
        const yellowLoremPattern = new RegExp(
            yellow24bit.replace(/[[\]]/g, '\\$&') + '.*l'
        );
        expect(output).toMatch(yellowLoremPattern);
        
        // Verify the green color appears followed by '7' (with possible bg code in between)
        const greenValuePattern = new RegExp(
            green24bit.replace(/[[\]]/g, '\\$&') + '.*7'
        );
        expect(output).toMatch(greenValuePattern);
    });

    it('applies CSS color to descendants', () => {
        const root = create_root();
        set_style(root, { width: 20, height: 4 });

        const styledBox = create_element('box');
        set_attribute(styledBox, 'color', 'cyan');
        append(root, styledBox);

        const child = create_text('Scoped Text');
        append(styledBox, child);

        computeLayout(root, 20, 4);
        const { output } = renderToString(root, {});
        free_node(root);

        // cyan = rgb(0, 255, 255) -> 38;2;0;255;255
        expect(output).toMatch(/\x1b\[38;2;0;255;255m/);
        expect(output).toContain('Scoped Text');
    });

    it('renders background fills and borders', () => {
        const root = create_root();
        set_style(root, { width: 12, height: 4 });
        set_attribute(root, 'backgroundColor', 'blue');
        set_attribute(root, 'borderStyle', 'single');
        set_attribute(root, 'borderColor', 'green');
        set_attribute(root, 'borderBg', 'blue');
        const text = create_text('hi');
        append(root, text);

        computeLayout(root, 12, 4);
        const { output } = renderToString(root, {});
        free_node(root);

        expect(output).toMatch(/[┌┐└┘]/);
        expect(output).toContain(BLUE_BG);
    });

    it('applies border background color attributes', () => {
        const root = create_root();
        set_style(root, { width: 6, height: 3 });
        set_attribute(root, 'borderStyle', 'single');
        set_attribute(root, 'borderBackgroundColor', 'red');

        computeLayout(root, 6, 3);
        const grid = paintGrid(root);
        free_node(root);

        expect(grid[0][0].style?.backgroundColor).toBe('red');
        expect(grid[0][1].style?.backgroundColor).toBe('red');
    });

    it('supports per-edge border background colors via stylesheet', () => {
        registerStylesheet(
            '__border_bg__',
            '.fancy { border-style: single; border-background-color: magenta; border-top-background-color: green; border-right-background-color: purple; border-top-left-background-color: blue; border-bottom-right-background-color: cyan; }'
        );
        const root = create_root();
        set_style(root, { width: 8, height: 4 });
        set_attribute(root, 'class', 'fancy');

        computeLayout(root, 8, 4);
        const grid = paintGrid(root);
        free_node(root);

        expect(grid[0][0].style?.backgroundColor).toBe('blue'); // top-left corner
        expect(grid[0][1].style?.backgroundColor).toBe('green'); // top edge
        expect(grid[1][7].style?.backgroundColor).toBe('purple'); // right edge
        expect(grid[3][7].style?.backgroundColor).toBe('cyan'); // bottom-right corner
        expect(grid[3][1].style?.backgroundColor).toBe('magenta'); // bottom edge fallback
    });

    it('renders inputs with inherited styles', () => {
        const root = create_root();
        set_style(root, { width: 20, height: 5 });
        set_attribute(root, 'backgroundColor', 'blue');
        const box = create_element('box');
        append(root, box);
        const input = create_element('input');
        append(box, input);
        input.value = 'hi';

        computeLayout(root, 20, 5);
        const snapshot = snapshotTextGrid(root).split('\n');
        const frameTop = snapshot.find(line => line.includes('┌')) ?? '';
        const frameMid = snapshot.find(line => line.includes('│')) ?? '';
        const { output } = renderToString(root, {});
        free_node(root);

        expect(frameTop.trim().startsWith('┌')).toBe(true);
        // The input may show a caret when focused, so match either 'hi' or '|' followed by characters
        expect(frameMid).toMatch(/│.*[hi|]/);
        expect(output).toContain('┌');
        expect(output).toContain(BLUE_BG);
    });

    it('offsets input text using inline padding', () => {
        const root = create_root();
        set_style(root, { width: 16, height: 3 });

        const input = create_element('input');
        set_attribute(input, 'paddingLeft', 2);
        set_attribute(input, 'paddingRight', 1);
        append(root, input);
        input.value = 'AB';

        computeLayout(root, 16, 3);
        const row = snapshotTextGrid(root)
            .split('\n')
            .find(line => line.includes('│')) ?? '';
        free_node(root);

        const inner = extractInterior(row);
        expect(inner.startsWith('  AB')).toBe(true);
    });

    it('applies stylesheet padding to inputs', () => {
        registerStylesheet('__test__', '.padded { padding: 0 2ch; }');
        const root = create_root();
        set_style(root, { width: 20, height: 3 });

        const input = create_element('input');
        set_attribute(input, 'class', 'padded');
        append(root, input);
        input.value = 'hi';

        computeLayout(root, 20, 3);
        const row = snapshotTextGrid(root)
            .split('\n')
            .find(line => line.includes('│')) ?? '';
        free_node(root);

        const inner = extractInterior(row);
        expect(inner.startsWith('  hi')).toBe(true);
    });

    it('applies padding around child content', () => {
        const root = create_root();
        set_style(root, { width: 12, height: 6 });

        const padded = create_element('box');
        set_attribute(padded, 'padding', 1);
        set_attribute(padded, 'width', 12);
        set_attribute(padded, 'height', 6);
        padded.style.backgroundColor = 'blue';
        append(root, padded);

        const child = create_text('X');
        append(padded, child);

        computeLayout(root, 12, 6);
        computeLayout(root, 12, 6);
        const lines = snapshotTextGrid(root).split('\n');
        free_node(root);

        expect(lines.length).toBeGreaterThanOrEqual(2);
        expect(lines[0].trim()).toBe('');
        expect(lines[1][1]).toBe('X');
    });

    it('re-renders input text when typing via dispatchKey', () => {
        const root = create_root();
        set_style(root, { width: 24, height: 6 });

        const input = create_element('input');
        set_attribute(input, 'tabIndex', 0);
        append(root, input);
        setFocus(input);

        dispatchKey(charKey('A'));
        dispatchKey(charKey('B'));

        computeLayout(root, 24, 6);
        const row = snapshotTextGrid(root)
            .split('\n')
            .find(line => line.includes('│')) ?? '';
        const inner = extractInterior(row);

        free_node(root);
        expect(inner).toContain('AB');
    });

    it('updates select display when option changes via keyboard', () => {
        const root = create_root();
        set_style(root, { width: 30, height: 6 });

        const select = create_element('select');
        set_attribute(select, 'tabIndex', 0);
        set_attribute(select, 'options', [
            { label: 'Alpha', value: 'alpha', selected: true },
            { label: 'Beta', value: 'beta' },
        ]);
        append(root, select);
        setFocus(select);

        computeLayout(root, 30, 6);
        const before = renderToString(root, {}).output;
        dispatchKey(arrowKey('down'));

        computeLayout(root, 30, 6);
        const after = renderToString(root, {}).output;
        free_node(root);

        expect(select.selectedIndex).toBe(1);
        expect(after).not.toBe(before);
    });

    it('keeps layout padding symmetric when borders are present', () => {
        const root = create_root();
        set_style(root, { width: 30, height: 12, borderStyle: 'single', padding: 3 });

        const block = create_element('box');
        set_attribute(block, 'width', '100%');
        set_attribute(block, 'height', '100%');
        append(root, block);
        append(block, create_text('fill layout'));

        computeLayout(root, 30, 12);
        const rootLayout = root.computedLayout!;
        const blockLayout = block.computedLayout!;
        free_node(root);

        expect(blockLayout.left).toBe(4);
        expect(blockLayout.top).toBe(4);
        expect(rootLayout.width - (blockLayout.left + blockLayout.width)).toBe(4);
        expect(rootLayout.height - (blockLayout.top + blockLayout.height)).toBe(4);
    });

    it('renders equal padding gaps next to borders', () => {
        const root = create_root();
        set_style(root, { width: 20, height: 8, borderStyle: 'single', padding: 3 });

        const text = create_text('ABCDEFGHIJKL');
        append(root, text);

        computeLayout(root, 20, 8);
        const row = snapshotTextGrid(root)
            .split('\n')
            .find(line => line.includes('ABCDEFGHIJKL')) ?? '';
        free_node(root);

        expect(row).not.toBe('');
        const leftGap = row.indexOf('A') - row.indexOf('│') - 1;
        const rightGap = row.lastIndexOf('│') - row.lastIndexOf('L') - 1;
        expect(leftGap).toBe(3);
        expect(rightGap).toBe(3);
    });

    it('positions fixed nodes relative to the viewport', () => {
        const root = create_root();
        set_style(root, { width: 20, height: 6, padding: 3 });

        const container = create_element('box');
        set_attribute(container, 'padding', 2);
        append(root, container);

        const fixed = create_element('box');
        set_attribute(fixed, 'position', 'fixed');
        set_attribute(fixed, 'left', 1);
        set_attribute(fixed, 'top', 1);
        append(container, fixed);
        append(fixed, create_text('F'));

        computeLayout(root, 20, 6);
        const lines = snapshotTextGrid(root).split('\n');
        free_node(root);

        expect(lines[1][1]).toBe('F');
    });

    it('supports right and bottom offsets for fixed nodes', () => {
        const root = create_root();
        set_style(root, { width: 20, height: 6 });

        const fixed = create_element('box');
        set_attribute(fixed, 'position', 'fixed');
        set_attribute(fixed, 'right', '5ch');
        set_attribute(fixed, 'bottom', 1);
        append(root, fixed);
        append(fixed, create_text('X'));

        computeLayout(root, 20, 6);
        const lines = snapshotTextGrid(root).split('\n');
        free_node(root);

        expect(lines[4][14]).toBe('X');
    });

    it('respects percentage-based width/height', () => {
        const root = create_root();
        set_style(root, { width: 20, height: 10 });

        const child = create_element('box');
        set_attribute(child, 'width', '50%');
        set_attribute(child, 'height', '30%');
        child.style.backgroundColor = 'blue';
        append(root, child);

        computeLayout(root, 20, 10);
        const layout = child.computedLayout;
        free_node(root);

        expect(layout?.width).toBeCloseTo(10, 5);
        expect(layout?.height).toBeCloseTo(3, 5);
    });

    it('supports ch units for layout sizing', () => {
        const root = create_root();
        set_style(root, { width: 30, height: 5 });

        const child = create_element('box');
        set_attribute(child, 'width', '10ch');
        set_attribute(child, 'height', 3);
        append(root, child);

        const textNode = create_text('ABCDEFGHIJ');
        append(child, textNode);

        computeLayout(root, 30, 5);
        const layout = child.computedLayout;
        const row = snapshotTextGrid(root).split('\n')[0];
        free_node(root);

        expect(layout?.width).toBeCloseTo(10, 5);
        expect(row.slice(0, 10)).toBe('ABCDEFGHIJ');
    });

    it('applies styles to standard HTML tags', () => {
        registerStylesheet('__semantic__', 'div.semantic span.label { color: magenta; font-weight: bold; }');
        const root = create_root();
        set_style(root, { width: 16, height: 3 });

        const container = create_element('div');
        set_attribute(container, 'class', 'semantic');
        append(root, container);

        const label = create_element('span');
        set_attribute(label, 'class', 'label');
        append(container, label);
        append(label, create_text('Hello'));

        computeLayout(root, 16, 3);
        const { output } = renderToString(root, {});
        free_node(root);

        // All colors use 24-bit ANSI codes for consistency
        // magenta = rgb(255, 0, 255) -> 38;2;255;0;255
        expect(output).toContain('\x1b[38;2;255;0;255m'); // magenta text (24-bit)
        expect(output).toContain('Hello');
    });

    it('applies flex gap using character units', () => {
        const root = create_root();
        set_style(root, { width: 20, height: 3 });

        const row = create_element('box');
        set_attribute(row, 'flexDirection', 'row');
        set_attribute(row, 'gap', '1ch');
        append(root, row);

        const first = create_text('A');
        const second = create_text('B');
        append(row, first);
        append(row, second);

        computeLayout(root, 20, 3);
        const left1 = first.computedLayout?.left ?? 0;
        const width1 = first.computedLayout?.width ?? 0;
        const left2 = second.computedLayout?.left ?? 0;
        free_node(root);

        expect(left2 - (left1 + width1)).toBeCloseTo(1, 5);
    });

    it('applies row and column gaps from stylesheet', () => {
        registerStylesheet('__gap__', '.stack { flex-direction: column; row-gap: 2ch; } .stack > text { width: auto; }');
        const root = create_root();
        set_style(root, { width: 10, height: 6 });

        const col = create_element('box');
        set_attribute(col, 'class', 'stack');
        append(root, col);

        const first = create_text('A');
        const second = create_text('B');
        append(col, first);
        append(col, second);

        computeLayout(root, 10, 6);
        const top1 = first.computedLayout?.top ?? 0;
        const height1 = first.computedLayout?.height ?? 0;
        const top2 = second.computedLayout?.top ?? 0;
        free_node(root);

        expect(top2 - (top1 + height1)).toBeCloseTo(2, 5);
    });

    it('applies focus background to input from CSS', () => {
        ensureBaseStyles(); // Register user-agent stylesheet
        
        const root = create_root();
        set_style(root, { width: 20, height: 5 });

        const box = create_element('box');
        append(root, box);

        const input = create_element('input');
        input.value = 'ok';
        append(box, input);

        registerFocusable(input);
        setFocus(input);
        computeLayout(root, 20, 5);
        const { output } = renderToString(root, {});
        unregisterFocusable(input);
        free_node(root);

        // Focus background from CSS: --color-field-focus-background (#0a2540 = 10, 37, 64)
        expect(output).toMatch(/\x1b\[48;2;10;37;64m/);
    });

    it('does not clear screen when repainting unchanged backgrounds', () => {
        const root = create_root();
        set_style(root, { width: 6, height: 2 });
        set_attribute(root, 'backgroundColor', 'blue');

        computeLayout(root, 6, 2);
        const first = renderToString(root, {});
        const second = renderToString(root, {});
        free_node(root);

        expect(first.output).toContain('\x1b[48;2;0;0;255m'); // blue background (24-bit)
        expect(second.output).not.toContain('\x1b[2J');
    });

    it('switches border styling based on focus state flag', () => {
        ensureBaseStyles(); // Register user-agent stylesheet
        
        const root = create_root();
        set_style(root, { width: 6, height: 3 });

        const box = create_element('box');
        set_attribute(box, 'borderStyle', 'single');
        set_attribute(box, 'width', 6);
        set_attribute(box, 'height', 3);
        append(root, box);

        computeLayout(root, 6, 3);
        // Set focus state directly (simulating what registerFocusable + setFocus does)
        box.__focusState = 'focused';
        const focused = renderToString(root, {});

        delete box.__focusState;
        const normal = renderToString(root, {});
        free_node(root);

        // Focus: AccentColor (#0066cc = 0, 102, 204) from CSS *:focus rule
        // Normal: no border color specified, so default terminal color
        expect(focused.output).toContain('\x1b[38;2;0;102;204m'); // blue focus border (24-bit)
    });

    it('resets style when transitioning to unstyled cells', () => {
        const root = create_root();
        set_style(root, { width: 10, height: 1 });

        const row = create_element('box');
        set_attribute(row, 'flexDirection', 'row');
        append(root, row);

        const styledText = create_element('text');
        set_attribute(styledText, 'color', 'green');
        append(row, styledText);
        append(styledText, create_text('AB'));

        computeLayout(root, 10, 1);
        const { output } = renderToString(root, {});
        free_node(root);

        // When transitioning from styled to unstyled cells, we reset immediately
        // This prevents background colors from bleeding into unstyled areas
        // green = rgb(0, 128, 0) -> 38;2;0;128;0
        expect(output).toContain('\x1b[38;2;0;128;0mAB');  // AB in green
        expect(output).toContain('\x1b[0m');               // Reset after styled text
        // The remaining spaces should be unstyled (terminal default)
    });

    it('layers siblings strictly by DOM order when overlapping', () => {
        const root = create_root();
        set_style(root, { width: 8, height: 2 });

        const bottom = create_element('box');
        set_attribute(bottom, 'position', 'absolute');
        set_attribute(bottom, 'left', 0);
        set_attribute(bottom, 'top', 0);
        set_attribute(bottom, 'width', 4);
        set_attribute(bottom, 'height', 1);
        append(root, bottom);

        const bottomText = create_element('text');
        append(bottom, bottomText);
        append(bottomText, create_text('AAAA'));

        const top = create_element('box');
        set_attribute(top, 'position', 'absolute');
        set_attribute(top, 'left', 0);
        set_attribute(top, 'top', 0);
        set_attribute(top, 'width', 4);
        set_attribute(top, 'height', 1);
        append(root, top);

        const topText = create_element('text');
        append(top, topText);
        append(topText, create_text('BBBB'));

        computeLayout(root, 8, 2);
        const { output } = renderToString(root, {});
        free_node(root);

        const plain = output.replace(/\x1B\[[0-9;?]*[A-Za-z]/g, '');
        expect(plain).toContain('BBBB');
        expect(plain).not.toContain('AAAA');
    });

    it('honors z-index when overlapping siblings differ', () => {
        const root = create_root();
        set_style(root, { width: 8, height: 2 });

        const base = create_element('box');
        set_attribute(base, 'position', 'absolute');
        set_attribute(base, 'left', 0);
        set_attribute(base, 'top', 0);
        set_attribute(base, 'width', 4);
        set_attribute(base, 'height', 1);
        set_attribute(base, 'zIndex', 0);
        append(root, base);

        const baseText = create_element('text');
        append(base, baseText);
        append(baseText, create_text('LOW'));

        const overlay = create_element('box');
        set_attribute(overlay, 'position', 'absolute');
        set_attribute(overlay, 'left', 0);
        set_attribute(overlay, 'top', 0);
        set_attribute(overlay, 'width', 4);
        set_attribute(overlay, 'height', 1);
        set_attribute(overlay, 'zIndex', 5);
        append(root, overlay);

        const overlayText = create_element('text');
        append(overlay, overlayText);
        append(overlayText, create_text('HIGH'));

        computeLayout(root, 8, 2);
        const { output } = renderToString(root, {});
        free_node(root);

        const plain = output.replace(/\x1B\[[0-9;?]*[A-Za-z]/g, '');
        expect(plain).toContain('HIGH');
        expect(plain).not.toContain('LOW');
    });

    it('positions fixed nodes relative to the viewport', () => {
        const root = create_root();
        set_style(root, { width: 10, height: 4 });

        const parent = create_element('box');
        set_attribute(parent, 'paddingTop', 1);
        append(root, parent);

        const fixed = create_element('box');
        set_attribute(fixed, 'position', 'fixed');
        set_attribute(fixed, 'left', 4);
        set_attribute(fixed, 'top', 0);
        append(parent, fixed);
        const fixedLabel = create_element('text');
        append(fixed, fixedLabel);
        append(fixedLabel, create_text('F'));

        computeLayout(root, 10, 4);
        const snapshot = snapshotTextGrid(root).split('\n');
        free_node(root);

        expect(snapshot[0][4]).toBe('F');
    });

    it('positions popovers relative to their anchor id', () => {
        const root = create_root();
        set_style(root, { width: 10, height: 5 });

        const anchor = create_element('box');
        set_attribute(anchor, 'id', 'anchor');
        append(root, anchor);
        const aText = create_element('text');
        append(anchor, aText);
        append(aText, create_text('A'));

        const popover = create_element('box');
        set_attribute(popover, 'anchor', 'anchor');
        set_attribute(popover, 'popover', 'auto');
        set_attribute(popover, 'popoverPlacement', 'bottom');
        append(root, popover);
        const pText = create_element('text');
        append(popover, pText);
        append(pText, create_text('P'));
        showPopover(popover);

        computeLayout(root, 10, 5);
        const snapshot = snapshotTextGrid(root).split('\n');
        free_node(root);

        expect(snapshot[1][0]).toBe('P');
    });

    it('clips descendant text to preserve padding', () => {
        const root = create_root();
        set_style(root, { width: 10, height: 4, padding: 1, backgroundColor: '#112233' });

        const span = create_element('text');
        append(root, span);
        append(
            span,
            create_text(
                'ABCDEFGHIJKL\nMNOPQRSTUVWX\nYZ1234567890' // long enough to overflow both directions
            )
        );

        computeLayout(root, 10, 4);
        const grid = paintGrid(root);
        free_node(root);

        // Right padding (row 1, col 9) should stay empty with background color.
        expect(grid[1][9].char).toBe(' ');
        expect(grid[1][9].style?.backgroundColor).toBe('#112233');
        // Bottom padding (row 3) should also remain untouched.
        expect(grid[3][5].char).toBe(' ');
        expect(grid[3][5].style?.backgroundColor).toBe('#112233');
    });

    it('does not clip content at padding boundary when not overflowing', () => {
        const root = create_root();
        // Node with padding only (no border) - content should start at padding boundary
        set_style(root, { width: 20, height: 5, padding: 2 });

        const span = create_element('text');
        append(root, span);
        append(span, create_text('hello')); // Short text that fits within content area

        computeLayout(root, 20, 5);
        const grid = paintGrid(root);
        free_node(root);

        // Text should be visible starting at the padding boundary (col 2, row 2)
        expect(grid[2][2].char).toBe('h');
        expect(grid[2][3].char).toBe('e');
        expect(grid[2][4].char).toBe('l');
        expect(grid[2][5].char).toBe('l');
        expect(grid[2][6].char).toBe('o');
    });

    it('renders borders correctly with padding', () => {
        const root = create_root();
        // With border-style: single, border adds 1 to layout on each edge
        // So content with padding=1 starts at border(1) + padding(1) = col/row 2
        set_style(root, { width: 10, height: 5, padding: 1, borderStyle: 'single' });

        const span = create_element('text');
        append(root, span);
        append(span, create_text('AB'));

        computeLayout(root, 10, 5);
        const grid = paintGrid(root);
        free_node(root);

        // Border should be at edges
        expect(grid[0][0].char).toBe('┌');
        expect(grid[0][9].char).toBe('┐');
        // Note: with border, height becomes 6 due to border taking space
        // But we painted on a 10x5 grid, so bottom border is at row 5
        
        // Content at border(1) + padding(1) = col 2, row 2
        expect(grid[2][2].char).toBe('A');
        expect(grid[2][3].char).toBe('B');
    });

    it('supports CSS anchor-name and position-anchor properties', () => {
        const root = create_root();
        set_style(root, { width: 10, height: 5 });

        const anchor = create_element('box');
        set_style(anchor, { anchorName: '--tip', marginTop: 1 });
        append(root, anchor);
        const anchorText = create_element('text');
        append(anchor, anchorText);
        append(anchorText, create_text('A'));

        const popover = create_element('box');
        set_attribute(popover, 'popover', 'auto');
        set_style(popover, { positionAnchor: '--tip', positionArea: 'top' });
        append(root, popover);
        const tipText = create_element('text');
        append(popover, tipText);
        append(tipText, create_text('P'));
        showPopover(popover);

        computeLayout(root, 10, 5);
        const snapshot = snapshotTextGrid(root).split('\n');
        free_node(root);

        expect(snapshot[0][0]).toBe('P');
        expect(snapshot[1]).toContain('A');
    });

    it('toggles auto popovers via popovertarget controls', () => {
        const root = create_root();
        set_style(root, { width: 8, height: 4 });

        const anchor = create_element('box');
        set_attribute(anchor, 'id', 'anchor');
        append(root, anchor);
        const anchorText = create_element('text');
        append(anchor, anchorText);
        append(anchorText, create_text('A'));

        const popover = create_element('box');
        set_attribute(popover, 'id', 'tip');
        set_attribute(popover, 'anchor', 'anchor');
        set_attribute(popover, 'popover', 'auto');
        append(root, popover);
        const tipText = create_element('text');
        append(popover, tipText);
        append(tipText, create_text('P'));

        const button = create_element('button');
        set_attribute(button, 'popovertarget', 'tip');
        append(root, button);

        computeLayout(root, 8, 4);
        let snapshot = snapshotTextGrid(root);
        expect(snapshot).not.toContain('P');

        expect(activatePopoverControl(button)).toBe(true);
        computeLayout(root, 8, 4);
        snapshot = snapshotTextGrid(root);
        expect(snapshot).toContain('P');

        expect(activatePopoverControl(button)).toBe(true);
        computeLayout(root, 8, 4);
        snapshot = snapshotTextGrid(root);
        expect(snapshot).not.toContain('P');

        free_node(root);
    });

    describe('text-align', () => {
        it('aligns text to the right within container', () => {
            registerStylesheet('__align__', '.right { text-align: right; }');
            const root = create_root();
            set_style(root, { width: 20, height: 3 });

            const container = create_element('box');
            set_attribute(container, 'class', 'right');
            set_attribute(container, 'width', 20);
            append(root, container);

            const text = create_text('Hello');
            append(container, text);

            computeLayout(root, 20, 3);
            const line = snapshotTextGrid(root).split('\n')[0];
            free_node(root);

            // "Hello" is 5 chars, container is 20 wide, so should start at position 15
            expect(line.indexOf('Hello')).toBe(15);
        });

        it('centers text within container', () => {
            registerStylesheet('__align__', '.center { text-align: center; }');
            const root = create_root();
            set_style(root, { width: 20, height: 3 });

            const container = create_element('box');
            set_attribute(container, 'class', 'center');
            set_attribute(container, 'width', 20);
            append(root, container);

            const text = create_text('Hello');
            append(container, text);

            computeLayout(root, 20, 3);
            const line = snapshotTextGrid(root).split('\n')[0];
            free_node(root);

            // "Hello" is 5 chars, container is 20 wide, offset = (20-5)/2 = 7
            expect(line.indexOf('Hello')).toBe(7);
        });

        it('left-aligns text by default', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 3 });

            const container = create_element('box');
            set_attribute(container, 'width', 20);
            append(root, container);

            const text = create_text('Hello');
            append(container, text);

            computeLayout(root, 20, 3);
            const line = snapshotTextGrid(root).split('\n')[0];
            free_node(root);

            expect(line.indexOf('Hello')).toBe(0);
        });

        it('inherits text-align from parent', () => {
            registerStylesheet('__align__', '.parent { text-align: right; }');
            const root = create_root();
            set_style(root, { width: 20, height: 3 });

            const parent = create_element('box');
            set_attribute(parent, 'class', 'parent');
            set_attribute(parent, 'width', 20);
            append(root, parent);

            const child = create_element('span');
            append(parent, child);

            const text = create_text('Test');
            append(child, text);

            computeLayout(root, 20, 3);
            const line = snapshotTextGrid(root).split('\n')[0];
            free_node(root);

            // "Test" is 4 chars, container is 20 wide, so should start at position 16
            expect(line.indexOf('Test')).toBe(16);
        });

        it('aligns text within bordered containers', () => {
            registerStylesheet('__align__', '.box { border-style: single; text-align: center; }');
            const root = create_root();
            set_style(root, { width: 20, height: 3 });

            const container = create_element('box');
            set_attribute(container, 'class', 'box');
            set_attribute(container, 'width', 20);
            set_attribute(container, 'height', 3);
            append(root, container);

            const text = create_text('Hi');
            append(container, text);

            computeLayout(root, 20, 3);
            const lines = snapshotTextGrid(root).split('\n');
            const contentLine = lines[1]; // middle line with content
            free_node(root);

            // Content area is 18 chars (20 - 2 borders), "Hi" is 2 chars
            // Centered position within content: (18-2)/2 = 8, plus 1 for left border = 9
            const hiPos = contentLine.indexOf('Hi');
            expect(hiPos).toBeGreaterThan(5); // Should be roughly centered
            expect(hiPos).toBeLessThan(15);
        });

        it('maps text-align: start to left', () => {
            registerStylesheet('__align__', '.start { text-align: start; }');
            const root = create_root();
            set_style(root, { width: 20, height: 3 });

            const container = create_element('box');
            set_attribute(container, 'class', 'start');
            set_attribute(container, 'width', 20);
            append(root, container);

            const text = create_text('Hello');
            append(container, text);

            computeLayout(root, 20, 3);
            const line = snapshotTextGrid(root).split('\n')[0];
            free_node(root);

            expect(line.indexOf('Hello')).toBe(0);
        });

        it('maps text-align: end to right', () => {
            registerStylesheet('__align__', '.end { text-align: end; }');
            const root = create_root();
            set_style(root, { width: 20, height: 3 });

            const container = create_element('box');
            set_attribute(container, 'class', 'end');
            set_attribute(container, 'width', 20);
            append(root, container);

            const text = create_text('Hello');
            append(container, text);

            computeLayout(root, 20, 3);
            const line = snapshotTextGrid(root).split('\n')[0];
            free_node(root);

            expect(line.indexOf('Hello')).toBe(15);
        });
    });

    describe('fixed positioning', () => {
        it('positions element at bottom: 0 relative to viewport', () => {
            registerStylesheet('__fixed__', '.fixed { position: fixed; bottom: 0; left: 0; width: 10ch; height: 1; }');
            const root = create_root();
            set_style(root, { width: 20, height: 10 });

            const container = create_element('div');
            append(root, container);

            const normalContent = create_element('div');
            append(normalContent, create_text('Top'));
            append(container, normalContent);

            const fixedEl = create_element('div');
            set_attribute(fixedEl, 'class', 'fixed');
            append(fixedEl, create_text('Bottom'));
            append(container, fixedEl);

            computeLayout(root, 20, 10);
            const lines = snapshotTextGrid(root).split('\n');
            free_node(root);

            // "Top" should be at line 0
            expect(lines[0]).toContain('Top');
            // "Bottom" should be at the last line (line 9 for height 10)
            expect(lines[9]).toContain('Bottom');
        });

        it('positions element at top: 0 relative to viewport', () => {
            registerStylesheet('__fixed_top__', '.fixed-top { position: fixed; top: 0; left: 0; width: 10ch; height: 1; }');
            const root = create_root();
            set_style(root, { width: 20, height: 10 });

            const container = create_element('div');
            set_style(container, { paddingTop: 5 }); // Push content down
            append(root, container);

            const normalContent = create_element('div');
            append(normalContent, create_text('Middle'));
            append(container, normalContent);

            const fixedEl = create_element('div');
            set_attribute(fixedEl, 'class', 'fixed-top');
            append(fixedEl, create_text('Top'));
            append(container, fixedEl);

            computeLayout(root, 20, 10);
            const lines = snapshotTextGrid(root).split('\n');
            free_node(root);

            // "Top" should be at line 0 (fixed to top)
            expect(lines[0]).toContain('Top');
            // "Middle" should be at line 5 (after padding)
            expect(lines[5]).toContain('Middle');
        });
    });

    describe('select rendering', () => {
        it('displays selected option label not all options', () => {
            const root = create_root();
            set_style(root, { width: 30, height: 5 });

            const select = create_element('select');
            set_style(select, { width: 20, height: 3 });

            // Add options as children
            const opt1 = create_element('option');
            opt1.value = 'vanilla';
            opt1.textContent = 'Vanilla';
            append(select, opt1);

            const opt2 = create_element('option');
            opt2.value = 'chocolate';
            opt2.textContent = 'Chocolate';
            append(select, opt2);

            const opt3 = create_element('option');
            opt3.value = 'strawberry';
            opt3.textContent = 'Strawberry';
            append(select, opt3);

            // Set selected index
            select.selectedIndex = 0;

            append(root, select);

            computeLayout(root, 30, 5);
            const output = snapshotTextGrid(root);
            free_node(root);

            // Should show "Vanilla" (the selected option)
            expect(output).toContain('Vanilla');
            // Should NOT show all options concatenated
            expect(output).not.toContain('VanillaChocolateStrawberry');
            expect(output).not.toContain('Chocolate');
            expect(output).not.toContain('Strawberry');
        });
    });

    describe('fieldset and legend', () => {
        it('renders fieldset with border', () => {
            ensureBaseStyles();
            const root = create_root();
            set_style(root, { width: 20, height: 5 });

            const fieldset = create_element('fieldset');
            set_style(fieldset, { width: 20, height: 5 });
            append(root, fieldset);

            const content = create_element('div');
            append(content, create_text('Content'));
            append(fieldset, content);

            computeLayout(root, 20, 5);
            const output = snapshotTextGrid(root);
            free_node(root);

            // Should have border corners
            expect(output).toContain('┌');
            expect(output).toContain('┐');
            expect(output).toContain('└');
            expect(output).toContain('┘');
            // Should contain the content
            expect(output).toContain('Content');
        });

        it('renders legend on the top border', () => {
            ensureBaseStyles();
            const root = create_root();
            set_style(root, { width: 30, height: 5 });

            const fieldset = create_element('fieldset');
            set_style(fieldset, { width: 30, height: 5 });
            append(root, fieldset);

            const legend = create_element('legend');
            legend.textContent = 'Options';
            append(fieldset, legend);

            const content = create_element('div');
            append(content, create_text('Some content'));
            append(fieldset, content);

            computeLayout(root, 30, 5);
            const output = snapshotTextGrid(root);
            const lines = output.split('\n');
            free_node(root);

            // First line should contain the legend text on the border
            expect(lines[0]).toContain('Options');
            // First line should still have border corners
            expect(lines[0]).toContain('┌');
            expect(lines[0]).toContain('┐');
            // Content should be inside
            expect(output).toContain('Some content');
        });

        it('applies CSS styles to fieldset border', () => {
            ensureBaseStyles();
            registerStylesheet('__fieldset_style__', '.custom-fieldset { border-style: double; border-color: red; }');
            const root = create_root();
            set_style(root, { width: 20, height: 5 });

            const fieldset = create_element('fieldset');
            set_attribute(fieldset, 'class', 'custom-fieldset');
            set_style(fieldset, { width: 20, height: 5 });
            append(root, fieldset);

            computeLayout(root, 20, 5);
            const output = snapshotTextGrid(root);
            free_node(root);

            // Should have double border style
            expect(output).toContain('╔');
            expect(output).toContain('╗');
        });

        it('applies CSS styles to legend text', () => {
            ensureBaseStyles();
            registerStylesheet('__legend_style__', '.styled-legend { color: cyan; }');
            const root = create_root();
            set_style(root, { width: 30, height: 5 });

            const fieldset = create_element('fieldset');
            set_style(fieldset, { width: 30, height: 5 });
            append(root, fieldset);

            const legend = create_element('legend');
            set_attribute(legend, 'class', 'styled-legend');
            legend.textContent = 'Title';
            append(fieldset, legend);

            computeLayout(root, 30, 5);
            const { output } = renderToString(root, {});
            free_node(root);

            // Should contain the legend text
            expect(output).toContain('Title');
            // Cyan = rgb(0, 255, 255) -> 38;2;0;255;255
            expect(output).toMatch(/\x1b\[38;2;0;255;255m.*Title/);
        });
    });

    describe('text renderer', () => {
        it('renders text with inherited color', () => {
            registerStylesheet('__text__', '.parent { color: red; }');
            const root = create_root();
            set_style(root, { width: 20, height: 3 });

            const parent = create_element('div');
            set_attribute(parent, 'class', 'parent');
            append(root, parent);

            const text = create_text('Hello');
            append(parent, text);

            computeLayout(root, 20, 3);
            const { output } = renderToString(root, {});
            free_node(root);

            // Red = rgb(255, 0, 0) -> 38;2;255;0;0
            expect(output).toMatch(/\x1b\[38;2;255;0;0m.*Hello/);
        });

        it('renders text with explicit background', () => {
            registerStylesheet('__text__', '.text-bg { background-color: blue; }');
            const root = create_root();
            set_style(root, { width: 20, height: 3 });

            const span = create_element('span');
            set_attribute(span, 'class', 'text-bg');
            append(root, span);

            const text = create_text('Blue');
            append(span, text);

            computeLayout(root, 20, 3);
            const { output } = renderToString(root, {});
            free_node(root);

            // Blue = rgb(0, 0, 255) -> 48;2;0;0;255
            expect(output).toMatch(/\x1b\[48;2;0;0;255m.*Blue/);
        });

        it('renders multi-line text with wrapping', () => {
            const root = create_root();
            set_style(root, { width: 10, height: 5 });

            const container = create_element('div');
            set_style(container, { width: 10, height: 5 });
            append(root, container);

            const text = create_text('Hello World Wrap');
            append(container, text);

            computeLayout(root, 10, 5);
            const lines = snapshotTextGrid(root).split('\n');
            free_node(root);

            // Text should wrap within the 10-character width
            expect(lines[0].trim()).toBe('Hello');
            expect(lines[1].trim()).toBe('World Wrap');
        });

        it('applies text-align: center to text', () => {
            registerStylesheet('__text__', '.center { text-align: center; }');
            const root = create_root();
            set_style(root, { width: 20, height: 3 });

            const container = create_element('div');
            set_attribute(container, 'class', 'center');
            set_style(container, { width: 20 });
            append(root, container);

            const text = create_text('Hi');
            append(container, text);

            computeLayout(root, 20, 3);
            const line = snapshotTextGrid(root).split('\n')[0];
            free_node(root);

            // "Hi" is 2 chars, container is 20 wide, offset = (20-2)/2 = 9
            expect(line.indexOf('Hi')).toBe(9);
        });

        it('applies text-align: right to text', () => {
            registerStylesheet('__text__', '.right { text-align: right; }');
            const root = create_root();
            set_style(root, { width: 20, height: 3 });

            const container = create_element('div');
            set_attribute(container, 'class', 'right');
            set_style(container, { width: 20 });
            append(root, container);

            const text = create_text('End');
            append(container, text);

            computeLayout(root, 20, 3);
            const line = snapshotTextGrid(root).split('\n')[0];
            free_node(root);

            // "End" is 3 chars, container is 20 wide, so should start at position 17
            expect(line.indexOf('End')).toBe(17);
        });

        it('inherits text-align from ancestor', () => {
            registerStylesheet('__text__', '.outer { text-align: center; }');
            const root = create_root();
            set_style(root, { width: 20, height: 3 });

            const outer = create_element('div');
            set_attribute(outer, 'class', 'outer');
            set_style(outer, { width: 20 });
            append(root, outer);

            const inner = create_element('span');
            append(outer, inner);

            const text = create_text('X');
            append(inner, text);

            computeLayout(root, 20, 3);
            const line = snapshotTextGrid(root).split('\n')[0];
            free_node(root);

            // "X" is 1 char, container is 20 wide, offset = (20-1)/2 = 9
            expect(line.indexOf('X')).toBe(9);
        });
    });

    describe('base rendering', () => {
        it('renders background inside borders', () => {
            registerStylesheet('__base__', '.box { border-style: single; background-color: blue; }');
            const root = create_root();
            set_style(root, { width: 10, height: 5 });

            const box = create_element('div');
            set_attribute(box, 'class', 'box');
            set_style(box, { width: 10, height: 5 });
            append(root, box);

            computeLayout(root, 10, 5);
            const grid = paintGrid(root);
            free_node(root);

            // Border corners should not have background
            expect(grid[0][0].char).toBe('┌');
            expect(grid[0][0].style?.backgroundColor).toBeUndefined();

            // Interior should have blue background
            expect(grid[1][1].style?.backgroundColor).toBe('blue');
            expect(grid[2][5].style?.backgroundColor).toBe('blue');
        });

        it('renders background without borders', () => {
            registerStylesheet('__base__', '.noborder { background-color: green; }');
            const root = create_root();
            set_style(root, { width: 10, height: 5 });

            const box = create_element('div');
            set_attribute(box, 'class', 'noborder');
            set_style(box, { width: 10, height: 5 });
            append(root, box);

            computeLayout(root, 10, 5);
            const grid = paintGrid(root);
            free_node(root);

            // All cells should have green background
            expect(grid[0][0].style?.backgroundColor).toBe('green');
            expect(grid[2][5].style?.backgroundColor).toBe('green');
        });

        it('form controls render borders before content', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 3 });

            const input = create_element('input');
            set_style(input, { width: 20, height: 3, borderStyle: 'single' });
            append(root, input);

            computeLayout(root, 20, 3);
            const grid = paintGrid(root);
            free_node(root);

            // Border should be present
            expect(grid[0][0].char).toBe('┌');
            expect(grid[0][19].char).toBe('┐');
            expect(grid[2][0].char).toBe('└');
            expect(grid[2][19].char).toBe('┘');
        });

        it('non-form elements render borders after background', () => {
            registerStylesheet('__base__', '.bordered { border-style: single; background-color: red; }');
            const root = create_root();
            set_style(root, { width: 10, height: 5 });

            const box = create_element('div');
            set_attribute(box, 'class', 'bordered');
            set_style(box, { width: 10, height: 5 });
            append(root, box);

            computeLayout(root, 10, 5);
            const grid = paintGrid(root);
            free_node(root);

            // Border corners should be present
            expect(grid[0][0].char).toBe('┌');
            // Interior should have background
            expect(grid[1][1].style?.backgroundColor).toBe('red');
        });
    });

    describe('PaintContext propagation', () => {
        it('propagates parent style to nested children', () => {
            registerStylesheet('__ctx__', '.parent { color: blue; }');
            const root = create_root();
            set_style(root, { width: 20, height: 5 });

            const parent = create_element('div');
            set_attribute(parent, 'class', 'parent');
            append(root, parent);

            const child = create_element('div');
            append(parent, child);

            const grandchild = create_element('span');
            append(child, grandchild);

            const text = create_text('Deep');
            append(grandchild, text);

            computeLayout(root, 20, 5);
            const { output } = renderToString(root, {});
            free_node(root);

            // Blue = rgb(0, 0, 255) -> 38;2;0;0;255
            expect(output).toMatch(/\x1b\[38;2;0;0;255m.*Deep/);
        });

        it('propagates clip bounds through nested elements', () => {
            registerStylesheet('__ctx__', '.clipped { overflow: hidden; }');
            const root = create_root();
            set_style(root, { width: 10, height: 3 });

            const outer = create_element('div');
            set_attribute(outer, 'class', 'clipped');
            set_style(outer, { width: 10, height: 3, padding: 1 });
            append(root, outer);

            const inner = create_element('div');
            append(outer, inner);

            // This text is longer than the clipped width
            const text = create_text('Hello World Test');
            append(inner, text);

            computeLayout(root, 10, 3);
            const lines = snapshotTextGrid(root).split('\n');
            free_node(root);

            // Content should be clipped to the padded area (8 chars wide)
            expect(lines[1].trim().length).toBeLessThanOrEqual(8);
        });

        it('propagates container bounds for text alignment in nested elements', () => {
            registerStylesheet('__ctx__', '.center { text-align: center; }');
            const root = create_root();
            set_style(root, { width: 20, height: 3 });

            const outer = create_element('div');
            set_attribute(outer, 'class', 'center');
            set_style(outer, { width: 20 });
            append(root, outer);

            const inner = create_element('span');
            append(outer, inner);

            const deep = create_element('span');
            append(inner, deep);

            const text = create_text('X');
            append(deep, text);

            computeLayout(root, 20, 3);
            const line = snapshotTextGrid(root).split('\n')[0];
            free_node(root);

            // "X" should be centered in the 20-char container
            expect(line.indexOf('X')).toBe(9);
        });

        it('creates correct context for top-layer elements', () => {
            ensureBaseStyles();
            const root = create_root();
            set_style(root, { width: 30, height: 10 });

            // Create a popover
            const popover = create_element('div');
            set_attribute(popover, 'popover', 'auto');
            set_style(popover, { width: 10, height: 3, position: 'fixed', top: 2, left: 5 });
            append(root, popover);

            const text = create_text('Popup');
            append(popover, text);

            // Register as focusable and show the popover
            registerFocusable(popover);
            computeLayout(root, 30, 10);
            showPopover(popover);

            const lines = snapshotTextGrid(root).split('\n');
            free_node(root);

            // The popover should render at its fixed position
            expect(lines[2]).toContain('Popup');
        });

        it('handles layout override for constrained rendering', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 5 });

            // Create a table which uses constrained rendering
            const table = create_element('table');
            set_style(table, { width: 20, height: 5 });
            append(root, table);

            const tbody = create_element('tbody');
            append(table, tbody);

            const row = create_element('tr');
            append(tbody, row);

            const cell = create_element('td');
            append(row, cell);

            const text = create_text('Cell');
            append(cell, text);

            computeLayout(root, 20, 5);
            const lines = snapshotTextGrid(root).split('\n');
            free_node(root);

            // Cell content should be rendered
            expect(lines.join('')).toContain('Cell');
        });
    });

    describe('text wrapping with borders', () => {
        it('wraps text to fit inside borders and padding', () => {
            const root = create_root();
            // Container: 30 chars wide, 6 tall
            // Border takes 1 char on each side
            // Padding: 1 char on each side
            // Content area: 30 - 2 (border) - 2 (padding) = 26 chars
            set_style(root, { width: 30, height: 6, borderStyle: 'single', padding: 1 });

            const para = create_element('p');
            append(root, para);

            // This text is 40 chars, should wrap to fit in ~26 char content area
            const text = create_text('This is a long text that should wrap');
            append(para, text);

            computeLayout(root, 30, 6);
            const lines = snapshotTextGrid(root).split('\n');
            free_node(root);

            // Check that borders are intact on all lines
            // First line should be top border
            expect(lines[0]).toMatch(/^┌─+┐$/);
            // Last line should be bottom border
            expect(lines[5]).toMatch(/^└─+┘$/);
            // Middle lines should have side borders
            for (let i = 1; i < 5; i++) {
                expect(lines[i].startsWith('│')).toBe(true);
                expect(lines[i].endsWith('│')).toBe(true);
            }

            // Text should be wrapped and not overwrite borders
            // The text "This is a long text that should wrap" should be split
            const content = lines.slice(1, 5).map(l => l.slice(1, -1)).join('');
            expect(content).toContain('This');
            expect(content).toContain('wrap');
        });

        it('wraps text correctly with only border (no padding)', () => {
            const root = create_root();
            // Container: 20 chars wide, 4 tall
            // Border takes 1 char on each side (drawn OVER the edge cells)
            // Content area: 20 - 2 (border inset) = 18 chars
            set_style(root, { width: 20, height: 4, borderStyle: 'single' });

            const para = create_element('p');
            append(root, para);

            // Text that needs to wrap
            const text = create_text('Hello world this is test');
            append(para, text);

            computeLayout(root, 20, 4);
            const lines = snapshotTextGrid(root).split('\n');
            free_node(root);

            // Borders should be intact
            expect(lines[0]).toMatch(/^┌─+┐$/);
            expect(lines[3]).toMatch(/^└─+┘$/);
            expect(lines[1].startsWith('│')).toBe(true);
            expect(lines[1].endsWith('│')).toBe(true);
            expect(lines[2].startsWith('│')).toBe(true);
            expect(lines[2].endsWith('│')).toBe(true);
        });

        it('does not let text overflow into border area', () => {
            const root = create_root();
            set_style(root, { width: 15, height: 3, borderStyle: 'single' });

            const para = create_element('p');
            append(root, para);

            // Very long word that can't be broken
            const text = create_text('Supercalifragilisticexpialidocious');
            append(para, text);

            computeLayout(root, 15, 3);
            const lines = snapshotTextGrid(root).split('\n');
            free_node(root);

            // Right border should still be intact (text clipped, not overflowing)
            expect(lines[0].endsWith('┐')).toBe(true);
            expect(lines[1].endsWith('│')).toBe(true);
            expect(lines[2].endsWith('┘')).toBe(true);
        });

        it('wraps long text in container with border and horizontal padding', () => {
            // This reproduces the Showcase.svelte scenario:
            // - Container with border-style: single
            // - Padding: 1ch vertically, 2ch horizontally
            // - Long text that needs to wrap
            const root = create_root();
            // Width 80, like a typical terminal
            // Border: 1 char each side
            // Padding: 2 chars each side horizontally
            // Content width should be: 80 - 2 (border) - 4 (padding) = 74 chars
            set_style(root, { 
                width: 80, 
                height: 10, 
                borderStyle: 'single',
                paddingTop: 1,
                paddingBottom: 1,
                paddingLeft: 2,
                paddingRight: 2,
            });

            const para = create_element('p');
            append(root, para);

            // The bee movie text - should wrap within the content area
            const longText = 'According to all known laws of aviation, there is no way a bee should be able to fly. Its wings are too small to get its fat little body off the ground.';
            const text = create_text(longText);
            append(para, text);

            computeLayout(root, 80, 10);
            const lines = snapshotTextGrid(root).split('\n');
            
            // Debug: print the actual output
            console.log('Actual output:');
            lines.forEach((line, i) => console.log(`${i}: [${line}] (len=${line.length})`));
            
            free_node(root);

            // All lines should be exactly 80 chars
            for (let i = 0; i < lines.length; i++) {
                expect(lines[i].length).toBe(80);
            }

            // Border should be intact on all sides
            expect(lines[0]).toMatch(/^┌─+┐$/);
            expect(lines[lines.length - 1]).toMatch(/^└─+┘$/);
            
            // All middle lines should have borders on both sides
            for (let i = 1; i < lines.length - 1; i++) {
                expect(lines[i].startsWith('│')).toBe(true);
                expect(lines[i].endsWith('│')).toBe(true);
            }
        });

        it('wraps text in nested p element inside bordered container (Showcase scenario)', () => {
            // Exact reproduction of Showcase.svelte structure:
            // <main class="appFrame"> has border + padding
            // <p> is a child element with text
            const root = create_root();
            set_style(root, { 
                width: 80, 
                height: 8, 
                borderStyle: 'single',
                paddingTop: 1,
                paddingBottom: 1,
                paddingLeft: 2,
                paddingRight: 2,
            });

            // The <p> element - no explicit width, should fill parent's content area
            const para = create_element('p');
            append(root, para);

            // Long text inside the <p>
            const longText = 'According to all known laws of aviation, there is no way a bee should be able to fly. Its wings are too small to get its fat little body off the ground.';
            const text = create_text(longText);
            append(para, text);

            computeLayout(root, 80, 8);
            const lines = snapshotTextGrid(root).split('\n');
            
            console.log('Nested p test output:');
            lines.forEach((line, i) => console.log(`${i}: [${line}] (len=${line.length})`));
            
            free_node(root);

            // Critical check: borders must be intact
            // Line 0: top border
            expect(lines[0].startsWith('┌')).toBe(true);
            expect(lines[0].endsWith('┐')).toBe(true);
            
            // Line 7: bottom border
            expect(lines[7].startsWith('└')).toBe(true);
            expect(lines[7].endsWith('┘')).toBe(true);
            
            // Lines 1-6: side borders must be intact
            for (let i = 1; i <= 6; i++) {
                expect(lines[i].startsWith('│')).toBe(true);
                expect(lines[i].endsWith('│')).toBe(true);
            }

            // Text should be present and wrapped
            const allContent = lines.slice(1, 7).join('');
            expect(allContent).toContain('According');
            expect(allContent).toContain('ground');
        });

        it('wraps text with CSS stylesheet (like Svelte component)', () => {
            // Test using registerStylesheet like a real Svelte component would
            registerStylesheet('test-showcase', `
                .appFrame {
                    border-style: single;
                    padding: 1ch 2ch;
                    width: 100%;
                    height: 100%;
                }
            `);
            ensureBaseStyles();

            const root = create_root();
            // Set className properly for CSS matching
            set_attribute(root, 'class', 'appFrame');

            const para = create_element('p');
            append(root, para);

            const longText = 'According to all known laws of aviation, there is no way a bee should be able to fly. Its wings are too small to get its fat little body off the ground.';
            const text = create_text(longText);
            append(para, text);

            // Compute layout at 80x10 viewport
            computeLayout(root, 80, 10);
            const lines = snapshotTextGrid(root).split('\n');
            
            console.log('CSS stylesheet test output:');
            lines.forEach((line, i) => console.log(`${i}: [${line}] (len=${line.length})`));
            
            free_node(root);

            // All lines should be exactly 80 chars
            for (let i = 0; i < lines.length; i++) {
                expect(lines[i].length).toBe(80);
            }

            // Borders must be intact
            expect(lines[0].startsWith('┌')).toBe(true);
            expect(lines[0].endsWith('┐')).toBe(true);
            expect(lines[lines.length - 1].startsWith('└')).toBe(true);
            expect(lines[lines.length - 1].endsWith('┘')).toBe(true);
            
            for (let i = 1; i < lines.length - 1; i++) {
                expect(lines[i].startsWith('│')).toBe(true);
                expect(lines[i].endsWith('│')).toBe(true);
            }
        });

        it('wraps text with emoji correctly (double-width characters)', () => {
            const root = create_root();
            set_style(root, { 
                width: 30, 
                height: 5, 
                borderStyle: 'single',
                paddingLeft: 1,
                paddingRight: 1,
            });

            const para = create_element('p');
            append(root, para);

            // Text with emoji - bee emoji is double-width (2 columns)
            // Content width: 30 - 2 (border) - 2 (padding) = 26
            // "🐝 Hello world" = 2 (bee) + 12 (rest) = 14 display width
            const text = create_text('🐝 Hello world this is a test');
            append(para, text);

            computeLayout(root, 30, 5);
            const lines = snapshotTextGrid(root).split('\n');
            
            console.log('Emoji test output:');
            lines.forEach((line, i) => console.log(`${i}: [${line}] (len=${line.length})`));
            
            free_node(root);

            // Borders must be intact
            expect(lines[0].startsWith('┌')).toBe(true);
            expect(lines[0].endsWith('┐')).toBe(true);
            expect(lines[4].startsWith('└')).toBe(true);
            expect(lines[4].endsWith('┘')).toBe(true);
            
            for (let i = 1; i <= 3; i++) {
                expect(lines[i].startsWith('│')).toBe(true);
                expect(lines[i].endsWith('│')).toBe(true);
            }

            // Text should contain the bee emoji
            const allContent = lines.join('');
            expect(allContent).toContain('🐝');
            expect(allContent).toContain('Hello');
        });
    });

    describe('z-index stacking', () => {
        it('renders higher z-index elements on top of lower ones', () => {
            ensureBaseStyles();
            const root = create_root();
            set_style(root, { width: 10, height: 3 });

            // Create three overlapping boxes at the same position
            // Box 1: z-index 1, char 'A'
            const box1 = create_element('div');
            set_style(box1, { 
                position: 'absolute', 
                left: 0, top: 0, 
                width: 5, height: 3,
                zIndex: 1,
                backgroundColor: 'red'
            });
            const text1 = create_text('AAAAA');
            append(box1, text1);
            append(root, box1);

            // Box 2: z-index 3 (higher), char 'B'
            const box2 = create_element('div');
            set_style(box2, { 
                position: 'absolute', 
                left: 2, top: 0, 
                width: 5, height: 3,
                zIndex: 3,
                backgroundColor: 'green'
            });
            const text2 = create_text('BBBBB');
            append(box2, text2);
            append(root, box2);

            // Box 3: z-index 2 (middle), char 'C'
            const box3 = create_element('div');
            set_style(box3, { 
                position: 'absolute', 
                left: 4, top: 0, 
                width: 5, height: 3,
                zIndex: 2,
                backgroundColor: 'blue'
            });
            const text3 = create_text('CCCCC');
            append(box3, text3);
            append(root, box3);

            computeLayout(root, 10, 3);
            const grid = paintGrid(root);
            
            // First row: A A B B B B B C C C
            // At position 0-1: only box1 (A)
            // At position 2-3: box1 and box2 overlap - box2 wins (z-index 3)
            // At position 4-6: all three overlap - box2 still wins (z-index 3)
            // At position 7-9: box2 and box3 overlap - box2 wins (z-index 3)
            
            const firstRow = grid[0].map(cell => cell.char).join('');
            
            // Position 0-1: A (only box1)
            expect(grid[0][0].char).toBe('A');
            expect(grid[0][1].char).toBe('A');
            
            // Position 2-3: B (box2 wins over box1, z-index 3 > 1)
            expect(grid[0][2].char).toBe('B');
            expect(grid[0][3].char).toBe('B');
            
            // Position 4-6: B (box2 wins over all, z-index 3 > 2 > 1)
            expect(grid[0][4].char).toBe('B');
            expect(grid[0][5].char).toBe('B');
            expect(grid[0][6].char).toBe('B');

            free_node(root);
        });

        it('maintains DOM order for elements with same z-index', () => {
            ensureBaseStyles();
            const root = create_root();
            set_style(root, { width: 6, height: 1 });

            // Create two overlapping boxes with same z-index
            // Later in DOM should paint on top
            const box1 = create_element('div');
            set_style(box1, { 
                position: 'absolute', 
                left: 0, top: 0, 
                width: 4, height: 1,
                zIndex: 1
            });
            const text1 = create_text('AAAA');
            append(box1, text1);
            append(root, box1);

            const box2 = create_element('div');
            set_style(box2, { 
                position: 'absolute', 
                left: 2, top: 0, 
                width: 4, height: 1,
                zIndex: 1 // Same z-index
            });
            const text2 = create_text('BBBB');
            append(box2, text2);
            append(root, box2);

            computeLayout(root, 6, 1);
            const grid = paintGrid(root);
            
            // Position 0-1: A (only box1)
            // Position 2-5: B (box2 comes later in DOM, same z-index)
            expect(grid[0][0].char).toBe('A');
            expect(grid[0][1].char).toBe('A');
            expect(grid[0][2].char).toBe('B');
            expect(grid[0][3].char).toBe('B');
            expect(grid[0][4].char).toBe('B');
            expect(grid[0][5].char).toBe('B');

            free_node(root);
        });

        it('renders negative z-index behind normal flow', () => {
            ensureBaseStyles();
            const root = create_root();
            set_style(root, { width: 6, height: 1 });

            // Box with negative z-index (should be behind)
            const bgBox = create_element('div');
            set_style(bgBox, { 
                position: 'absolute', 
                left: 0, top: 0, 
                width: 6, height: 1,
                zIndex: -1
            });
            const bgText = create_text('BBBBBB');
            append(bgBox, bgText);
            append(root, bgBox);

            // Normal box (z-index: 0/auto)
            const fgBox = create_element('div');
            set_style(fgBox, { 
                position: 'absolute', 
                left: 2, top: 0, 
                width: 2, height: 1
            });
            const fgText = create_text('FF');
            append(fgBox, fgText);
            append(root, fgBox);

            computeLayout(root, 6, 1);
            const grid = paintGrid(root);
            
            // Position 0-1: B (background box)
            // Position 2-3: F (foreground box on top)
            // Position 4-5: B (background box)
            expect(grid[0][0].char).toBe('B');
            expect(grid[0][1].char).toBe('B');
            expect(grid[0][2].char).toBe('F');
            expect(grid[0][3].char).toBe('F');
            expect(grid[0][4].char).toBe('B');
            expect(grid[0][5].char).toBe('B');

            free_node(root);
        });

        it('handles complex z-index layering with multiple overlapping elements', () => {
            ensureBaseStyles();
            const root = create_root();
            set_style(root, { width: 10, height: 3 });

            // Layer 1: z-index -10 (bottom)
            const layer1 = create_element('div');
            set_style(layer1, { 
                position: 'absolute', 
                left: 0, top: 0, 
                width: 10, height: 3,
                zIndex: -10
            });
            const text1 = create_text('1111111111');
            append(layer1, text1);
            append(root, layer1);

            // Layer 2: z-index 0 (default)
            const layer2 = create_element('div');
            set_style(layer2, { 
                position: 'absolute', 
                left: 2, top: 0, 
                width: 6, height: 3
            });
            const text2 = create_text('222222');
            append(layer2, text2);
            append(root, layer2);

            // Layer 3: z-index 5 (middle-high)
            const layer3 = create_element('div');
            set_style(layer3, { 
                position: 'absolute', 
                left: 4, top: 0, 
                width: 2, height: 3,
                zIndex: 5
            });
            const text3 = create_text('33');
            append(layer3, text3);
            append(root, layer3);

            // Layer 4: z-index 10 (top)
            const layer4 = create_element('div');
            set_style(layer4, { 
                position: 'absolute', 
                left: 6, top: 0, 
                width: 2, height: 3,
                zIndex: 10
            });
            const text4 = create_text('44');
            append(layer4, text4);
            append(root, layer4);

            computeLayout(root, 10, 3);
            const grid = paintGrid(root);
            
            // Expected: 1 1 2 2 3 3 4 4 2 1
            // Position 0-1: layer1 (z-index -10, only one here)
            // Position 2-3: layer2 (z-index 0 > -10)
            // Position 4-5: layer3 (z-index 5 > 0 > -10)
            // Position 6-7: layer4 (z-index 10 > 5 > 0 > -10)
            // Position 8-9: layer2 continues but layer1 shows through at edge
            
            expect(grid[0][0].char).toBe('1'); // Only layer1
            expect(grid[0][1].char).toBe('1'); // Only layer1
            expect(grid[0][2].char).toBe('2'); // layer2 wins
            expect(grid[0][3].char).toBe('2'); // layer2 wins
            expect(grid[0][4].char).toBe('3'); // layer3 wins
            expect(grid[0][5].char).toBe('3'); // layer3 wins
            expect(grid[0][6].char).toBe('4'); // layer4 wins
            expect(grid[0][7].char).toBe('4'); // layer4 wins

            free_node(root);
        });
    });
});


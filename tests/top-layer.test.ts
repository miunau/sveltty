/**
 * Tests for the top-layer system.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    clearTopLayer,
    addToTopLayer,
    addPopoverToTopLayer,
    addDropdownToTopLayer,
    getTopLayerElements,
    registerTopLayerOcclusion,
    clearGridArea,
    type TopLayerElement,
} from '../src/runtime/render/top-layer.js';
import { clearOcclusionZones, getOcclusionZones } from '../src/runtime/render/occlusion.js';
import type { CliNode } from '../src/runtime/types.js';
import type { GridCell, ClipRect } from '../src/runtime/render/types.js';
import { create_root, create_element, append, set_style, set_attribute, free_node } from '../src/runtime/operations.js';
import { computeLayout } from '../src/runtime/layout.js';
import { createRenderGrid } from '../src/runtime/render/pipeline/layout.js';
import { paintTree } from '../src/runtime/render/pipeline/paint.js';
import { setFocus, dispatchKey, resetFocusState } from '../src/runtime/focus.js';

describe('top-layer system', () => {
    beforeEach(() => {
        clearTopLayer();
        clearOcclusionZones();
    });

    const mockNode = { nodeType: 1 } as CliNode;

    describe('element management', () => {
        it('starts with no elements', () => {
            expect(getTopLayerElements()).toHaveLength(0);
        });

        it('can add elements', () => {
            addToTopLayer({
                type: 'popover',
                node: mockNode,
                x: 0,
                y: 0,
                width: 10,
                height: 10,
                zIndex: 100,
            });
            expect(getTopLayerElements()).toHaveLength(1);
        });

        it('clears elements', () => {
            addToTopLayer({
                type: 'popover',
                node: mockNode,
                x: 0,
                y: 0,
                width: 10,
                height: 10,
                zIndex: 100,
            });
            clearTopLayer();
            expect(getTopLayerElements()).toHaveLength(0);
        });
    });

    describe('z-index ordering', () => {
        it('returns elements sorted by z-index (lowest first)', () => {
            addToTopLayer({
                type: 'modal',
                node: mockNode,
                x: 0, y: 0, width: 10, height: 10,
                zIndex: 5000,
            });
            addToTopLayer({
                type: 'dropdown',
                node: mockNode,
                x: 0, y: 0, width: 10, height: 10,
                zIndex: 2000,
            });
            addToTopLayer({
                type: 'popover',
                node: mockNode,
                x: 0, y: 0, width: 10, height: 10,
                zIndex: 3000,
            });

            const elements = getTopLayerElements();
            expect(elements[0].type).toBe('dropdown');
            expect(elements[1].type).toBe('popover');
            expect(elements[2].type).toBe('modal');
        });
    });

    describe('addPopoverToTopLayer', () => {
        it('adds popover with correct base z-index', () => {
            addPopoverToTopLayer(mockNode, 10, 20, 100, 50, 0);
            const elements = getTopLayerElements();
            expect(elements).toHaveLength(1);
            expect(elements[0].type).toBe('popover');
            expect(elements[0].x).toBe(10);
            expect(elements[0].y).toBe(20);
            expect(elements[0].width).toBe(100);
            expect(elements[0].height).toBe(50);
            expect(elements[0].zIndex).toBe(3000); // BASE_Z_INDEX.popover + 0
        });

        it('increments z-index by stack index', () => {
            addPopoverToTopLayer(mockNode, 0, 0, 10, 10, 0);
            addPopoverToTopLayer(mockNode, 0, 0, 10, 10, 1);
            addPopoverToTopLayer(mockNode, 0, 0, 10, 10, 2);

            const elements = getTopLayerElements();
            expect(elements[0].zIndex).toBe(3000);
            expect(elements[1].zIndex).toBe(3001);
            expect(elements[2].zIndex).toBe(3002);
        });
    });

    describe('addDropdownToTopLayer', () => {
        it('adds dropdown with custom render function', () => {
            const customRender = () => {};
            addDropdownToTopLayer(
                mockNode,
                0, 0, 20, 5,
                { color: 'white' },
                'single',
                customRender
            );

            const elements = getTopLayerElements();
            expect(elements).toHaveLength(1);
            expect(elements[0].type).toBe('dropdown');
            expect(elements[0].render).toBe(customRender);
            expect(elements[0].data).toEqual({ style: { color: 'white' }, borderStyle: 'single' });
        });
    });

    describe('registerTopLayerOcclusion', () => {
        it('registers element bounds as occlusion zone', () => {
            const element: TopLayerElement = {
                type: 'popover',
                node: mockNode,
                x: 10,
                y: 20,
                width: 30,
                height: 40,
                zIndex: 100,
            };

            registerTopLayerOcclusion(element);

            const zones = getOcclusionZones();
            expect(zones).toHaveLength(1);
            expect(zones[0]).toEqual({
                x: 10,
                y: 20,
                width: 30,
                height: 40,
                zIndex: 100,
            });
        });
    });

    describe('clearGridArea', () => {
        it('clears cells within the area', () => {
            const grid: GridCell[][] = [
                [{ char: 'A', style: { color: 'red' } }, { char: 'B', style: { color: 'red' } }],
                [{ char: 'C', style: { color: 'red' } }, { char: 'D', style: { color: 'red' } }],
            ];
            const clip: ClipRect = { x1: 0, y1: 0, x2: 2, y2: 2 };

            clearGridArea(grid, 0, 0, 2, 2, clip);

            expect(grid[0][0]).toEqual({ char: ' ', style: undefined });
            expect(grid[0][1]).toEqual({ char: ' ', style: undefined });
            expect(grid[1][0]).toEqual({ char: ' ', style: undefined });
            expect(grid[1][1]).toEqual({ char: ' ', style: undefined });
        });

        it('respects clip boundaries', () => {
            const grid: GridCell[][] = [
                [{ char: 'A', style: undefined }, { char: 'B', style: undefined }],
                [{ char: 'C', style: undefined }, { char: 'D', style: undefined }],
            ];
            const clip: ClipRect = { x1: 0, y1: 0, x2: 1, y2: 1 };

            clearGridArea(grid, 0, 0, 2, 2, clip);

            expect(grid[0][0]).toEqual({ char: ' ', style: undefined });
            expect(grid[0][1]).toEqual({ char: 'B', style: undefined }); // Outside clip
            expect(grid[1][0]).toEqual({ char: 'C', style: undefined }); // Outside clip
            expect(grid[1][1]).toEqual({ char: 'D', style: undefined }); // Outside clip
        });
    });

    describe('select dropdown integration', () => {
        beforeEach(() => {
            resetFocusState();
        });

        it('renders dropdown overlay when select is opened with Enter', () => {
            const root = create_root();
            set_style(root, { width: 40, height: 20 });

            const select = create_element('select');
            set_style(select, { width: 15, height: 1 });
            append(root, select);

            // Add options
            for (const value of ['apple', 'banana', 'cherry']) {
                const opt = create_element('option');
                set_attribute(opt, 'value', value);
                opt.textContent = value;
                append(select, opt);
            }

            computeLayout(root, 40, 20);
            setFocus(select);

            // Open dropdown
            dispatchKey({ key: 'Enter', ctrl: false, shift: false, meta: false, escape: false });

            // Re-layout and paint
            computeLayout(root, 40, 20);
            const grid = createRenderGrid(40, 20);
            paintTree(root, grid);

            // Verify dropdown is added to top layer
            const topLayer = getTopLayerElements();
            expect(topLayer.length).toBe(1);
            expect(topLayer[0].type).toBe('dropdown');

            // Verify options are rendered in the grid
            // Row 2 should contain 'apple'
            let row2 = '';
            for (let col = 0; col < 20; col++) {
                row2 += grid[2][col].char;
            }
            expect(row2).toContain('apple');

            // Row 3 should contain 'banana'
            let row3 = '';
            for (let col = 0; col < 20; col++) {
                row3 += grid[3][col].char;
            }
            expect(row3).toContain('banana');

            // Row 4 should contain 'cherry'
            let row4 = '';
            for (let col = 0; col < 20; col++) {
                row4 += grid[4][col].char;
            }
            expect(row4).toContain('cherry');

            free_node(root);
        });

        it('closes dropdown when Escape is pressed', () => {
            const root = create_root();
            set_style(root, { width: 40, height: 20 });

            const select = create_element('select');
            set_style(select, { width: 15, height: 1 });
            append(root, select);

            const opt = create_element('option');
            set_attribute(opt, 'value', 'test');
            opt.textContent = 'test';
            append(select, opt);

            computeLayout(root, 40, 20);
            setFocus(select);

            // Open dropdown
            dispatchKey({ key: 'Enter', ctrl: false, shift: false, meta: false, escape: false });
            expect(select.__dropdownOpen).toBe(true);

            // Close dropdown with Escape
            dispatchKey({ key: 'Escape', ctrl: false, shift: false, meta: false, escape: true });
            expect(select.__dropdownOpen).toBe(false);

            // Paint and verify no dropdown
            computeLayout(root, 40, 20);
            const grid = createRenderGrid(40, 20);
            paintTree(root, grid);

            const topLayer = getTopLayerElements();
            expect(topLayer.length).toBe(0);

            free_node(root);
        });
    });

    describe('optgroup support', () => {
        it('renders optgroup headers in dropdown', () => {
            resetFocusState();
            clearTopLayer();
            clearOcclusionZones();

            const root = create_element('root');
            const select = create_element('select');
            set_style(select, { width: 20, height: 1 });
            append(root, select);

            // Create optgroup with options
            const group = create_element('optgroup');
            set_attribute(group, 'label', 'Fruits');
            append(select, group);

            const apple = create_element('option');
            set_attribute(apple, 'value', 'apple');
            apple.textContent = 'Apple';
            append(group, apple);

            const banana = create_element('option');
            set_attribute(banana, 'value', 'banana');
            banana.textContent = 'Banana';
            append(group, banana);

            computeLayout(root, 40, 20);
            setFocus(select);

            // Open dropdown
            dispatchKey({ key: 'Enter', ctrl: false, shift: false, meta: false, escape: false });
            expect(select.__dropdownOpen).toBe(true);

            // Paint and verify dropdown content
            computeLayout(root, 40, 20);
            const grid = createRenderGrid(40, 20);
            paintTree(root, grid);

            // Verify optgroup header is rendered (bold)
            // The dropdown should show "Fruits" as header and indented options
            const topLayer = getTopLayerElements();
            expect(topLayer.length).toBe(1);

            free_node(root);
        });

        it('skips optgroup headers during keyboard navigation', () => {
            resetFocusState();
            clearTopLayer();
            clearOcclusionZones();

            const root = create_element('root');
            const select = create_element('select');
            set_style(select, { width: 20, height: 1 });
            append(root, select);

            // Create optgroup with options
            const group = create_element('optgroup');
            set_attribute(group, 'label', 'Fruits');
            append(select, group);

            const apple = create_element('option');
            set_attribute(apple, 'value', 'apple');
            apple.textContent = 'Apple';
            append(group, apple);

            const banana = create_element('option');
            set_attribute(banana, 'value', 'banana');
            banana.textContent = 'Banana';
            append(group, banana);

            computeLayout(root, 40, 20);
            setFocus(select);

            // Initial selection should be first option (Apple)
            expect(select.selectedIndex).toBe(0);

            // Navigate down - should go to Banana (skip optgroup header)
            dispatchKey({ key: 'ArrowDown', ctrl: false, shift: false, meta: false, escape: false, downArrow: true });
            expect(select.selectedIndex).toBe(1);

            // Navigate up - should go back to Apple
            dispatchKey({ key: 'ArrowUp', ctrl: false, shift: false, meta: false, escape: false, upArrow: true });
            expect(select.selectedIndex).toBe(0);

            free_node(root);
        });

        it('disables all options in disabled optgroup', () => {
            resetFocusState();
            clearTopLayer();
            clearOcclusionZones();

            const root = create_element('root');
            const select = create_element('select');
            set_style(select, { width: 20, height: 1 });
            append(root, select);

            // Create enabled option first
            const first = create_element('option');
            set_attribute(first, 'value', 'first');
            first.textContent = 'First';
            append(select, first);

            // Create disabled optgroup
            const group = create_element('optgroup');
            set_attribute(group, 'label', 'Disabled Group');
            group.disabled = true;
            append(select, group);

            const disabled1 = create_element('option');
            set_attribute(disabled1, 'value', 'disabled1');
            disabled1.textContent = 'Disabled 1';
            append(group, disabled1);

            computeLayout(root, 40, 20);
            setFocus(select);

            // Initial selection is first option
            expect(select.selectedIndex).toBe(0);

            // Navigate down - should skip disabled options and wrap to first
            dispatchKey({ key: 'ArrowDown', ctrl: false, shift: false, meta: false, escape: false, downArrow: true });
            // Since all other options are disabled, should stay on first
            expect(select.selectedIndex).toBe(0);

            free_node(root);
        });

        it('supports type-ahead navigation when dropdown is open', () => {
            resetFocusState();
            clearTopLayer();
            clearOcclusionZones();

            const root = create_element('root');
            const select = create_element('select');
            set_style(select, { width: 20, height: 1 });
            append(root, select);

            const apple = create_element('option');
            set_attribute(apple, 'value', 'apple');
            apple.textContent = 'Apple';
            append(select, apple);

            const banana = create_element('option');
            set_attribute(banana, 'value', 'banana');
            banana.textContent = 'Banana';
            append(select, banana);

            const cherry = create_element('option');
            set_attribute(cherry, 'value', 'cherry');
            cherry.textContent = 'Cherry';
            append(select, cherry);

            const cranberry = create_element('option');
            set_attribute(cranberry, 'value', 'cranberry');
            cranberry.textContent = 'Cranberry';
            append(select, cranberry);

            computeLayout(root, 40, 20);
            setFocus(select);

            // Open dropdown
            dispatchKey({ key: 'Enter', ctrl: false, shift: false, meta: false, escape: false });
            expect(select.__dropdownOpen).toBe(true);

            // Type 'b' - should jump to Banana
            dispatchKey({ key: 'b', ctrl: false, shift: false, meta: false, escape: false });
            expect(select.selectedIndex).toBe(1);
            expect(select.__typeaheadBuffer).toBe('b');

            // Type 'c' - should now search for 'bc' which doesn't exist
            // So should stay on Banana since no match
            dispatchKey({ key: 'c', ctrl: false, shift: false, meta: false, escape: false });
            expect(select.__typeaheadBuffer).toBe('bc');

            free_node(root);
        });

        it('cycles through options with same prefix on repeated typing', () => {
            resetFocusState();
            clearTopLayer();
            clearOcclusionZones();

            const root = create_element('root');
            const select = create_element('select');
            set_style(select, { width: 20, height: 1 });
            append(root, select);

            const cherry = create_element('option');
            set_attribute(cherry, 'value', 'cherry');
            cherry.textContent = 'Cherry';
            append(select, cherry);

            const cranberry = create_element('option');
            set_attribute(cranberry, 'value', 'cranberry');
            cranberry.textContent = 'Cranberry';
            append(select, cranberry);

            const apple = create_element('option');
            set_attribute(apple, 'value', 'apple');
            apple.textContent = 'Apple';
            append(select, apple);

            computeLayout(root, 40, 20);
            setFocus(select);

            // Open dropdown - initially on Cherry (index 0)
            dispatchKey({ key: 'Enter', ctrl: false, shift: false, meta: false, escape: false });
            expect(select.selectedIndex).toBe(0);

            // Type 'c' - should cycle to Cranberry (next 'c' option after current)
            dispatchKey({ key: 'c', ctrl: false, shift: false, meta: false, escape: false });
            expect(select.selectedIndex).toBe(1); // Cranberry

            // Clear buffer and type 'c' again - should cycle back to Cherry
            select.__typeaheadBuffer = '';
            dispatchKey({ key: 'c', ctrl: false, shift: false, meta: false, escape: false });
            expect(select.selectedIndex).toBe(0); // Cherry (wraps around)

            free_node(root);
        });

        it('clears type-ahead buffer on arrow navigation', () => {
            resetFocusState();
            clearTopLayer();
            clearOcclusionZones();

            const root = create_element('root');
            const select = create_element('select');
            set_style(select, { width: 20, height: 1 });
            append(root, select);

            const apple = create_element('option');
            set_attribute(apple, 'value', 'apple');
            apple.textContent = 'Apple';
            append(select, apple);

            const banana = create_element('option');
            set_attribute(banana, 'value', 'banana');
            banana.textContent = 'Banana';
            append(select, banana);

            computeLayout(root, 40, 20);
            setFocus(select);

            // Open dropdown
            dispatchKey({ key: 'Enter', ctrl: false, shift: false, meta: false, escape: false });

            // Type 'b'
            dispatchKey({ key: 'b', ctrl: false, shift: false, meta: false, escape: false });
            expect(select.__typeaheadBuffer).toBe('b');

            // Arrow down should clear the buffer
            dispatchKey({ key: 'ArrowDown', ctrl: false, shift: false, meta: false, escape: false, downArrow: true });
            expect(select.__typeaheadBuffer).toBe('');

            free_node(root);
        });

        it('clears type-ahead buffer on dropdown close', () => {
            resetFocusState();
            clearTopLayer();
            clearOcclusionZones();

            const root = create_element('root');
            const select = create_element('select');
            set_style(select, { width: 20, height: 1 });
            append(root, select);

            const apple = create_element('option');
            set_attribute(apple, 'value', 'apple');
            apple.textContent = 'Apple';
            append(select, apple);

            computeLayout(root, 40, 20);
            setFocus(select);

            // Open dropdown
            dispatchKey({ key: 'Enter', ctrl: false, shift: false, meta: false, escape: false });

            // Type 'a'
            dispatchKey({ key: 'a', ctrl: false, shift: false, meta: false, escape: false });
            expect(select.__typeaheadBuffer).toBe('a');

            // Close with Escape
            dispatchKey({ key: 'Escape', ctrl: false, shift: false, meta: false, escape: true });
            expect(select.__typeaheadBuffer).toBe('');
            expect(select.__dropdownOpen).toBe(false);

            free_node(root);
        });

        it('type-ahead is case-insensitive', () => {
            resetFocusState();
            clearTopLayer();
            clearOcclusionZones();

            const root = create_element('root');
            const select = create_element('select');
            set_style(select, { width: 20, height: 1 });
            append(root, select);

            const apple = create_element('option');
            set_attribute(apple, 'value', 'apple');
            apple.textContent = 'Apple';
            append(select, apple);

            const banana = create_element('option');
            set_attribute(banana, 'value', 'banana');
            banana.textContent = 'Banana';
            append(select, banana);

            computeLayout(root, 40, 20);
            setFocus(select);

            // Open dropdown
            dispatchKey({ key: 'Enter', ctrl: false, shift: false, meta: false, escape: false });

            // Type 'B' (uppercase) - should still find Banana
            dispatchKey({ key: 'B', ctrl: false, shift: false, meta: false, escape: false });
            expect(select.selectedIndex).toBe(1);

            free_node(root);
        });

        it('type-ahead skips disabled options', () => {
            resetFocusState();
            clearTopLayer();
            clearOcclusionZones();

            const root = create_element('root');
            const select = create_element('select');
            set_style(select, { width: 20, height: 1 });
            append(root, select);

            const apple = create_element('option');
            set_attribute(apple, 'value', 'apple');
            apple.textContent = 'Apple';
            append(select, apple);

            const banana = create_element('option');
            set_attribute(banana, 'value', 'banana');
            banana.textContent = 'Banana';
            banana.disabled = true;
            append(select, banana);

            const berry = create_element('option');
            set_attribute(berry, 'value', 'berry');
            berry.textContent = 'Berry';
            append(select, berry);

            computeLayout(root, 40, 20);
            setFocus(select);

            // Open dropdown
            dispatchKey({ key: 'Enter', ctrl: false, shift: false, meta: false, escape: false });

            // Type 'b' - should skip disabled Banana and go to Berry
            dispatchKey({ key: 'b', ctrl: false, shift: false, meta: false, escape: false });
            expect(select.selectedIndex).toBe(2); // Berry, not Banana

            free_node(root);
        });
    });
});


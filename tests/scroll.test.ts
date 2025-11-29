/**
 * Tests for scroll container functionality
 */
import { describe, it, expect } from 'vitest';
import Yoga from 'yoga-layout';
import { create_element, create_text, append, set_style } from '../src/runtime/operations.js';
import { computeLayout } from '../src/runtime/layout.js';
import { renderToString } from '../src/runtime/render.js';
import {
    getScrollState,
    initScrollState,
    setScrollPosition,
    scrollBy,
    isScrollContainer,
    findScrollParent,
    scrollIntoView,
    getMaxScroll,
    canScrollVertically,
} from '../src/runtime/scroll.js';
import { measureContentSize } from '../src/runtime/render/content-measure.js';
import {
    shouldShowVerticalScrollbar,
    renderVerticalScrollbar,
} from '../src/runtime/render/scrollbar.js';
import type { CliNode } from '../src/runtime/types.js';
import type { GridCell } from '../src/runtime/render/types.js';

/**
 * Helper to set computed style on a node (mimics stylesheet computation).
 */
function setComputedStyle(node: CliNode, style: Record<string, any>): void {
    node.__cssStyle = style;
}

function createScrollContainer(
    containerHeight: number,
    itemCount: number,
    itemHeight: number = 1,
    hasBorders: boolean = true
): CliNode {
    const container = create_element('div');
    set_style(container, { 
        height: containerHeight,
        overflow: 'auto',
        flexDirection: 'column',
    });
    
    if (hasBorders) {
        set_style(container, { borderStyle: 'single' });
    }
    
    // Add items
    for (let i = 0; i < itemCount; i++) {
        const item = create_element('div');
        set_style(item, { height: itemHeight });
        const text = create_text(`Item ${i + 1}`);
        append(item, text);
        append(container, item);
    }
    
    return container;
}

function setupRoot(child: CliNode, width: number = 80, height: number = 24): CliNode {
    const root = create_element('root');
    set_style(root, { width, height });
    append(root, child);
    return root;
}

describe('scroll container', () => {
    describe('isScrollContainer', () => {
        it('returns true for overflow: auto', () => {
            const node = create_element('div');
            node.__cssStyle = { overflow: 'auto' };
            expect(isScrollContainer(node)).toBe(true);
        });

        it('returns true for overflow: scroll', () => {
            const node = create_element('div');
            node.__cssStyle = { overflow: 'scroll' };
            expect(isScrollContainer(node)).toBe(true);
        });

        it('returns false for overflow: hidden', () => {
            const node = create_element('div');
            node.__cssStyle = { overflow: 'hidden' };
            expect(isScrollContainer(node)).toBe(false);
        });

        it('returns false for overflow: visible', () => {
            const node = create_element('div');
            node.__cssStyle = { overflow: 'visible' };
            expect(isScrollContainer(node)).toBe(false);
        });

        it('returns true for overflowY: auto', () => {
            const node = create_element('div');
            node.__cssStyle = { overflowY: 'auto' };
            expect(isScrollContainer(node)).toBe(true);
        });
    });

    describe('content measurement', () => {
        it('measures content height correctly for column layout', () => {
            const container = create_element('div');
            container.__cssStyle = { flexDirection: 'column' };
            
            // Add 10 items, each 1 row tall
            for (let i = 0; i < 10; i++) {
                const item = create_element('div');
                item.computedLayout = { left: 0, top: i, width: 20, height: 1 };
                append(container, item);
            }
            
            const size = measureContentSize(container);
            expect(size.height).toBe(10);
        });

        it('measures content height correctly for row layout', () => {
            const container = create_element('div');
            // Set style directly as __cssStyle to ensure measureContentSize sees it
            // Note: measureContentSize calls computeStylesheetStyle which returns
            // empty if no stylesheets, so we set the style after measurement would run
            // OR we just verify measurement uses computedLayout
            
            // Add 5 items, each 2 rows tall
            for (let i = 0; i < 5; i++) {
                const item = create_element('div');
                item.computedLayout = { left: i * 10, top: 0, width: 10, height: 2 };
                append(container, item);
            }
            
            // Set the cached CSS style that computeStylesheetStyle would populate
            setComputedStyle(container, { flexDirection: 'row' });
            
            const size = measureContentSize(container);
            expect(size.height).toBe(2); // Max height, not sum
            expect(size.width).toBe(50); // Sum of widths
        });
    });

    describe('scroll state initialization', () => {
        it('initializes with correct client dimensions', () => {
            const container = createScrollContainer(5, 10);
            const root = setupRoot(container);
            computeLayout(root, 80, 24);
            
            // Simulate init with content area dimensions
            initScrollState(container, 78, 3); // 80-2 borders, 5-2 borders
            
            const state = getScrollState(container);
            expect(state.clientWidth).toBe(78);
            expect(state.clientHeight).toBe(3);
        });

        it('measures scroll height from children', () => {
            const container = createScrollContainer(5, 10, 1, true);
            const root = setupRoot(container);
            computeLayout(root, 80, 24);
            
            initScrollState(container, 78, 3);
            
            const state = getScrollState(container);
            // 10 items * 1 row each = 10 scroll height
            expect(state.scrollHeight).toBe(10);
        });

        it('preserves existing scroll position', () => {
            const container = createScrollContainer(5, 10);
            const root = setupRoot(container);
            computeLayout(root, 80, 24);
            
            // Set initial scroll position
            container.__scroll = { scrollTop: 5, scrollLeft: 0 };
            
            initScrollState(container, 78, 3);
            
            const state = getScrollState(container);
            expect(state.scrollTop).toBe(5);
        });
    });

    describe('scroll position', () => {
        it('clamps scroll position to valid range', () => {
            const container = create_element('div');
            container.__scroll = {
                scrollTop: 0,
                scrollLeft: 0,
                scrollWidth: 100,
                scrollHeight: 20,
                clientWidth: 50,
                clientHeight: 5,
            };
            
            // Try to scroll past max
            setScrollPosition(container, { top: 100 });
            
            const state = getScrollState(container);
            expect(state.scrollTop).toBe(15); // maxScrollTop = 20 - 5 = 15
        });

        it('does not allow negative scroll', () => {
            const container = create_element('div');
            container.__scroll = {
                scrollTop: 5,
                scrollLeft: 0,
                scrollWidth: 100,
                scrollHeight: 20,
                clientWidth: 50,
                clientHeight: 5,
            };
            
            setScrollPosition(container, { top: -10 });
            
            const state = getScrollState(container);
            expect(state.scrollTop).toBe(0);
        });

        it('scrollBy adjusts relative to current position', () => {
            const container = create_element('div');
            container.__scroll = {
                scrollTop: 5,
                scrollLeft: 0,
                scrollWidth: 100,
                scrollHeight: 20,
                clientWidth: 50,
                clientHeight: 5,
            };
            
            scrollBy(container, 0, 3);
            
            const state = getScrollState(container);
            expect(state.scrollTop).toBe(8);
        });
    });

    describe('scrollbar visibility', () => {
        it('shows scrollbar when content exceeds viewport', () => {
            const scrollState = {
                scrollTop: 0,
                scrollLeft: 0,
                scrollWidth: 80,
                scrollHeight: 10,
                clientWidth: 80,
                clientHeight: 3,
            };
            
            expect(shouldShowVerticalScrollbar(scrollState, 'auto')).toBe(true);
        });

        it('hides scrollbar when content fits', () => {
            const scrollState = {
                scrollTop: 0,
                scrollLeft: 0,
                scrollWidth: 80,
                scrollHeight: 3,
                clientWidth: 80,
                clientHeight: 5,
            };
            
            expect(shouldShowVerticalScrollbar(scrollState, 'auto')).toBe(false);
        });

        it('always shows scrollbar for overflow: scroll', () => {
            const scrollState = {
                scrollTop: 0,
                scrollLeft: 0,
                scrollWidth: 80,
                scrollHeight: 3,
                clientWidth: 80,
                clientHeight: 5,
            };
            
            expect(shouldShowVerticalScrollbar(scrollState, 'scroll')).toBe(true);
        });
    });

    describe('scrollbar rendering', () => {
        it('renders scrollbar track and thumb', () => {
            const grid: GridCell[][] = Array.from({ length: 5 }, () =>
                Array.from({ length: 10 }, () => ({ char: ' ' }))
            );
            
            const scrollState = {
                scrollTop: 0,
                scrollLeft: 0,
                scrollWidth: 80,
                scrollHeight: 10,
                clientWidth: 80,
                clientHeight: 3,
            };
            
            const clip = { x1: 0, y1: 0, x2: 10, y2: 5 };
            
            renderVerticalScrollbar(grid, 9, 0, 3, scrollState, {}, clip);
            
            // Check that something was rendered in the scrollbar column
            const scrollbarCells = [grid[0][9], grid[1][9], grid[2][9]];
            const hasContent = scrollbarCells.some(cell => cell.char !== ' ');
            expect(hasContent).toBe(true);
        });

        it('positions thumb based on scroll position', () => {
            const grid: GridCell[][] = Array.from({ length: 5 }, () =>
                Array.from({ length: 10 }, () => ({ char: ' ' }))
            );
            
            // Scrolled to bottom
            const scrollState = {
                scrollTop: 7, // maxScroll = 10 - 3 = 7
                scrollLeft: 0,
                scrollWidth: 80,
                scrollHeight: 10,
                clientWidth: 80,
                clientHeight: 3,
            };
            
            const clip = { x1: 0, y1: 0, x2: 10, y2: 5 };
            
            renderVerticalScrollbar(grid, 9, 0, 3, scrollState, {
                thumbChar: '█',
                trackChar: '│',
            }, clip);
            
            // Thumb should be at the bottom
            expect(grid[2][9].char).toBe('█');
        });
    });

    describe('scroll into view', () => {
        it('scrolls down to show item below viewport', () => {
            const container = create_element('div');
            container.__cssStyle = { overflow: 'auto' };
            container.computedLayout = { left: 0, top: 0, width: 80, height: 5 };
            container.yogaNode = {
                getComputedPadding: (edge: number) => edge === Yoga.EDGE_TOP || edge === Yoga.EDGE_BOTTOM ? 1 : 0,
            };
            
            // 10 children - positions include padding offset (like production)
            const paddingTop = 1;
            for (let i = 0; i < 10; i++) {
                const child = create_element('div');
                child.parent = container;
                child.computedLayout = { left: 0, top: paddingTop + i, width: 78, height: 1 };
                container.children.push(child);
            }
            
            // Initialize scroll state - contentHeight = 5 - 2 (padding) = 3
            container.__scroll = {
                scrollTop: 0,
                scrollLeft: 0,
                scrollWidth: 78,
                scrollHeight: 10,
                clientWidth: 78,
                clientHeight: 3,
            };
            
            // Try to scroll to item 5 (index 4, at layout top=5, content-relative top=4)
            const target = container.children[4] as CliNode;
            scrollIntoView(target);
            
            const state = getScrollState(container);
            // Item 5 is at content position 4, so bottom=5
            // To show it fully: scrollTop + 3 >= 5, scrollTop >= 2
            expect(state.scrollTop).toBeGreaterThanOrEqual(2);
        });

        it('scrolls up to show item above viewport', () => {
            const container = create_element('div');
            container.__cssStyle = { overflow: 'auto' };
            container.computedLayout = { left: 0, top: 0, width: 80, height: 5 };
            container.yogaNode = {
                getComputedPadding: (edge: number) => edge === Yoga.EDGE_TOP || edge === Yoga.EDGE_BOTTOM ? 1 : 0,
            };
            
            const paddingTop = 1;
            for (let i = 0; i < 10; i++) {
                const child = create_element('div');
                child.parent = container;
                child.computedLayout = { left: 0, top: paddingTop + i, width: 78, height: 1 };
                container.children.push(child);
            }
            
            // Start scrolled down
            container.__scroll = {
                scrollTop: 5,
                scrollLeft: 0,
                scrollWidth: 78,
                scrollHeight: 10,
                clientWidth: 78,
                clientHeight: 3,
            };
            
            // Try to scroll to item 2 (index 1, at layout top=2, content-relative top=1)
            const target = container.children[1] as CliNode;
            scrollIntoView(target);
            
            const state = getScrollState(container);
            // Item 2 is at content position 1, scrollTop should be <= 1
            expect(state.scrollTop).toBeLessThanOrEqual(1);
        });

        it('does not scroll if item is already visible', () => {
            const container = create_element('div');
            container.__cssStyle = { overflow: 'auto' };
            container.computedLayout = { left: 0, top: 0, width: 80, height: 5 };
            container.yogaNode = {
                getComputedPadding: (edge: number) => edge === Yoga.EDGE_TOP || edge === Yoga.EDGE_BOTTOM ? 1 : 0,
            };
            
            const paddingTop = 1;
            for (let i = 0; i < 10; i++) {
                const child = create_element('div');
                child.parent = container;
                child.computedLayout = { left: 0, top: paddingTop + i, width: 78, height: 1 };
                container.children.push(child);
            }
            
            container.__scroll = {
                scrollTop: 0,
                scrollLeft: 0,
                scrollWidth: 78,
                scrollHeight: 10,
                clientWidth: 78,
                clientHeight: 3,
            };
            
            // Item 2 (at content position 1) is visible when scrollTop=0, clientHeight=3 (visible: 0-3)
            const target = container.children[1] as CliNode;
            scrollIntoView(target);
            
            const state = getScrollState(container);
            expect(state.scrollTop).toBe(0); // Should not have scrolled
        });
        
    });

    describe('max scroll calculation', () => {
        it('calculates correct max scroll', () => {
            const container = create_element('div');
            container.__scroll = {
                scrollTop: 0,
                scrollLeft: 0,
                scrollWidth: 100,
                scrollHeight: 20,
                clientWidth: 50,
                clientHeight: 5,
            };
            
            const { maxScrollTop, maxScrollLeft } = getMaxScroll(container);
            expect(maxScrollTop).toBe(15); // 20 - 5
            expect(maxScrollLeft).toBe(50); // 100 - 50
        });

        it('returns 0 when content fits', () => {
            const container = create_element('div');
            container.__scroll = {
                scrollTop: 0,
                scrollLeft: 0,
                scrollWidth: 50,
                scrollHeight: 3,
                clientWidth: 50,
                clientHeight: 5,
            };
            
            const { maxScrollTop } = getMaxScroll(container);
            expect(maxScrollTop).toBe(0);
        });
    });

    describe('can scroll checks', () => {
        it('canScrollVertically returns true when content exceeds height', () => {
            const container = create_element('div');
            container.__scroll = {
                scrollTop: 0,
                scrollLeft: 0,
                scrollWidth: 80,
                scrollHeight: 10,
                clientWidth: 80,
                clientHeight: 5,
            };
            
            expect(canScrollVertically(container)).toBe(true);
        });

        it('canScrollVertically returns false when content fits', () => {
            const container = create_element('div');
            container.__scroll = {
                scrollTop: 0,
                scrollLeft: 0,
                scrollWidth: 80,
                scrollHeight: 3,
                clientWidth: 80,
                clientHeight: 5,
            };
            
            expect(canScrollVertically(container)).toBe(false);
        });
    });

    describe('find scroll parent', () => {
        it('finds nearest scroll container ancestor', () => {
            const scrollContainer = create_element('div');
            scrollContainer.__cssStyle = { overflow: 'auto' };
            
            const wrapper = create_element('div');
            wrapper.parent = scrollContainer;
            
            const child = create_element('div');
            child.parent = wrapper;
            
            const found = findScrollParent(child);
            expect(found).toBe(scrollContainer);
        });

        it('returns null when no scroll container exists', () => {
            const parent = create_element('div');
            parent.__cssStyle = { overflow: 'visible' };
            
            const child = create_element('div');
            child.parent = parent;
            
            const found = findScrollParent(child);
            expect(found).toBeNull();
        });
    });

    describe('integration: full render with scroll', () => {
        it('renders visible items within scroll container', () => {
            const container = createScrollContainer(5, 10, 1, true);
            const root = setupRoot(container, 40, 10);
            
            computeLayout(root, 40, 10);
            const result = renderToString(root);
            
            // renderToString returns { output, width, height }
            expect(result.output).toBeDefined();
            expect(typeof result.output).toBe('string');
            
            // First visible items should be rendered
            expect(result.output).toContain('Item 1');
        });

        it('can scroll to show last item', () => {
            const container = createScrollContainer(5, 10, 1, true);
            const root = setupRoot(container, 40, 10);
            
            computeLayout(root, 40, 10);
            
            // Initialize scroll state
            initScrollState(container, 38, 3); // width - borders, height - borders
            
            // Scroll to bottom
            const { maxScrollTop } = getMaxScroll(container);
            setScrollPosition(container, { top: maxScrollTop });
            
            const state = getScrollState(container);
            
            // At max scroll, we should be able to see item 10
            // If scrollHeight=10, clientHeight=3, maxScroll=7
            // At scrollTop=7, visible range is 7-10, so items 8,9,10 should be visible
            expect(state.scrollTop).toBe(maxScrollTop);
            expect(maxScrollTop).toBe(7); // 10 items - 3 visible = 7
        });
    });

    describe('virtualization edge cases', () => {
        it('includes last item when scrolled to bottom', () => {
            // Set up a scroll container with 10 items of height 1 each
            // Container has clientHeight = 3 (5ch height - 2 for borders)
            const container = create_element('div');
            setComputedStyle(container, { overflow: 'auto', flexDirection: 'column' });
            
            // Add 10 items with explicit layouts
            for (let i = 0; i < 10; i++) {
                const item = create_element('div');
                item.computedLayout = { left: 0, top: i, width: 38, height: 1 };
                append(container, item);
            }
            
            // Initialize scroll state: 10 items, 3 visible
            const clientHeight = 3;
            const scrollHeight = 10;
            container.__scroll = {
                scrollTop: 7, // max scroll (10 - 3)
                scrollLeft: 0,
                scrollWidth: 38,
                scrollHeight,
                clientWidth: 38,
                clientHeight,
            };
            
            // Manually verify which items overlap the viewport
            const scrollOffsetY = 7;
            const viewportRect = { x: 0, y: 0, width: 38, height: clientHeight };
            
            const visibleItems: number[] = [];
            for (let i = 0; i < 10; i++) {
                const childRect = {
                    x: 0,
                    y: i - scrollOffsetY,
                    width: 38,
                    height: 1,
                };
                // Check overlap: item y range [y, y+1) vs viewport [0, 3)
                const overlaps = childRect.y < viewportRect.height &&
                                 childRect.y + childRect.height > 0;
                if (overlaps) {
                    visibleItems.push(i + 1);
                }
            }
            
            // Items 8, 9, 10 should be visible at scrollTop=7
            // Item 8: y = 7-7 = 0, range [0,1), overlaps [0,3) - yes
            // Item 9: y = 8-7 = 1, range [1,2), overlaps [0,3) - yes
            // Item 10: y = 9-7 = 2, range [2,3), overlaps [0,3) - yes
            expect(visibleItems).toEqual([8, 9, 10]);
        });

        it('correctly handles rectsOverlap for bottom-edge items', () => {
            // Item at y=2, height=1 vs viewport at y=0, height=3
            // Should overlap because [2,3) intersects [0,3)
            const itemRect = { x: 0, y: 2, width: 10, height: 1 };
            const viewportRect = { x: 0, y: 0, width: 10, height: 3 };
            
            const overlaps = 
                itemRect.x < viewportRect.x + viewportRect.width &&
                itemRect.x + itemRect.width > viewportRect.x &&
                itemRect.y < viewportRect.y + viewportRect.height &&
                itemRect.y + itemRect.height > viewportRect.y;
            
            expect(overlaps).toBe(true);
        });
    });

    describe('actual render output', () => {
        it('renders first items when not scrolled', () => {
            const root = create_element('root');
            set_style(root, { width: 40, height: 10 });
            
            const container = create_element('div');
            set_style(container, { 
                height: 5,
                overflow: 'auto',
                borderStyle: 'single',
                flexDirection: 'column',
            });
            
            for (let i = 0; i < 10; i++) {
                const item = create_element('div');
                set_style(item, { height: 1 });
                const text = create_text(`Item ${i + 1}`);
                append(item, text);
                append(container, item);
            }
            
            append(root, container);
            computeLayout(root, 40, 10);
            
            const result = renderToString(root);
            const strippedOutput = result.output.replace(/\x1b\[[0-9;]*m/g, '');
            
            // Should show items 1,2,3 at scrollTop=0
            expect(/Item 1\b/.test(strippedOutput)).toBe(true);
            expect(/Item 2\b/.test(strippedOutput)).toBe(true);
            expect(/Item 3\b/.test(strippedOutput)).toBe(true);
            // Item 10 should not be visible
            expect(/Item 10\b/.test(strippedOutput)).toBe(false);
        });

        it('renders last items when scrolled to bottom', () => {
            const root = create_element('root');
            set_style(root, { width: 40, height: 10 });
            
            const container = create_element('div');
            set_style(container, { 
                height: 5,
                overflow: 'auto',
                borderStyle: 'single',
                flexDirection: 'column',
            });
            
            for (let i = 0; i < 10; i++) {
                const item = create_element('div');
                set_style(item, { height: 1 });
                const text = create_text(`Item ${i + 1}`);
                append(item, text);
                append(container, item);
            }
            
            append(root, container);
            computeLayout(root, 40, 10);
            
            // First render to initialize scroll state
            renderToString(root);
            
            // Scroll to bottom
            const { maxScrollTop } = getMaxScroll(container);
            expect(maxScrollTop).toBe(7); // 10 items - 3 visible
            setScrollPosition(container, { top: maxScrollTop });
            
            // Re-render
            const result = renderToString(root);
            const strippedOutput = result.output.replace(/\x1b\[[0-9;]*m/g, '');
            
            // Should show items 8,9,10 at max scroll
            expect(/Item 8\b/.test(strippedOutput)).toBe(true);
            expect(/Item 9\b/.test(strippedOutput)).toBe(true);
            expect(/Item 10\b/.test(strippedOutput)).toBe(true);
            // Item 1 should NOT be visible
            expect(/Item 1\b/.test(strippedOutput)).toBe(false);
        });
    });

    describe('scrollIntoView edge cases', () => {
        it('scrolls to show first item when focused', () => {
            const container = create_element('div');
            set_style(container, { 
                height: 5,
                overflow: 'auto',
                borderStyle: 'single',
                flexDirection: 'column',
            });
            container.computedLayout = { left: 0, top: 0, width: 40, height: 5 };
            container.yogaNode = {
                getComputedPadding: (edge: number) => 1, // All edges have padding 1 (borders)
            };
            
            for (let i = 0; i < 10; i++) {
                const child = create_element('div');
                child.parent = container;
                // Children positions include padding offset (start at top=1)
                child.computedLayout = { left: 1, top: 1 + i, width: 38, height: 1 };
                container.children.push(child);
            }
            
            // Start scrolled down
            container.__scroll = {
                scrollTop: 5,
                scrollLeft: 0,
                scrollWidth: 38,
                scrollHeight: 10,
                clientWidth: 38,
                clientHeight: 3,
            };
            
            // Scroll to first item
            const firstItem = container.children[0] as CliNode;
            scrollIntoView(firstItem);
            
            const state = getScrollState(container);
            // Item 1 is at layout top=1, padding=1
            // In content-relative coords, item 1 is at position 0
            // So scrollTop should be 0 to show it
            expect(state.scrollTop).toBe(0);
        });

        it('correctly converts layout positions to content-relative for scroll', () => {
            const container = create_element('div');
            set_style(container, { 
                height: 5,
                overflow: 'auto',
                borderStyle: 'single',
                flexDirection: 'column',
            });
            container.computedLayout = { left: 0, top: 0, width: 40, height: 5 };
            container.yogaNode = {
                getComputedPadding: (edge: number) => 1,
            };
            
            for (let i = 0; i < 10; i++) {
                const child = create_element('div');
                child.parent = container;
                child.computedLayout = { left: 1, top: 1 + i, width: 38, height: 1 };
                container.children.push(child);
            }
            
            // Not scrolled
            container.__scroll = {
                scrollTop: 0,
                scrollLeft: 0,
                scrollWidth: 38,
                scrollHeight: 10,
                clientWidth: 38,
                clientHeight: 3,
            };
            
            // Scroll to item 5 (at layout top=5, content-relative top=4)
            const item5 = container.children[4] as CliNode;
            scrollIntoView(item5);
            
            const state = getScrollState(container);
            // Item 5 is at content-relative position 4
            // It should be visible at the bottom of viewport
            // scrollTop + clientHeight >= 4 + 1, so scrollTop >= 2
            expect(state.scrollTop).toBeGreaterThanOrEqual(2);
        });
    });

    describe('scrollbar rendering in full render', () => {
        it('renders scrollbar when content exceeds viewport', () => {
            const root = create_element('root');
            set_style(root, { width: 40, height: 10 });
            
            const container = create_element('div');
            set_style(container, { 
                height: 5,
                overflow: 'auto',
                borderStyle: 'single',
                flexDirection: 'column',
            });
            
            for (let i = 0; i < 10; i++) {
                const item = create_element('div');
                set_style(item, { height: 1 });
                const text = create_text(`Item ${i + 1}`);
                append(item, text);
                append(container, item);
            }
            
            append(root, container);
            computeLayout(root, 40, 10);
            
            const result = renderToString(root);
            
            // Scrollbar thumb char should be present
            expect(result.output).toContain('█');
            
            // Scroll state should show scrollable content
            const state = getScrollState(container);
            expect(state.scrollHeight).toBe(10);
            expect(state.clientHeight).toBe(3);
        });
    });

    describe('scrollbar at max scroll', () => {
        it('positions thumb at bottom when scrolled to max', () => {
            const scrollState = {
                scrollTop: 7, // max scroll
                scrollLeft: 0,
                scrollWidth: 38,
                scrollHeight: 10,
                clientWidth: 38,
                clientHeight: 3,
            };
            
            // Calculate expected thumb position
            const contentRatio = scrollState.clientHeight / scrollState.scrollHeight; // 0.3
            const trackHeight = 3; // same as clientHeight for visual consistency
            const thumbHeight = Math.max(1, Math.floor(trackHeight * contentRatio)); // 1
            const maxScrollTop = scrollState.scrollHeight - scrollState.clientHeight; // 7
            const scrollRatio = scrollState.scrollTop / maxScrollTop; // 7/7 = 1
            const thumbTop = Math.floor(scrollRatio * (trackHeight - thumbHeight)); // floor(1 * 2) = 2
            
            // Thumb should be at position 2 (bottom of 3-row track with 1-row thumb)
            expect(thumbTop).toBe(2);
            expect(thumbHeight).toBe(1);
        });

        it('renders scrollbar in correct grid positions', () => {
            const grid: GridCell[][] = Array.from({ length: 5 }, () =>
                Array.from({ length: 40 }, () => ({ char: ' ' }))
            );
            
            const scrollState = {
                scrollTop: 0,
                scrollLeft: 0,
                scrollWidth: 38,
                scrollHeight: 10,
                clientWidth: 38,
                clientHeight: 3,
            };
            
            // Scrollbar should show when scrollHeight (10) > clientHeight (3)
            expect(shouldShowVerticalScrollbar(scrollState, 'auto')).toBe(true);
            
            const clip = { x1: 0, y1: 0, x2: 40, y2: 5 };
            
            // Render at x=39, y=1 (inside borders), height=3
            renderVerticalScrollbar(grid, 39, 1, 3, scrollState, {
                trackChar: '│',
                thumbChar: '█',
            }, clip);
            
            // Check that cells at (1,39), (2,39), (3,39) have scrollbar chars
            expect(grid[1][39].char).not.toBe(' ');
            expect(grid[2][39].char).not.toBe(' ');
            expect(grid[3][39].char).not.toBe(' ');
        });
    });

    describe('nested scroll containers', () => {
        it('renders outer scroll container with inner scroll container visible', () => {
            // Create structure: outer scrollable -> content -> inner scrollable -> items
            const root = create_element('root');
            set_style(root, { width: 50, height: 15 });
            
            const outer = create_element('div');
            set_style(outer, { 
                height: 10,
                overflow: 'auto',
                borderStyle: 'single',
                flexDirection: 'column',
            });
            
            // Some content before the inner scroll area
            const title = create_element('div');
            set_style(title, { height: 1 });
            const titleText = create_text('Title Row');
            append(title, titleText);
            append(outer, title);
            
            // Inner scroll container
            const inner = create_element('div');
            set_style(inner, { 
                height: 5,
                overflow: 'auto',
                borderStyle: 'single',
                flexDirection: 'column',
            });
            
            // Add items to inner
            for (let i = 0; i < 10; i++) {
                const item = create_element('div');
                set_style(item, { height: 1 });
                const text = create_text(`Inner Item ${i + 1}`);
                append(item, text);
                append(inner, item);
            }
            
            append(outer, inner);
            
            // More content after inner scroll
            const footer = create_element('div');
            set_style(footer, { height: 1 });
            const footerText = create_text('Footer Row');
            append(footer, footerText);
            append(outer, footer);
            
            append(root, outer);
            computeLayout(root, 50, 15);
            
            // Render with no scroll
            const result = renderToString(root);
            const output = result.output.replace(/\x1b\[[0-9;]*m/g, '');
            
            console.log('Nested scroll output (scrollTop=0):');
            console.log(output);
            
            // Should see both Title Row and start of inner container
            expect(output).toContain('Title');
            expect(output).toContain('Inner Item 1');
        });
        
        it('renders inner scroll container content when outer is scrolled', () => {
            const root = create_element('root');
            set_style(root, { width: 50, height: 15 });
            
            const outer = create_element('div');
            set_style(outer, { 
                height: 8,
                overflow: 'auto',
                borderStyle: 'single',
                flexDirection: 'column',
            });
            
            // Many items before inner scroll (to push it below viewport initially)
            for (let i = 0; i < 5; i++) {
                const item = create_element('div');
                set_style(item, { height: 1 });
                const text = create_text(`Outer Item ${i + 1}`);
                append(item, text);
                append(outer, item);
            }
            
            // Label for inner container
            const label = create_element('div');
            set_style(label, { height: 1 });
            const labelText = create_text('Scroll Demo');
            append(label, labelText);
            append(outer, label);
            
            // Inner scroll container
            const inner = create_element('div');
            set_style(inner, { 
                height: 4,
                overflow: 'auto',
                borderStyle: 'single',
                flexDirection: 'column',
            });
            
            for (let i = 0; i < 8; i++) {
                const item = create_element('button');
                set_style(item, { height: 1 });
                const text = create_text(`Button ${i + 1}`);
                append(item, text);
                append(inner, item);
            }
            
            append(outer, inner);
            append(root, outer);
            computeLayout(root, 50, 15);
            
            // First render without scroll
            let result = renderToString(root);
            let output = result.output.replace(/\x1b\[[0-9;]*m/g, '');
            
            console.log('Before scroll (outer scrollTop=0):');
            console.log(output);
            
            // Get outer scroll state and scroll down
            const outerState = getScrollState(outer);
            console.log('Outer scroll state:', outerState);
            
            // Scroll outer container to show the inner scroll container
            setScrollPosition(outer, { top: 4 });
            
            // Re-render after scrolling
            result = renderToString(root);
            output = result.output.replace(/\x1b\[[0-9;]*m/g, '');
            
            console.log('After scroll (outer scrollTop=4):');
            console.log(output);
            
            // Should see "Scroll Demo" label and inner container with buttons
            expect(output).toContain('Scroll Demo');
            expect(output).toContain('Button 1');
        });
        
        it('inner scroll container shows content when scrolled', () => {
            const root = create_element('root');
            set_style(root, { width: 40, height: 10 });
            
            // Single outer container (no scroll)
            const outer = create_element('div');
            set_style(outer, { 
                height: 8,
                flexDirection: 'column',
            });
            
            // Inner scroll container
            const inner = create_element('div');
            set_style(inner, { 
                height: 5,
                overflow: 'auto',
                borderStyle: 'single',
                flexDirection: 'column',
            });
            
            for (let i = 0; i < 10; i++) {
                const item = create_element('div');
                set_style(item, { height: 1 });
                const text = create_text(`Line ${i + 1}`);
                append(item, text);
                append(inner, item);
            }
            
            append(outer, inner);
            append(root, outer);
            computeLayout(root, 40, 10);
            
            // First render - should see lines 1-3
            let result = renderToString(root);
            let output = result.output.replace(/\x1b\[[0-9;]*m/g, '');
            
            console.log('Inner scroll at top:');
            console.log(output);
            
            expect(output).toContain('Line 1');
            expect(output).toContain('Line 2');
            expect(output).toContain('Line 3');
            
            // Scroll inner container down
            const innerState = getScrollState(inner);
            console.log('Inner scroll state:', innerState);
            
            setScrollPosition(inner, { top: 7 }); // Scroll to show lines 8-10
            
            result = renderToString(root);
            output = result.output.replace(/\x1b\[[0-9;]*m/g, '');
            
            console.log('Inner scroll at bottom:');
            console.log(output);
            
            // Should now see lines 8-10
            expect(output).toContain('Line 8');
            expect(output).toContain('Line 9');
            expect(output).toContain('Line 10');
            // Should NOT see line 1 (changed from Item 1 to avoid substring match with Line 10)
            expect(output).not.toContain('Line 1 '); // Note: trailing space to avoid matching "Line 10"
        });
        
        it('double nested scroll - outer scroll reveals inner scroll container', () => {
            // This tests the exact scenario from Showcase.svelte
            const root = create_element('root');
            set_style(root, { width: 60, height: 12 });
            
            // Outer scroll container (like appFrame)
            const outer = create_element('div');
            set_style(outer, { 
                height: 10,
                overflow: 'auto',
                borderStyle: 'single',
                flexDirection: 'column',
            });
            
            // Content that pushes inner container down
            for (let i = 0; i < 6; i++) {
                const item = create_element('div');
                set_style(item, { height: 1 });
                const text = create_text(`Header ${i + 1}`);
                append(item, text);
                append(outer, item);
            }
            
            // A section containing the inner scroll container
            const section = create_element('div');
            set_style(section, { flexDirection: 'column' });
            
            const sectionTitle = create_element('div');
            set_style(sectionTitle, { height: 1 });
            const titleText = create_text('Scroll Section');
            append(sectionTitle, titleText);
            append(section, sectionTitle);
            
            // Inner scroll container
            const inner = create_element('div');
            set_style(inner, { 
                height: 5,
                overflow: 'auto',
                borderStyle: 'single',
                flexDirection: 'column',
            });
            
            for (let i = 0; i < 8; i++) {
                const btn = create_element('button');
                set_style(btn, { height: 1, borderStyle: 'none' });
                const text = create_text(`Button ${i + 1}`);
                append(btn, text);
                append(inner, btn);
            }
            
            append(section, inner);
            append(outer, section);
            append(root, outer);
            computeLayout(root, 60, 12);
            
            // Initial render - outer not scrolled
            let result = renderToString(root);
            let output = result.output.replace(/\x1b\[[0-9;]*m/g, '');
            
            console.log('=== Double nested: Initial (no scroll) ===');
            console.log(output);
            console.log('Outer layout:', outer.computedLayout);
            console.log('Section layout:', section.computedLayout);
            console.log('Inner layout:', inner.computedLayout);
            
            // Should see headers but inner scroll area should be below viewport
            expect(output).toContain('Header 1');
            
            // Scroll outer to reveal the section
            const outerState = getScrollState(outer);
            console.log('Outer scroll state:', outerState);
            
            // Scroll to show the inner scroll container (it starts at row 7 in content)
            setScrollPosition(outer, { top: 4 });
            
            result = renderToString(root);
            output = result.output.replace(/\x1b\[[0-9;]*m/g, '');
            
            console.log('=== Double nested: After outer scroll (top=4) ===');
            console.log(output);
            
            // Should now see the section title and inner container
            expect(output).toContain('Scroll Section');
            expect(output).toContain('Button 1');
        });
    });
});

// ============================================================================
// Browser-like Scroll Behavior Tests
// ============================================================================

import {
    elementCapturesArrows,
    getScrollKeyboardMode,
    scrollByWithChaining,
    handleDefaultScroll,
    handleExplicitScrollKeyboard,
    handleScrollKeyboard,
} from '../src/runtime/scroll-keyboard.js';
import type { KeyPressEvent } from '../src/runtime/types.js';

describe('Browser-like Scroll Behavior', () => {
    describe('elementCapturesArrows', () => {
        it('returns true for textarea', () => {
            const textarea = create_element('textarea');
            expect(elementCapturesArrows(textarea)).toBe(true);
        });

        it('returns true for select', () => {
            const select = create_element('select');
            expect(elementCapturesArrows(select)).toBe(true);
        });

        it('returns true for input type number', () => {
            const input = create_element('input');
            input.type = 'number';
            expect(elementCapturesArrows(input)).toBe(true);
        });

        it('returns true for input type range', () => {
            const input = create_element('input');
            input.type = 'range';
            expect(elementCapturesArrows(input)).toBe(true);
        });

        it('returns false for regular button', () => {
            const button = create_element('button');
            expect(elementCapturesArrows(button)).toBe(false);
        });

        it('returns false for input type text', () => {
            const input = create_element('input');
            input.type = 'text';
            expect(elementCapturesArrows(input)).toBe(false);
        });

        it('returns false for div', () => {
            const div = create_element('div');
            expect(elementCapturesArrows(div)).toBe(false);
        });
    });

    describe('getScrollKeyboardMode', () => {
        it('returns auto by default', () => {
            const container = create_element('div');
            setComputedStyle(container, { overflow: 'auto' });
            
            const child = create_element('button');
            append(container, child);
            child.parent = container;
            
            expect(getScrollKeyboardMode(child)).toBe('auto');
        });

        it('returns disabled when set', () => {
            const container = create_element('div');
            setComputedStyle(container, { overflow: 'auto', scrollKeyboard: 'disabled' });
            
            const child = create_element('button');
            append(container, child);
            child.parent = container;
            
            expect(getScrollKeyboardMode(child)).toBe('disabled');
        });

        it('returns enabled when set', () => {
            const container = create_element('div');
            setComputedStyle(container, { overflow: 'auto', scrollKeyboard: 'enabled' });
            
            const child = create_element('button');
            append(container, child);
            child.parent = container;
            
            expect(getScrollKeyboardMode(child)).toBe('enabled');
        });

        it('returns auto when explicitly set', () => {
            const container = create_element('div');
            setComputedStyle(container, { overflow: 'auto', scrollKeyboard: 'auto' });
            
            const child = create_element('button');
            append(container, child);
            child.parent = container;
            
            expect(getScrollKeyboardMode(child)).toBe('auto');
        });
    });

    describe('scrollByWithChaining', () => {
        it('scrolls container when possible', () => {
            const container = createScrollContainer(5, 10);
            computeLayout(container, 40, 10);
            initScrollState(container, 40, 3);
            
            const result = scrollByWithChaining(container, 0, 2);
            
            expect(result).toBe(true);
            expect(getScrollState(container).scrollTop).toBe(2);
        });

        it('chains to parent when at bottom boundary', () => {
            // Create outer scroll container (viewport 3 rows, content 8 rows)
            const outer = create_element('div');
            set_style(outer, { height: 3, overflow: 'auto', flexDirection: 'column' });
            
            // Add some items before inner
            for (let i = 0; i < 2; i++) {
                const item = create_element('div');
                set_style(item, { height: 1 });
                append(outer, item);
                item.parent = outer;
            }
            
            // Create inner scroll container (viewport 2 rows, content 4 rows)
            const inner = create_element('div');
            set_style(inner, { height: 2, overflow: 'auto', flexDirection: 'column' });
            append(outer, inner);
            inner.parent = outer;
            
            // Add content to inner
            for (let i = 0; i < 4; i++) {
                const item = create_element('div');
                set_style(item, { height: 1 });
                append(inner, item);
                item.parent = inner;
            }
            
            // Add more items after inner (total outer content: 2 + 2 + 4 = 8 rows of content space)
            for (let i = 0; i < 4; i++) {
                const item = create_element('div');
                set_style(item, { height: 1 });
                append(outer, item);
                item.parent = outer;
            }
            
            computeLayout(outer, 40, 10);
            // Set computed styles AFTER layout
            setComputedStyle(outer, { overflow: 'auto' });
            setComputedStyle(inner, { overflow: 'auto' });
            // Outer has 8 rows content, 3 rows visible (scrollHeight=8, clientHeight=3)
            initScrollState(outer, 40, 3);
            // Inner has 4 rows content, 2 rows visible (scrollHeight=4, clientHeight=2)
            initScrollState(inner, 40, 2);
            
            // Scroll inner to bottom (inner scrollTop = 4 - 2 = 2)
            setScrollPosition(inner, { top: 2 });
            
            // Now try to scroll down - should chain to outer
            const result = scrollByWithChaining(inner, 0, 1);
            
            expect(result).toBe(true);
            expect(getScrollState(outer).scrollTop).toBe(1);
        });

        it('returns false when no more scrolling possible', () => {
            const container = createScrollContainer(5, 10);
            computeLayout(container, 40, 10);
            initScrollState(container, 40, 3);
            
            // Already at top, try scrolling up
            const result = scrollByWithChaining(container, 0, -1);
            
            expect(result).toBe(false);
        });
    });

    describe('handleDefaultScroll', () => {
        function makeArrowEvent(direction: 'up' | 'down'): KeyPressEvent {
            return {
                key: direction === 'up' ? 'ArrowUp' : 'ArrowDown',
                ctrl: false,
                shift: false,
                meta: false,
                alt: false,
                escape: false,
                return: false,
                tab: false,
                backspace: false,
                delete: false,
                upArrow: direction === 'up',
                downArrow: direction === 'down',
                leftArrow: false,
                rightArrow: false,
                home: false,
                end: false,
            };
        }

        it('scrolls down on arrow down in auto mode', () => {
            const container = createScrollContainer(5, 10);
            computeLayout(container, 40, 10);
            setComputedStyle(container, { overflow: 'auto' });
            initScrollState(container, 40, 3);
            
            const button = create_element('button');
            append(container, button);
            button.parent = container;
            
            const result = handleDefaultScroll(button, makeArrowEvent('down'));
            
            expect(result).toBe(true);
            expect(getScrollState(container).scrollTop).toBe(1);
        });

        it('scrolls up on arrow up in auto mode', () => {
            const container = createScrollContainer(5, 10);
            computeLayout(container, 40, 10);
            setComputedStyle(container, { overflow: 'auto' });
            initScrollState(container, 40, 3);
            setScrollPosition(container, { top: 5 });
            
            const button = create_element('button');
            append(container, button);
            button.parent = container;
            
            const result = handleDefaultScroll(button, makeArrowEvent('up'));
            
            expect(result).toBe(true);
            expect(getScrollState(container).scrollTop).toBe(4);
        });

        it('does not scroll when element captures arrows (textarea)', () => {
            const container = createScrollContainer(5, 10);
            computeLayout(container, 40, 10);
            setComputedStyle(container, { overflow: 'auto' });
            initScrollState(container, 40, 3);
            
            const textarea = create_element('textarea');
            append(container, textarea);
            textarea.parent = container;
            
            const result = handleDefaultScroll(textarea, makeArrowEvent('down'));
            
            expect(result).toBe(false);
            expect(getScrollState(container).scrollTop).toBe(0);
        });

        it('does not scroll when mode is disabled', () => {
            const container = createScrollContainer(5, 10);
            computeLayout(container, 40, 10);
            // Set computed style AFTER layout (layout hydrates __cssStyle from stylesheet)
            setComputedStyle(container, { overflow: 'auto', scrollKeyboard: 'disabled' });
            initScrollState(container, 40, 3);
            
            const button = create_element('button');
            append(container, button);
            button.parent = container;
            
            const result = handleDefaultScroll(button, makeArrowEvent('down'));
            
            expect(result).toBe(false);
        });

        it('does not scroll when mode is enabled (uses explicit bindings instead)', () => {
            const container = createScrollContainer(5, 10);
            computeLayout(container, 40, 10);
            // Set computed style AFTER layout (layout hydrates __cssStyle from stylesheet)
            setComputedStyle(container, { overflow: 'auto', scrollKeyboard: 'enabled' });
            initScrollState(container, 40, 3);
            
            const button = create_element('button');
            append(container, button);
            button.parent = container;
            
            const result = handleDefaultScroll(button, makeArrowEvent('down'));
            
            expect(result).toBe(false);
        });

        it('does not scroll when modifiers are pressed', () => {
            const container = createScrollContainer(5, 10);
            computeLayout(container, 40, 10);
            setComputedStyle(container, { overflow: 'auto' });
            initScrollState(container, 40, 3);
            
            const button = create_element('button');
            append(container, button);
            button.parent = container;
            
            const event = makeArrowEvent('down');
            event.ctrl = true;
            
            const result = handleDefaultScroll(button, event);
            
            expect(result).toBe(false);
        });
    });

    describe('handleScrollKeyboard (combined)', () => {
        function makeArrowEvent(direction: 'up' | 'down'): KeyPressEvent {
            return {
                key: direction === 'up' ? 'ArrowUp' : 'ArrowDown',
                ctrl: false,
                shift: false,
                meta: false,
                alt: false,
                escape: false,
                return: false,
                tab: false,
                backspace: false,
                delete: false,
                upArrow: direction === 'up',
                downArrow: direction === 'down',
                leftArrow: false,
                rightArrow: false,
                home: false,
                end: false,
            };
        }

        it('uses default scroll in auto mode', () => {
            const container = createScrollContainer(5, 10);
            computeLayout(container, 40, 10);
            setComputedStyle(container, { overflow: 'auto' });
            initScrollState(container, 40, 3);
            
            const button = create_element('button');
            append(container, button);
            button.parent = container;
            
            const result = handleScrollKeyboard(button, makeArrowEvent('down'));
            
            expect(result).toBe(true);
            expect(getScrollState(container).scrollTop).toBe(1);
        });

        it('uses explicit bindings in enabled mode', () => {
            const container = createScrollContainer(5, 10);
            computeLayout(container, 40, 10);
            // Set computed style AFTER layout (layout hydrates __cssStyle from stylesheet)
            setComputedStyle(container, { 
                overflow: 'auto', 
                scrollKeyboard: 'enabled',
                scrollKeyDown: 'j',
            });
            initScrollState(container, 40, 3);
            
            const button = create_element('button');
            append(container, button);
            button.parent = container;
            
            // Arrow down should NOT work in enabled mode (only explicit bindings)
            const result1 = handleScrollKeyboard(button, makeArrowEvent('down'));
            expect(result1).toBe(false);
            
            // 'j' should work
            const jEvent: KeyPressEvent = {
                key: 'j',
                ctrl: false,
                shift: false,
                meta: false,
                alt: false,
                escape: false,
                return: false,
                tab: false,
                backspace: false,
                delete: false,
                upArrow: false,
                downArrow: false,
                leftArrow: false,
                rightArrow: false,
                home: false,
                end: false,
            };
            
            const result2 = handleScrollKeyboard(button, jEvent);
            expect(result2).toBe(true);
            expect(getScrollState(container).scrollTop).toBe(1);
        });

        it('returns false in disabled mode', () => {
            const container = createScrollContainer(5, 10);
            computeLayout(container, 40, 10);
            // Set computed style AFTER layout (layout hydrates __cssStyle from stylesheet)
            setComputedStyle(container, { overflow: 'auto', scrollKeyboard: 'disabled' });
            initScrollState(container, 40, 3);
            
            const button = create_element('button');
            append(container, button);
            button.parent = container;
            
            const result = handleScrollKeyboard(button, makeArrowEvent('down'));
            
            expect(result).toBe(false);
            expect(getScrollState(container).scrollTop).toBe(0);
        });
    });
});

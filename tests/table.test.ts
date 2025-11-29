/**
 * Tests for table rendering.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    create_root,
    create_element,
    create_text,
    append,
    set_attribute,
    set_style,
    computeLayout,
    free_node,
} from '../src/runtime/index.js';
import { measureRoot } from '../src/runtime/render/pipeline/measure.js';
import { createRenderGrid } from '../src/runtime/render/pipeline/layout.js';
import { paintTree } from '../src/runtime/render/pipeline/paint.js';
import {
    extractTableStructure,
    isTable,
    isTableRow,
    isTableCell,
    calculateTableWidth,
    calculateTableHeight,
    getTableDimensions,
} from '../src/runtime/render/table.js';
import { resetStylesheets, ensureBaseStyles } from '../src/runtime/style/stylesheet.js';

describe('table rendering', () => {
    beforeEach(() => {
        ensureBaseStyles();
    });

    afterEach(() => {
        resetStylesheets();
    });

    function snapshotTextGrid(root: any): string {
        const metrics = measureRoot(root);
        const grid = createRenderGrid(metrics.width, metrics.height);
        paintTree(root, grid);
        return grid.map(row => row.map(cell => cell.char).join('')).join('\n');
    }

    describe('table detection', () => {
        it('identifies table elements', () => {
            const table = create_element('table');
            expect(isTable(table)).toBe(true);
        });

        it('identifies tr elements', () => {
            const tr = create_element('tr');
            expect(isTableRow(tr)).toBe(true);
        });

        it('identifies td elements', () => {
            const td = create_element('td');
            expect(isTableCell(td)).toBe(true);
        });

        it('identifies th elements', () => {
            const th = create_element('th');
            expect(isTableCell(th)).toBe(true);
        });
    });

    describe('structure extraction', () => {
        it('extracts simple table structure', () => {
            const table = create_element('table');
            const tr = create_element('tr');
            const td1 = create_element('td');
            const td2 = create_element('td');
            
            td1.textContent = 'A';
            td2.textContent = 'B';
            
            append(td1, create_text('A'));
            append(td2, create_text('B'));
            append(tr, td1);
            append(tr, td2);
            append(table, tr);

            const structure = extractTableStructure(table);
            
            expect(structure.body).toHaveLength(1);
            expect(structure.body[0].cells).toHaveLength(2);
            expect(structure.columnCount).toBe(2);
        });

        it('extracts table with thead and tbody', () => {
            const table = create_element('table');
            const thead = create_element('thead');
            const tbody = create_element('tbody');
            const headerRow = create_element('tr');
            const bodyRow = create_element('tr');
            const th1 = create_element('th');
            const th2 = create_element('th');
            const td1 = create_element('td');
            const td2 = create_element('td');
            
            th1.textContent = 'Header1';
            th2.textContent = 'Header2';
            td1.textContent = 'Data1';
            td2.textContent = 'Data2';
            
            append(th1, create_text('Header1'));
            append(th2, create_text('Header2'));
            append(td1, create_text('Data1'));
            append(td2, create_text('Data2'));
            
            append(headerRow, th1);
            append(headerRow, th2);
            append(bodyRow, td1);
            append(bodyRow, td2);
            append(thead, headerRow);
            append(tbody, bodyRow);
            append(table, thead);
            append(table, tbody);

            const structure = extractTableStructure(table);
            
            expect(structure.head).toHaveLength(1);
            expect(structure.body).toHaveLength(1);
            expect(structure.columnCount).toBe(2);
        });

        it('extracts table with tfoot', () => {
            const table = create_element('table');
            const tbody = create_element('tbody');
            const tfoot = create_element('tfoot');
            const bodyRow = create_element('tr');
            const footRow = create_element('tr');
            const td1 = create_element('td');
            const td2 = create_element('td');
            
            td1.textContent = 'Data';
            td2.textContent = 'Total';
            
            append(td1, create_text('Data'));
            append(td2, create_text('Total'));
            
            append(bodyRow, td1);
            append(footRow, td2);
            append(tbody, bodyRow);
            append(tfoot, footRow);
            append(table, tbody);
            append(table, tfoot);

            const structure = extractTableStructure(table);
            
            expect(structure.body).toHaveLength(1);
            expect(structure.foot).toHaveLength(1);
        });
    });

    describe('dimension calculation', () => {
        it('calculates column widths from content', () => {
            const table = create_element('table');
            const tr = create_element('tr');
            const td1 = create_element('td');
            const td2 = create_element('td');
            
            td1.textContent = 'Short';
            td2.textContent = 'LongerText';
            
            append(td1, create_text('Short'));
            append(td2, create_text('LongerText'));
            append(tr, td1);
            append(tr, td2);
            append(table, tr);

            const structure = extractTableStructure(table);
            
            expect(structure.columnWidths[0]).toBe(5); // 'Short'.length
            expect(structure.columnWidths[1]).toBe(10); // 'LongerText'.length
        });

        it('calculates table dimensions', () => {
            const table = create_element('table');
            const tr1 = create_element('tr');
            const tr2 = create_element('tr');
            const td1 = create_element('td');
            const td2 = create_element('td');
            const td3 = create_element('td');
            const td4 = create_element('td');
            
            td1.textContent = 'A';
            td2.textContent = 'B';
            td3.textContent = 'C';
            td4.textContent = 'D';
            
            append(td1, create_text('A'));
            append(td2, create_text('B'));
            append(td3, create_text('C'));
            append(td4, create_text('D'));
            append(tr1, td1);
            append(tr1, td2);
            append(tr2, td3);
            append(tr2, td4);
            append(table, tr1);
            append(table, tr2);

            const dims = getTableDimensions(table);
            
            // 2 columns: each 1 char + 2 padding + borders = (1+2)*2 + 3 = 9
            expect(dims.width).toBe(9);
            // 2 rows: each 1 height + separators = 2*2 + 1 = 5
            expect(dims.height).toBe(5);
        });
    });

    describe('rendering', () => {
        it('renders simple table with borders', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 10 });

            const table = create_element('table');
            const tr = create_element('tr');
            const td1 = create_element('td');
            const td2 = create_element('td');
            
            td1.textContent = 'A';
            td2.textContent = 'B';
            
            append(td1, create_text('A'));
            append(td2, create_text('B'));
            append(tr, td1);
            append(tr, td2);
            append(table, tr);
            append(root, table);

            computeLayout(root, 20, 10);
            const output = snapshotTextGrid(root);
            free_node(root);

            // Should contain border characters
            expect(output).toContain('┌');
            expect(output).toContain('┐');
            expect(output).toContain('└');
            expect(output).toContain('┘');
            expect(output).toContain('│');
            expect(output).toContain('─');
            // Should contain cell content
            expect(output).toContain('A');
            expect(output).toContain('B');
        });

        it('renders table with header row', () => {
            const root = create_root();
            set_style(root, { width: 30, height: 10 });

            const table = create_element('table');
            const thead = create_element('thead');
            const tbody = create_element('tbody');
            const headerRow = create_element('tr');
            const bodyRow = create_element('tr');
            const th = create_element('th');
            const td = create_element('td');
            
            th.textContent = 'Name';
            td.textContent = 'Alice';
            
            append(th, create_text('Name'));
            append(td, create_text('Alice'));
            append(headerRow, th);
            append(bodyRow, td);
            append(thead, headerRow);
            append(tbody, bodyRow);
            append(table, thead);
            append(table, tbody);
            append(root, table);

            computeLayout(root, 30, 10);
            const output = snapshotTextGrid(root);
            free_node(root);

            expect(output).toContain('Name');
            expect(output).toContain('Alice');
        });

        it('renders multi-column table correctly', () => {
            const root = create_root();
            set_style(root, { width: 40, height: 10 });

            const table = create_element('table');
            const tr = create_element('tr');
            const td1 = create_element('td');
            const td2 = create_element('td');
            const td3 = create_element('td');
            
            td1.textContent = 'Col1';
            td2.textContent = 'Col2';
            td3.textContent = 'Col3';
            
            append(td1, create_text('Col1'));
            append(td2, create_text('Col2'));
            append(td3, create_text('Col3'));
            append(tr, td1);
            append(tr, td2);
            append(tr, td3);
            append(table, tr);
            append(root, table);

            computeLayout(root, 40, 10);
            const output = snapshotTextGrid(root);
            free_node(root);

            // Should have column separators
            expect(output).toContain('┬');
            expect(output).toContain('┴');
            expect(output).toContain('Col1');
            expect(output).toContain('Col2');
            expect(output).toContain('Col3');
        });

        it('renders multi-row table with row separators', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 15 });

            const table = create_element('table');
            const tr1 = create_element('tr');
            const tr2 = create_element('tr');
            const td1 = create_element('td');
            const td2 = create_element('td');
            
            td1.textContent = 'Row1';
            td2.textContent = 'Row2';
            
            append(td1, create_text('Row1'));
            append(td2, create_text('Row2'));
            append(tr1, td1);
            append(tr2, td2);
            append(table, tr1);
            append(table, tr2);
            append(root, table);

            computeLayout(root, 20, 15);
            const output = snapshotTextGrid(root);
            free_node(root);

            // Should have row separators (T-junctions on sides)
            expect(output).toContain('├');
            expect(output).toContain('┤');
            expect(output).toContain('Row1');
            expect(output).toContain('Row2');
        });

        it('renders table with cross intersections', () => {
            const root = create_root();
            set_style(root, { width: 30, height: 15 });

            const table = create_element('table');
            
            // 2x2 table
            for (let r = 0; r < 2; r++) {
                const tr = create_element('tr');
                for (let c = 0; c < 2; c++) {
                    const td = create_element('td');
                    const text = `R${r}C${c}`;
                    td.textContent = text;
                    append(td, create_text(text));
                    append(tr, td);
                }
                append(table, tr);
            }
            append(root, table);

            computeLayout(root, 30, 15);
            const output = snapshotTextGrid(root);
            free_node(root);

            // Should have cross at intersection
            expect(output).toContain('┼');
            expect(output).toContain('R0C0');
            expect(output).toContain('R1C1');
        });
    });

    describe('nested content', () => {
        it('renders cell with bold text element', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 10 });

            const table = create_element('table');
            const tr = create_element('tr');
            const td = create_element('td');
            const strong = create_element('strong');
            
            append(strong, create_text('Bold'));
            append(td, strong);
            td.textContent = 'Bold';
            append(tr, td);
            append(table, tr);
            append(root, table);

            computeLayout(root, 20, 10);
            const output = snapshotTextGrid(root);
            free_node(root);

            expect(output).toContain('Bold');
        });

        it('renders cell with span element', () => {
            const root = create_root();
            set_style(root, { width: 20, height: 10 });

            const table = create_element('table');
            const tr = create_element('tr');
            const td = create_element('td');
            const span = create_element('span');
            
            append(span, create_text('Span'));
            append(td, span);
            td.textContent = 'Span';
            append(tr, td);
            append(table, tr);
            append(root, table);

            computeLayout(root, 20, 10);
            const output = snapshotTextGrid(root);
            free_node(root);

            expect(output).toContain('Span');
        });

        it('renders cell with div container', () => {
            const root = create_root();
            set_style(root, { width: 25, height: 10 });

            const table = create_element('table');
            const tr = create_element('tr');
            const td = create_element('td');
            const div = create_element('div');
            
            append(div, create_text('InDiv'));
            append(td, div);
            td.textContent = 'InDiv';
            append(tr, td);
            append(table, tr);
            append(root, table);

            computeLayout(root, 25, 10);
            const output = snapshotTextGrid(root);
            free_node(root);

            expect(output).toContain('InDiv');
        });

        it('renders cell with multiple text nodes', () => {
            const root = create_root();
            set_style(root, { width: 25, height: 10 });

            const table = create_element('table');
            const tr = create_element('tr');
            const td = create_element('td');
            
            append(td, create_text('One'));
            append(td, create_text(' Two'));
            td.textContent = 'One Two';
            append(tr, td);
            append(table, tr);
            append(root, table);

            computeLayout(root, 25, 10);
            const output = snapshotTextGrid(root);
            free_node(root);

            expect(output).toContain('One');
            expect(output).toContain('Two');
        });

        it('renders nested table', () => {
            const root = create_root();
            set_style(root, { width: 40, height: 15 });

            const outerTable = create_element('table');
            const outerTr = create_element('tr');
            const outerTd = create_element('td');
            const innerTable = create_element('table');
            const innerTr = create_element('tr');
            const innerTd = create_element('td');
            
            append(innerTd, create_text('Inner'));
            innerTd.textContent = 'Inner';
            append(innerTr, innerTd);
            append(innerTable, innerTr);
            append(outerTd, innerTable);
            outerTd.textContent = 'Inner';
            append(outerTr, outerTd);
            append(outerTable, outerTr);
            append(root, outerTable);

            computeLayout(root, 40, 15);
            const output = snapshotTextGrid(root);
            free_node(root);

            // Should render the content
            expect(output).toContain('Inner');
            // Should have table borders
            expect(output).toContain('┌');
            expect(output).toContain('┘');
        });
    });
});


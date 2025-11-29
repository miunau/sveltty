/**
 * Table Rendering for CLI
 * 
 * Renders HTML table elements (<table>, <thead>, <tbody>, <tfoot>, <tr>, <th>, <td>)
 * with full support for borders, padding, backgrounds, and arbitrary cell content.
 * 
 * Tables use collapsed borders by default (like border-collapse: collapse in CSS).
 * Cell content can include any elements: text, images, nested tables, etc.
 */
import type { CliNode, TextStyle } from '../types.js';
import type { ClipRect, GridCell } from './types.js';
import type { PaintContext, NodeBounds } from './pipeline/context.js';
import type { ElementRenderer, RenderContext } from './registry.js';
import { registerRenderer } from './registry.js';
import { getBorderChars, type BorderChars } from './border.js';
import { setCell, mergeTextStyles } from './utils.js';
import { getNodeTag, getNodeChildren } from '../utils/node.js';
import { getComputedCliStyle } from '../style/computed.js';
import { fillBackground } from './background.js';
import { getStringWidth } from './string-width.js';

/** Table structure extracted from the DOM. */
interface TableStructure {
    /** Header rows from <thead>. */
    head: TableRow[];
    /** Body rows from <tbody> or direct <tr> children. */
    body: TableRow[];
    /** Footer rows from <tfoot>. */
    foot: TableRow[];
    /** Computed column widths. */
    columnWidths: number[];
    /** Row heights (content height, not including borders). */
    rowHeights: number[];
    /** Total number of columns. */
    columnCount: number;
}

/** A table row. */
interface TableRow {
    node: CliNode;
    cells: TableCell[];
}

/** A table cell (th or td). */
interface TableCell {
    node: CliNode;
    isHeader: boolean;
    colspan: number;
    rowspan: number;
    /** Minimum width needed for content. */
    minWidth: number;
    /** Minimum height needed for content. */
    minHeight: number;
}

/**
 * Check if a node is a table element.
 */
export function isTable(node: CliNode): boolean {
    return getNodeTag(node) === 'table';
}

/**
 * Check if a node is a table section (thead, tbody, tfoot).
 */
export function isTableSection(node: CliNode): boolean {
    const tag = getNodeTag(node);
    return tag === 'thead' || tag === 'tbody' || tag === 'tfoot';
}

/**
 * Check if a node is a table row.
 */
export function isTableRow(node: CliNode): boolean {
    return getNodeTag(node) === 'tr';
}

/**
 * Check if a node is a table cell.
 */
export function isTableCell(node: CliNode): boolean {
    const tag = getNodeTag(node);
    return tag === 'td' || tag === 'th';
}

/**
 * Extract table structure from a table node.
 */
export function extractTableStructure(table: CliNode): TableStructure {
    const structure: TableStructure = {
        head: [],
        body: [],
        foot: [],
        columnWidths: [],
        rowHeights: [],
        columnCount: 0,
    };

    const children = getNodeChildren(table);
    
    for (const child of children) {
        if (!child || typeof child !== 'object') continue;
        const tag = getNodeTag(child);
        
        if (tag === 'thead') {
            structure.head.push(...extractRows(child));
        } else if (tag === 'tbody') {
            structure.body.push(...extractRows(child));
        } else if (tag === 'tfoot') {
            structure.foot.push(...extractRows(child));
        } else if (tag === 'tr') {
            // Direct tr children go to body
            const row = extractRow(child);
            if (row) structure.body.push(row);
        }
    }

    // Calculate column count
    const allRows = [...structure.head, ...structure.body, ...structure.foot];
    structure.columnCount = Math.max(
        0,
        ...allRows.map(row => row.cells.reduce((sum, cell) => sum + cell.colspan, 0))
    );

    // Calculate column widths and row heights based on content
    structure.columnWidths = calculateColumnWidths(allRows, structure.columnCount);
    structure.rowHeights = calculateRowHeights(allRows);

    return structure;
}

/**
 * Extract rows from a table section (thead, tbody, tfoot).
 */
function extractRows(section: CliNode): TableRow[] {
    const rows: TableRow[] = [];
    const children = getNodeChildren(section);
    
    for (const child of children) {
        if (!child || typeof child !== 'object') continue;
        if (getNodeTag(child) === 'tr') {
            const row = extractRow(child);
            if (row) rows.push(row);
        }
    }
    
    return rows;
}

/**
 * Extract a single row.
 */
function extractRow(tr: CliNode): TableRow | null {
    const cells: TableCell[] = [];
    const children = getNodeChildren(tr);
    
    for (const child of children) {
        if (!child || typeof child !== 'object') continue;
        const tag = getNodeTag(child);
        
        if (tag === 'td' || tag === 'th') {
            const cell = extractCell(child, tag === 'th');
            cells.push(cell);
        }
    }
    
    if (cells.length === 0) return null;
    
    return { node: tr, cells };
}

/**
 * Extract a single cell.
 */
function extractCell(cell: CliNode, isHeader: boolean): TableCell {
    const colspan = parseInt(String(cell.colspan ?? cell.colSpan ?? 1), 10) || 1;
    const rowspan = parseInt(String(cell.rowspan ?? cell.rowSpan ?? 1), 10) || 1;
    
    // Calculate minimum dimensions needed for content
    const dims = measureCellContent(cell);
    
    return {
        node: cell,
        isHeader,
        colspan,
        rowspan,
        minWidth: dims.width,
        minHeight: dims.height,
    };
}

/**
 * Measure the minimum dimensions needed for cell content.
 * This handles both text content and nested elements.
 */
function measureCellContent(cell: CliNode): { width: number; height: number } {
    // Check if cell has computed layout from its children
    if (cell.computedLayout && cell.computedLayout.width > 0) {
        return {
            width: Math.ceil(cell.computedLayout.width),
            height: Math.ceil(cell.computedLayout.height),
        };
    }
    
    // Fallback: measure text content (using display width)
    const text = getCellText(cell);
    const lines = text.split('\n');
    const maxLineWidth = Math.max(1, ...lines.map(l => getStringWidth(l)));
    
    return {
        width: maxLineWidth,
        height: Math.max(1, lines.length),
    };
}

/**
 * Get the text content of a cell (fallback for simple content).
 */
function getCellText(cell: CliNode): string {
    // Check for direct textContent
    if (cell.textContent !== undefined) {
        return String(cell.textContent);
    }
    
    // Collect text from children recursively
    return collectText(cell);
}

/**
 * Recursively collect text from a node tree.
 */
function collectText(node: CliNode): string {
    let text = '';
    for (const child of getNodeChildren(node)) {
        if (!child) continue;
        if (child.type === 'text' || child.nodeType === 3) {
            text += String(child.value ?? child.textContent ?? '');
        } else if (typeof child === 'object') {
            text += collectText(child);
        }
    }
    return text;
}

/**
 * Calculate optimal column widths based on cell content.
 */
function calculateColumnWidths(rows: TableRow[], columnCount: number): number[] {
    const widths: number[] = new Array(columnCount).fill(1);
    
    for (const row of rows) {
        let colIndex = 0;
        for (const cell of row.cells) {
            if (cell.colspan === 1) {
                // Simple case: single column cell
                widths[colIndex] = Math.max(widths[colIndex], cell.minWidth);
            } else {
                // Multi-column cell: distribute width
                const perColumn = Math.ceil(cell.minWidth / cell.colspan);
                for (let i = 0; i < cell.colspan && colIndex + i < columnCount; i++) {
                    widths[colIndex + i] = Math.max(widths[colIndex + i], perColumn);
                }
            }
            colIndex += cell.colspan;
        }
    }
    
    return widths;
}

/**
 * Calculate row heights based on cell content.
 */
function calculateRowHeights(rows: TableRow[]): number[] {
    return rows.map(row => {
        const maxHeight = Math.max(1, ...row.cells.map(cell => cell.minHeight));
        return maxHeight;
    });
}

/**
 * Calculate total table width including borders and padding.
 */
export function calculateTableWidth(structure: TableStructure, cellPadding: number = 1): number {
    const contentWidth = structure.columnWidths.reduce((sum, w) => sum + w, 0);
    const paddingWidth = structure.columnCount * cellPadding * 2;
    const borderWidth = structure.columnCount + 1;
    return contentWidth + paddingWidth + borderWidth;
}

/**
 * Calculate total table height including borders.
 */
export function calculateTableHeight(structure: TableStructure): number {
    const allRows = [...structure.head, ...structure.body, ...structure.foot];
    const contentHeight = structure.rowHeights.reduce((sum, h) => sum + h, 0);
    // Each row has a border below it, plus top border
    return contentHeight + allRows.length + 1;
}

/**
 * Get the natural dimensions of a table based on its content.
 */
export function getTableDimensions(node: CliNode): { width: number; height: number } {
    const structure = extractTableStructure(node);
    return {
        width: calculateTableWidth(structure, 1),
        height: calculateTableHeight(structure),
    };
}

/**
 * Current render context for table cell content rendering.
 * Set by the table renderer when using the registry pattern.
 */
let currentRenderContext: RenderContext | null = null;

/**
 * Render a table.
 */
export function renderTable(
    node: CliNode,
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    parentStyle: TextStyle | undefined,
    clip?: ClipRect
): void {
    const style = getComputedCliStyle(node, parentStyle);
    const borderStyle = style.borderStyle || 'single';
    const chars = getBorderChars(borderStyle);
    
    const borderColor = style.borderColor;
    const borderBg = style.borderBackgroundColor ?? style.borderBg;
    const tableBg = style.backgroundColor;
    
    const borderTextStyle: TextStyle = {};
    if (borderColor) borderTextStyle.color = borderColor;
    if (borderBg) borderTextStyle.backgroundColor = borderBg;

    // Extract table structure
    const structure = extractTableStructure(node);
    if (structure.columnCount === 0) return;

    const cellPadding = 1;
    const tableWidth = calculateTableWidth(structure, cellPadding);
    const tableHeight = calculateTableHeight(structure);

    // Fill table background if set
    if (tableBg) {
        fillBackground(grid, x, y, Math.min(width, tableWidth), Math.min(height, tableHeight), tableBg, clip);
    }

    // Render the table grid and content
    renderTableGrid(
        grid,
        x,
        y,
        structure,
        cellPadding,
        chars,
        borderTextStyle,
        style,
        clip
    );
}

/**
 * Render the table grid with borders and content.
 */
function renderTableGrid(
    grid: GridCell[][],
    startX: number,
    startY: number,
    structure: TableStructure,
    cellPadding: number,
    chars: BorderChars,
    borderStyle: TextStyle,
    tableStyle: TextStyle,
    clip?: ClipRect
): void {
    const clipX1 = clip ? Math.floor(clip.x1) : 0;
    const clipY1 = clip ? Math.floor(clip.y1) : 0;
    const clipX2 = clip ? Math.ceil(clip.x2) : grid[0]?.length ?? 0;
    const clipY2 = clip ? Math.ceil(clip.y2) : grid.length;

    const inClip = (row: number, col: number): boolean => {
        return row >= clipY1 && row < clipY2 && col >= clipX1 && col < clipX2;
    };

    // Calculate column X positions (start of each column's content area)
    const columnXPositions: number[] = [];
    let currentX = startX + 1 + cellPadding;
    for (let i = 0; i < structure.columnCount; i++) {
        columnXPositions.push(currentX);
        currentX += structure.columnWidths[i] + cellPadding * 2 + 1;
    }

    // Collect all rows in order
    const allRows = [...structure.head, ...structure.body, ...structure.foot];
    const sectionBoundaries: number[] = [
        structure.head.length,
        structure.head.length + structure.body.length,
    ];

    // Render top border
    let currentY = startY;
    renderHorizontalBorder(grid, startX, currentY, structure, cellPadding, chars, borderStyle, 'top', inClip);
    currentY++;

    // Render each row
    for (let rowIndex = 0; rowIndex < allRows.length; rowIndex++) {
        const row = allRows[rowIndex];
        const rowHeight = structure.rowHeights[rowIndex];
        
        // Render row content (potentially multiple lines for tall cells)
        for (let lineIndex = 0; lineIndex < rowHeight; lineIndex++) {
            renderRowContent(
                grid,
                startX,
                currentY,
                row,
                structure,
                cellPadding,
                columnXPositions,
                rowHeight,
                lineIndex,
                chars,
                borderStyle,
                tableStyle,
                clip,
                inClip
            );
            currentY++;
        }

        // Render separator (or bottom border for last row)
        const isLastRow = rowIndex === allRows.length - 1;
        const isSectionBoundary = sectionBoundaries.includes(rowIndex + 1) && !isLastRow;
        
        if (isLastRow) {
            renderHorizontalBorder(grid, startX, currentY, structure, cellPadding, chars, borderStyle, 'bottom', inClip);
        } else if (isSectionBoundary) {
            renderHorizontalBorder(grid, startX, currentY, structure, cellPadding, chars, borderStyle, 'section', inClip);
        } else {
            renderHorizontalBorder(grid, startX, currentY, structure, cellPadding, chars, borderStyle, 'middle', inClip);
        }
        currentY++;
    }
}

/**
 * Render a horizontal border line.
 */
function renderHorizontalBorder(
    grid: GridCell[][],
    startX: number,
    y: number,
    structure: TableStructure,
    cellPadding: number,
    chars: BorderChars,
    style: TextStyle,
    position: 'top' | 'middle' | 'bottom' | 'section',
    inClip: (row: number, col: number) => boolean
): void {
    if (y < 0 || y >= grid.length) return;

    let currentX = startX;

    const leftChar = position === 'top' ? chars.topLeft :
                     position === 'bottom' ? chars.bottomLeft :
                     chars.teeRight;
    if (inClip(y, currentX) && currentX >= 0 && currentX < grid[y].length) {
        setCell(grid, y, currentX, leftChar, style);
    }
    currentX++;

    for (let col = 0; col < structure.columnCount; col++) {
        const colWidth = structure.columnWidths[col] + cellPadding * 2;
        
        for (let i = 0; i < colWidth; i++) {
            if (inClip(y, currentX) && currentX >= 0 && currentX < grid[y].length) {
                setCell(grid, y, currentX, chars.horizontal, style);
            }
            currentX++;
        }

        const isLast = col === structure.columnCount - 1;
        const junctionChar = isLast
            ? (position === 'top' ? chars.topRight :
               position === 'bottom' ? chars.bottomRight :
               chars.teeLeft)
            : (position === 'top' ? chars.teeDown :
               position === 'bottom' ? chars.teeUp :
               chars.cross);
        
        if (inClip(y, currentX) && currentX >= 0 && currentX < grid[y].length) {
            setCell(grid, y, currentX, junctionChar, style);
        }
        currentX++;
    }
}

/**
 * Render a row's content (cells with vertical borders).
 * Supports multi-line cells and arbitrary content.
 */
function renderRowContent(
    grid: GridCell[][],
    startX: number,
    y: number,
    row: TableRow,
    structure: TableStructure,
    cellPadding: number,
    columnXPositions: number[],
    rowHeight: number,
    lineIndex: number,
    chars: BorderChars,
    borderStyle: TextStyle,
    tableStyle: TextStyle,
    tableClip: ClipRect | undefined,
    inClip: (row: number, col: number) => boolean
): void {
    if (y < 0 || y >= grid.length) return;

    let currentX = startX;

    // Left border
    if (inClip(y, currentX) && currentX >= 0 && currentX < grid[y].length) {
        setCell(grid, y, currentX, chars.vertical, borderStyle);
    }
    currentX++;

    // Render each cell
    let colIndex = 0;
    for (const cell of row.cells) {
        // Calculate cell content width
        let cellContentWidth = 0;
        for (let i = 0; i < cell.colspan && colIndex + i < structure.columnCount; i++) {
            cellContentWidth += structure.columnWidths[colIndex + i];
            if (i > 0) cellContentWidth += cellPadding * 2 + 1;
        }

        // Cell style
        const cellStyle = getComputedCliStyle(cell.node, tableStyle);
        const cellBg = cellStyle.backgroundColor;
        const textStyle = mergeTextStyles(tableStyle, cellStyle);
        if (cell.isHeader) {
            textStyle.bold = true;
        }

        // Left padding
        for (let i = 0; i < cellPadding; i++) {
            if (inClip(y, currentX) && currentX >= 0 && currentX < grid[y].length) {
                const padStyle: TextStyle = cellBg ? { backgroundColor: cellBg } : {};
                setCell(grid, y, currentX, ' ', padStyle);
            }
            currentX++;
        }

        // Cell content area
        const contentStartX = currentX;
        const contentEndX = currentX + cellContentWidth;
        
        // Create clip for cell content
        const cellClip: ClipRect = {
            x1: Math.max(contentStartX, tableClip?.x1 ?? 0),
            y1: Math.max(y, tableClip?.y1 ?? 0),
            x2: Math.min(contentEndX, tableClip?.x2 ?? grid[0]?.length ?? 0),
            y2: Math.min(y + 1, tableClip?.y2 ?? grid.length),
        };

        // Try to render cell children using the paint context
        if (currentRenderContext && lineIndex === 0) {
            // On first line, try to render cell children
            renderCellContent(cell.node, grid, contentStartX, y, cellContentWidth, rowHeight, textStyle, cellClip, currentRenderContext);
        } else {
            // For additional lines or fallback, render text (using display width)
            const text = getCellText(cell.node);
            const lines = text.split('\n');
            const lineText = lines[lineIndex] ?? '';
            
            // Render the line content
            let col = 0;
            for (const char of lineText) {
                const charWidth = getStringWidth(char);
                if (charWidth === 0) continue;
                if (col >= cellContentWidth) break;
                
                if (inClip(y, currentX) && currentX >= 0 && currentX < grid[y].length) {
                    const charStyle: TextStyle = { ...textStyle };
                    if (cellBg && !charStyle.backgroundColor) {
                        charStyle.backgroundColor = cellBg;
                    }
                    setCell(grid, y, currentX, char, charStyle);
                    if (charWidth === 2 && col + 1 < cellContentWidth && currentX + 1 < grid[y].length) {
                        setCell(grid, y, currentX + 1, '', charStyle);
                    }
                }
                currentX += charWidth;
                col += charWidth;
            }
            // Pad remaining space
            while (col < cellContentWidth) {
                if (inClip(y, currentX) && currentX >= 0 && currentX < grid[y].length) {
                    const charStyle: TextStyle = cellBg ? { backgroundColor: cellBg } : {};
                    setCell(grid, y, currentX, ' ', charStyle);
                }
                currentX++;
                col++;
            }
        }
        
        // Ensure we advance currentX past the cell content
        currentX = contentEndX;

        // Right padding
        for (let i = 0; i < cellPadding; i++) {
            if (inClip(y, currentX) && currentX >= 0 && currentX < grid[y].length) {
                const padStyle: TextStyle = cellBg ? { backgroundColor: cellBg } : {};
                setCell(grid, y, currentX, ' ', padStyle);
            }
            currentX++;
        }

        // Vertical border after cell
        if (inClip(y, currentX) && currentX >= 0 && currentX < grid[y].length) {
            setCell(grid, y, currentX, chars.vertical, borderStyle);
        }
        currentX++;

        colIndex += cell.colspan;
    }

    // Fill remaining columns if row has fewer cells
    while (colIndex < structure.columnCount) {
        const colWidth = structure.columnWidths[colIndex] + cellPadding * 2;
        for (let i = 0; i < colWidth; i++) {
            if (inClip(y, currentX) && currentX >= 0 && currentX < grid[y].length) {
                setCell(grid, y, currentX, ' ', {});
            }
            currentX++;
        }
        if (inClip(y, currentX) && currentX >= 0 && currentX < grid[y].length) {
            setCell(grid, y, currentX, chars.vertical, borderStyle);
        }
        currentX++;
        colIndex++;
    }
}

/**
 * Render cell content, handling both simple text and complex nested elements.
 * 
 * For elements with computed layouts (properly laid out children), we use the
 * paint context to render them. For simple text or elements without layout,
 * we fall back to text rendering.
 * 
 * @param cell - The cell node.
 * @param grid - The render grid.
 * @param x - Cell content X position.
 * @param y - Cell content Y position.
 * @param width - Cell content width.
 * @param height - Cell content height.
 * @param textStyle - Style for text rendering.
 * @param clip - Clip bounds.
 * @param ctx - Optional render context for painting children.
 */
function renderCellContent(
    cell: CliNode,
    grid: GridCell[][],
    x: number,
    y: number,
    width: number,
    height: number,
    textStyle: TextStyle,
    clip: ClipRect,
    ctx?: RenderContext
): void {
    const children = getNodeChildren(cell);
    const renderCtx = ctx ?? currentRenderContext;
    
    // If we have a render context, try to paint children
    if (renderCtx && children.length > 0) {
        let hasRenderedElements = false;
        let currentX = x;
        let currentY = y;
        
        for (const child of children) {
            if (!child || typeof child !== 'object') continue;
            
            const isTextNode = child.type === 'text' || child.nodeType === 3;
            const childNode = child as CliNode;
            
            if (isTextNode) {
                // Render text nodes directly (using display width)
                const text = String(child.value ?? child.textContent ?? '');
                for (const char of text) {
                    const charWidth = getStringWidth(char);
                    if (charWidth === 0) continue;
                    if (currentX >= clip.x2) break;
                    if (currentX >= clip.x1 && currentY >= clip.y1 && currentY < clip.y2) {
                        setCell(grid, currentY, currentX, char, textStyle);
                        if (charWidth === 2 && currentX + 1 < clip.x2) {
                            setCell(grid, currentY, currentX + 1, '', textStyle);
                        }
                    }
                    currentX += charWidth;
                }
                hasRenderedElements = true;
            } else {
                // Element - use paintConstrained for proper nested rendering
                const childBounds = {
                    x: currentX,
                    y: currentY,
                    width: Math.max(1, width - (currentX - x)),
                    height: Math.max(1, height),
                };
                
                // Create a minimal paint context for the child
                const childPaintCtx: PaintContext = {
                    grid,
                    viewport: { width: grid[0]?.length ?? 0, height: grid.length, clip },
                    parentX: x,
                    parentY: y,
                    parentStyle: textStyle,
                    clip,
                };
                
                // Apply element styling
                const childStyle = getComputedCliStyle(childNode, textStyle);
                const mergedStyle = mergeTextStyles(textStyle, childStyle);
                
                // Render the element's text content inline (using display width)
                const text = collectText(childNode);
                for (const char of text) {
                    const charWidth = getStringWidth(char);
                    if (charWidth === 0) continue;
                    if (currentX >= clip.x2) break;
                    if (currentX >= clip.x1 && currentY >= clip.y1 && currentY < clip.y2) {
                        setCell(grid, currentY, currentX, char, mergedStyle);
                        if (charWidth === 2 && currentX + 1 < clip.x2) {
                            setCell(grid, currentY, currentX + 1, '', mergedStyle);
                        }
                    }
                    currentX += charWidth;
                }
                hasRenderedElements = true;
            }
        }
        
        if (hasRenderedElements) {
            // Fill remaining width with spaces
            for (let i = currentX - x; i < width && x + i < clip.x2; i++) {
                if (x + i >= clip.x1 && y >= clip.y1 && y < clip.y2) {
                    setCell(grid, y, x + i, ' ', textStyle);
                }
            }
            return;
        }
    }
    
    // Fallback: render as plain text (using display width)
    const text = getCellText(cell);
    const lines = text.split('\n');
    
    for (let lineIdx = 0; lineIdx < lines.length && y + lineIdx < clip.y2; lineIdx++) {
        const line = lines[lineIdx];
        const lineY = y + lineIdx;
        if (lineY < clip.y1) continue;
        
        let col = 0;
        for (const char of line) {
            const charWidth = getStringWidth(char);
            if (charWidth === 0) continue;
            if (col >= width || x + col >= clip.x2) break;
            if (x + col >= clip.x1) {
                setCell(grid, lineY, x + col, char, textStyle);
                if (charWidth === 2 && col + 1 < width && x + col + 1 < clip.x2) {
                    setCell(grid, lineY, x + col + 1, '', textStyle);
                }
            }
            col += charWidth;
        }
        // Fill remaining width with spaces
        while (col < width && x + col < clip.x2) {
            if (x + col >= clip.x1) {
                setCell(grid, lineY, x + col, ' ', textStyle);
            }
            col++;
        }
    }
}

/**
 * Table element renderer.
 * 
 * Registered with the element registry to handle <table> elements.
 * Uses custom layout (calculates dimensions from content) and
 * custom children (handles cell content rendering).
 */
export const tableRenderer: ElementRenderer = {
    tags: ['table'],
    customLayout: true,
    customChildren: true,
    
    render(node: CliNode, ctx: RenderContext, bounds: NodeBounds, computedStyle: TextStyle): void {
        // Store context for cell rendering
        currentRenderContext = ctx;
        
        try {
            renderTable(
                node,
                ctx.grid,
                bounds.absX,
                bounds.absY,
                bounds.width,
                bounds.height,
                computedStyle,
                bounds.clip
            );
        } finally {
            currentRenderContext = null;
        }
    },
};

// Register the table renderer
registerRenderer(tableRenderer);

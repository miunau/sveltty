/**
 * CSS Math Functions: calc(), min(), max(), clamp()
 * 
 * Expressions are parsed at style-application time and compiled to
 * resolver functions. Resolution happens during layout when parent
 * dimensions are known.
 * 
 * Supported functions:
 * - calc(expression) - arithmetic with mixed units
 * - min(a, b, ...) - minimum of values
 * - max(a, b, ...) - maximum of values
 * - clamp(min, val, max) - clamp value between min and max
 * 
 * Supported units:
 * - Numbers (unitless)
 * - ch (character units - terminal columns/rows)
 * - % (percentage of container dimension)
 * 
 * @example
 * width: calc(100% - 10ch);
 * height: clamp(5ch, 50%, 20ch);
 * min-width: min(100%, 80ch);
 */

import type * as CssTree from 'css-tree';

/**
 * Expression AST nodes representing parsed calc expressions.
 */
export type CalcExpr =
    | { type: 'value'; value: number; unit: 'none' | 'ch' | '%' }
    | { type: 'add'; left: CalcExpr; right: CalcExpr }
    | { type: 'sub'; left: CalcExpr; right: CalcExpr }
    | { type: 'mul'; left: CalcExpr; right: CalcExpr }
    | { type: 'div'; left: CalcExpr; right: CalcExpr }
    | { type: 'min'; args: CalcExpr[] }
    | { type: 'max'; args: CalcExpr[] }
    | { type: 'clamp'; min: CalcExpr; val: CalcExpr; max: CalcExpr };

/**
 * Context provided during calc resolution.
 * Contains the dimensions needed to resolve percentage values.
 */
export interface CalcContext {
    /** Available width in characters (for width-axis percentage calculations) */
    containerWidth: number;
    /** Available height in rows (for height-axis percentage calculations) */
    containerHeight: number;
    /** Which dimension we're calculating (determines % base) */
    axis: 'width' | 'height';
}

/**
 * A compiled resolver function that evaluates the expression with context.
 */
export type CalcResolver = (ctx: CalcContext) => number;

/**
 * Stored on style properties that use calc expressions.
 * Contains both the resolver and original CSS for debugging.
 */
export interface CalcValue {
    type: 'calc';
    /** Original CSS string for debugging/error messages */
    original: string;
    /** Compiled resolver function */
    resolve: CalcResolver;
}

/**
 * Check if a style value is a CalcValue.
 */
export function isCalcValue(value: unknown): value is CalcValue {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as Record<string, unknown>).type === 'calc' &&
        typeof (value as Record<string, unknown>).resolve === 'function'
    );
}

/**
 * Resolve a style value, handling CalcValue if present.
 * 
 * @param value - The style value (number, string, or CalcValue)
 * @param ctx - The calc context with container dimensions
 * @returns The resolved numeric value, or undefined if resolution fails
 */
export function resolveStyleValue(
    value: number | string | CalcValue | undefined,
    ctx: CalcContext
): number | undefined {
    if (value === undefined) return undefined;
    
    if (typeof value === 'number') {
        return value;
    }
    
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.endsWith('%')) {
            const percent = parseFloat(trimmed);
            if (Number.isNaN(percent)) return undefined;
            const base = ctx.axis === 'width' ? ctx.containerWidth : ctx.containerHeight;
            return (percent / 100) * base;
        }
        if (trimmed.endsWith('ch')) {
            const ch = parseFloat(trimmed);
            return Number.isNaN(ch) ? undefined : ch;
        }
        const num = parseFloat(trimmed);
        return Number.isNaN(num) ? undefined : num;
    }
    
    if (isCalcValue(value)) {
        return value.resolve(ctx);
    }
    
    return undefined;
}

/**
 * Parse a css-tree node into a CalcExpr.
 * Handles Function nodes (calc, min, max, clamp) and their children.
 * 
 * @param node - A css-tree AST node
 * @returns Parsed CalcExpr or null if parsing fails
 */
export function parseCalcNode(node: CssTree.CssNode): CalcExpr | null {
    if (!node) return null;
    
    switch (node.type) {
        case 'Number':
            return {
                type: 'value',
                value: Number(node.value),
                unit: 'none',
            };
            
        case 'Dimension':
            const unit = node.unit.toLowerCase();
            if (unit === 'ch') {
                return {
                    type: 'value',
                    value: Number(node.value),
                    unit: 'ch',
                };
            }
            // px and other units are treated as 1:1 with ch for terminal
            return {
                type: 'value',
                value: Number(node.value),
                unit: 'none',
            };
            
        case 'Percentage':
            return {
                type: 'value',
                value: Number(node.value),
                unit: '%',
            };
            
        case 'Function': {
            const funcName = node.name.toLowerCase();
            const args = collectFunctionArgs(node);
            
            switch (funcName) {
                case 'calc':
                    // calc() contains a single expression
                    return parseCalcExpression(node.children);
                    
                case 'min':
                    if (args.length === 0) return null;
                    return { type: 'min', args };
                    
                case 'max':
                    if (args.length === 0) return null;
                    return { type: 'max', args };
                    
                case 'clamp':
                    if (args.length !== 3) return null;
                    return {
                        type: 'clamp',
                        min: args[0],
                        val: args[1],
                        max: args[2],
                    };
                    
                default:
                    return null;
            }
        }
            
        case 'Value':
            // Value node contains children - parse the expression
            return parseCalcExpression(node.children);
        
        case 'Parentheses':
            // Parentheses node - parse the inner expression
            return parseCalcExpression(node.children);
            
        default:
            return null;
    }
}

/**
 * Collect function arguments, parsing each into a CalcExpr.
 * Arguments are separated by Operator nodes with value ','.
 */
function collectFunctionArgs(funcNode: CssTree.FunctionNode): CalcExpr[] {
    const args: CalcExpr[] = [];
    let currentTokens: CssTree.CssNode[] = [];
    
    if (!funcNode.children) return args;
    
    funcNode.children.forEach((child: CssTree.CssNode) => {
        if (child.type === 'Operator' && child.value === ',') {
            // End of current argument
            if (currentTokens.length > 0) {
                const expr = parseTokensToExpr(currentTokens);
                if (expr) args.push(expr);
                currentTokens = [];
            }
        } else {
            currentTokens.push(child);
        }
    });
    
    // Handle last argument
    if (currentTokens.length > 0) {
        const expr = parseTokensToExpr(currentTokens);
        if (expr) args.push(expr);
    }
    
    return args;
}

/**
 * Parse a list of tokens into a single CalcExpr.
 * If there's only one token, parse it directly.
 * If there are multiple, treat them as an expression.
 */
function parseTokensToExpr(tokens: CssTree.CssNode[]): CalcExpr | null {
    if (tokens.length === 0) return null;
    if (tokens.length === 1) return parseCalcNode(tokens[0]);
    
    // Multiple tokens - parse as expression
    return parseExpressionTokens(tokens);
}

/**
 * Parse a calc() expression from css-tree children.
 * Handles addition, subtraction, multiplication, and division.
 */
function parseCalcExpression(children: CssTree.List<CssTree.CssNode> | null): CalcExpr | null {
    if (!children) return null;
    
    const tokens: CssTree.CssNode[] = [];
    children.forEach((child: CssTree.CssNode) => {
        // Skip whitespace
        if (child.type !== 'WhiteSpace') {
            tokens.push(child);
        }
    });
    
    if (tokens.length === 0) return null;
    return parseExpressionTokens(tokens);
}

/**
 * Normalize operator value by trimming whitespace.
 */
function normalizeOperator(op: string): string {
    return op.trim();
}

/**
 * Parse expression tokens with operator precedence.
 * Multiplication and division have higher precedence than addition and subtraction.
 */
function parseExpressionTokens(tokens: CssTree.CssNode[]): CalcExpr | null {
    if (tokens.length === 0) return null;
    if (tokens.length === 1) return parseCalcNode(tokens[0]);
    
    // Find lowest precedence operator (+ or -) from right to left
    // This gives left-to-right evaluation with correct precedence
    let opIndex = -1;
    let parenDepth = 0;
    
    for (let i = tokens.length - 1; i >= 0; i--) {
        const token = tokens[i];
        
        if (token.type === 'Function') {
            // Skip function internals
            continue;
        }
        
        if (token.type === 'Operator') {
            const op = normalizeOperator(token.value);
            if (parenDepth === 0 && (op === '+' || op === '-')) {
                opIndex = i;
                break;
            }
        }
    }
    
    // If no + or -, look for * or /
    if (opIndex === -1) {
        for (let i = tokens.length - 1; i >= 0; i--) {
            const token = tokens[i];
            if (token.type === 'Operator') {
                const op = normalizeOperator(token.value);
                if (parenDepth === 0 && (op === '*' || op === '/')) {
                    opIndex = i;
                    break;
                }
            }
        }
    }
    
    if (opIndex === -1) {
        // No operator found - try parsing as single value
        return parseCalcNode(tokens[0]);
    }
    
    const op = normalizeOperator((tokens[opIndex] as CssTree.Operator).value);
    const leftTokens = tokens.slice(0, opIndex);
    const rightTokens = tokens.slice(opIndex + 1);
    
    const left = parseExpressionTokens(leftTokens);
    const right = parseExpressionTokens(rightTokens);
    
    if (!left || !right) return null;
    
    switch (op) {
        case '+': return { type: 'add', left, right };
        case '-': return { type: 'sub', left, right };
        case '*': return { type: 'mul', left, right };
        case '/': return { type: 'div', left, right };
        default: return null;
    }
}

/**
 * Compile a CalcExpr into a resolver function.
 * This creates a closure that efficiently evaluates the expression.
 * 
 * @param expr - The parsed expression AST
 * @returns A resolver function that takes context and returns a number
 */
export function compileCalcExpr(expr: CalcExpr): CalcResolver {
    switch (expr.type) {
        case 'value':
            if (expr.unit === '%') {
                const percent = expr.value;
                return (ctx) => {
                    const base = ctx.axis === 'width' ? ctx.containerWidth : ctx.containerHeight;
                    return (percent / 100) * base;
                };
            }
            // ch and none are already in terminal units
            const value = expr.value;
            return () => value;
            
        case 'add': {
            const leftFn = compileCalcExpr(expr.left);
            const rightFn = compileCalcExpr(expr.right);
            return (ctx) => leftFn(ctx) + rightFn(ctx);
        }
            
        case 'sub': {
            const leftFn = compileCalcExpr(expr.left);
            const rightFn = compileCalcExpr(expr.right);
            return (ctx) => leftFn(ctx) - rightFn(ctx);
        }
            
        case 'mul': {
            const leftFn = compileCalcExpr(expr.left);
            const rightFn = compileCalcExpr(expr.right);
            return (ctx) => leftFn(ctx) * rightFn(ctx);
        }
            
        case 'div': {
            const leftFn = compileCalcExpr(expr.left);
            const rightFn = compileCalcExpr(expr.right);
            return (ctx) => {
                const divisor = rightFn(ctx);
                if (divisor === 0) return 0; // Prevent division by zero
                return leftFn(ctx) / divisor;
            };
        }
            
        case 'min': {
            const argFns = expr.args.map(compileCalcExpr);
            return (ctx) => Math.min(...argFns.map(fn => fn(ctx)));
        }
            
        case 'max': {
            const argFns = expr.args.map(compileCalcExpr);
            return (ctx) => Math.max(...argFns.map(fn => fn(ctx)));
        }
            
        case 'clamp': {
            const minFn = compileCalcExpr(expr.min);
            const valFn = compileCalcExpr(expr.val);
            const maxFn = compileCalcExpr(expr.max);
            return (ctx) => {
                const minVal = minFn(ctx);
                const maxVal = maxFn(ctx);
                const val = valFn(ctx);
                return Math.max(minVal, Math.min(val, maxVal));
            };
        }
    }
}

/**
 * Parse a css-tree Function node and compile it to a CalcValue.
 * This is the main entry point for the stylesheet parser.
 * 
 * @param funcNode - A css-tree Function AST node
 * @param original - The original CSS string for debugging
 * @returns A CalcValue with compiled resolver, or null if parsing fails
 */
export function parseAndCompileCalc(funcNode: CssTree.CssNode, original: string): CalcValue | null {
    const expr = parseCalcNode(funcNode);
    if (!expr) return null;
    
    return {
        type: 'calc',
        original,
        resolve: compileCalcExpr(expr),
    };
}

/**
 * Supported CSS math function names.
 */
export const CALC_FUNCTION_NAMES = ['calc', 'min', 'max', 'clamp'] as const;

/**
 * Check if a function name is a supported calc function.
 */
export function isCalcFunction(name: string): boolean {
    return CALC_FUNCTION_NAMES.includes(name.toLowerCase() as typeof CALC_FUNCTION_NAMES[number]);
}


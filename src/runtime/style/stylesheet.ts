import * as csstree from 'css-tree';
import type { CliNode, Style, StyleDimension } from '../types.js';
import { canonicalizeStyleProp } from './properties.js';
import { getNodeTag } from '../utils/node.js';
import { isDialogModal } from '../dialog.js';
import { isCalcFunction, parseAndCompileCalc, type CalcValue } from './calc.js';

/**
 * Selector component types matching our internal format.
 * These are our internal selector representation types.
 */
interface TypeSelector {
    type: 'type';
    name: string;
}

interface ClassSelector {
    type: 'class';
    name: string;
}

interface IdSelector {
    type: 'id';
    name: string;
}

interface AttributeSelector {
    type: 'attribute';
    name: string;
    operation?: {
        operator: 'equal' | 'dash-match' | 'prefix' | 'suffix' | 'substring' | 'includes';
        value: string;
    };
}

interface PseudoClassSelector {
    type: 'pseudo-class';
    kind: string;
    /** For functional pseudo-classes like :nth-child(), :has() */
    argument?: string;
    /** Parsed selectors for :has() */
    selectors?: Selector[];
}

interface UniversalSelector {
    type: 'universal';
}

interface PseudoElementSelector {
    type: 'pseudo-element';
    name: string;
    /** Argument for functional pseudo-elements like ::picker(select) */
    argument?: string;
}

interface Combinator {
    type: 'combinator';
    value: 'descendant' | 'child' | 'next-sibling' | 'later-sibling';
}

type SelectorComponent =
    | TypeSelector
    | ClassSelector
    | IdSelector
    | AttributeSelector
    | PseudoClassSelector
    | PseudoElementSelector
    | UniversalSelector
    | Combinator;

type Selector = SelectorComponent[];

export interface StylesheetDeclaration {
    property: string;
    value: unknown;
    important: boolean;
}

export interface StylesheetRule {
    selectors: Selector[];
    declarations: StylesheetDeclaration[];
    order: number;
}

export interface StylesheetArtifact {
    id: string;
    rules: StylesheetRule[];
}

interface MatchedDeclaration extends StylesheetDeclaration {
    specificity: number;
    order: number;
}

const STYLESHEET_REGISTRY = new Map<string, StylesheetArtifact>();
let RULE_SEQUENCE = 0;

/**
 * Registry for CSS custom properties (CSS variables).
 * Maps stylesheet ID to a map of variable names to their values.
 */
const CUSTOM_PROPERTY_REGISTRY = new Map<string, Map<string, string>>();

/**
 * Flag to track if base styles have been registered.
 */
let baseStylesRegistered = false;

/**
 * Get the value of a CSS custom property.
 * Searches all registered stylesheets.
 */
function getCustomPropertyValue(name: string): string | undefined {
    // Search in reverse order so later stylesheets can override earlier ones
    const sheets = Array.from(CUSTOM_PROPERTY_REGISTRY.values()).reverse();
    for (const props of sheets) {
        const value = props.get(name);
        if (value !== undefined) {
            return value;
        }
    }
    return undefined;
}

/**
 * Resolve var() references in a CSS value string.
 * Supports nested var() and fallback values.
 */
function resolveVarReferences(value: string): string {
    // Match var(--name) or var(--name, fallback)
    const varPattern = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g;
    
    let result = value;
    let iterations = 0;
    const maxIterations = 10; // Prevent infinite loops from circular references
    
    while (result.includes('var(') && iterations < maxIterations) {
        result = result.replace(varPattern, (_, varName: string, fallback?: string) => {
            const resolved = getCustomPropertyValue(varName);
            if (resolved !== undefined) {
                return resolved.trim();
            }
            if (fallback !== undefined) {
                return fallback.trim();
            }
            // Return empty string if variable not found and no fallback
            return '';
        });
        iterations++;
    }
    
    return result.trim();
}

export function registerStylesheet(styleSheetId: string, cssText: string): StylesheetArtifact {
    if (!cssText || !cssText.trim()) {
        const empty = { id: styleSheetId, rules: [] };
        STYLESHEET_REGISTRY.set(styleSheetId, empty);
        return empty;
    }

    const existing = STYLESHEET_REGISTRY.get(styleSheetId);
    if (existing) {
        return existing;
    }

    const artifact: StylesheetArtifact = {
        id: styleSheetId,
        rules: [],
    };

    try {
        const ast = csstree.parse(cssText);
        
        // First pass: collect all custom property definitions
        const customProps = new Map<string, string>();
        csstree.walk(ast, {
            visit: 'Declaration',
            enter(node) {
                if (node.property.startsWith('--')) {
                    const value = csstree.generate(node.value);
                    customProps.set(node.property, value);
                }
            },
        });
        
        // Store custom properties for this stylesheet
        if (customProps.size > 0) {
            CUSTOM_PROPERTY_REGISTRY.set(styleSheetId, customProps);
        }
        
        // Second pass: parse rules with var() resolution
        csstree.walk(ast, {
            visit: 'Rule',
            enter(node) {
                if (node.type === 'Rule' && node.prelude.type === 'SelectorList') {
                    const selectors = parseSelectors(node.prelude);
                    const declarations = parseDeclarations(node.block, customProps);
                    if (declarations.length > 0) {
                        artifact.rules.push({
                            selectors,
                            declarations,
                            order: RULE_SEQUENCE++,
                        });
                    }
                }
            },
        });
    } catch (error) {
        throw new Error(`Failed to parse stylesheet ${styleSheetId}: ${(error as Error).message}`);
    }

    STYLESHEET_REGISTRY.set(styleSheetId, artifact);
    return artifact;
}

export function getRegisteredStylesheet(styleSheetId: string): StylesheetArtifact | undefined {
    return STYLESHEET_REGISTRY.get(styleSheetId);
}

export function listRegisteredStylesheets(): StylesheetArtifact[] {
    return Array.from(STYLESHEET_REGISTRY.values());
}

export function resetStylesheets(): void {
    STYLESHEET_REGISTRY.clear();
    CUSTOM_PROPERTY_REGISTRY.clear();
    RULE_SEQUENCE = 0;
    // Reset the base styles flag so they can be re-registered if needed
    baseStylesRegistered = false;
}

export function computeStylesheetStyle(node: CliNode): Partial<Style> {
    const matches = collectMatchedDeclarations(node);
    if (matches.length === 0) {
        const empty: Partial<Style> = {};
        node.__cssStyle = empty;
        return empty;
    }

    matches.sort((a, b) => {
        if (a.important !== b.important) {
            return a.important ? 1 : -1;
        }
        if (a.specificity !== b.specificity) {
            return a.specificity - b.specificity;
        }
        return a.order - b.order;
    });

    const style: Partial<Style> = {};
    for (const decl of matches) {
        applyDeclaration(style, decl.property, decl.value);
    }
    node.__cssStyle = style;
    return style;
}

/**
 * Compute styles for a pseudo-element of a node.
 * For example, `computePseudoElementStyle(liNode, 'marker')` returns the
 * computed styles from `li::marker { ... }` rules.
 * 
 * @param node - The element node
 * @param pseudoElement - The pseudo-element name (e.g., 'marker', 'before', 'after')
 * @returns Computed styles for the pseudo-element, or empty object if none match
 */
export function computePseudoElementStyle(node: CliNode, pseudoElement: string): Partial<Style> {
    const matches = collectPseudoElementDeclarations(node, pseudoElement);
    if (matches.length === 0) {
        return {};
    }

    matches.sort((a, b) => {
        if (a.important !== b.important) {
            return a.important ? 1 : -1;
        }
        if (a.specificity !== b.specificity) {
            return a.specificity - b.specificity;
        }
        return a.order - b.order;
    });

    const style: Partial<Style> = {};
    for (const decl of matches) {
        applyDeclaration(style, decl.property, decl.value);
    }
    return style;
}

/**
 * Get the pseudo-element from a selector, if any.
 * Returns the pseudo-element selector or null.
 */
function getSelectorPseudoElement(selector: Selector): PseudoElementSelector | null {
    if (selector.length === 0) return null;
    const last = selector[selector.length - 1];
    if (last.type === 'pseudo-element') {
        return last;
    }
    return null;
}

/**
 * Match a selector against a node for a specific pseudo-element.
 * For `li::marker`, this matches if the node is an `li` element.
 * For `select::picker(select)`, this matches if the node is a `select` element.
 */
function matchesSelectorForPseudoElement(
    node: CliNode,
    selector: Selector,
    pseudoElement: string
): boolean {
    // Check if this selector targets the right pseudo-element
    const selectorPseudo = getSelectorPseudoElement(selector);
    if (!selectorPseudo || selectorPseudo.name !== pseudoElement) {
        return false;
    }
    
    // For functional pseudo-elements like ::picker(select), validate the argument
    // matches the element type if specified
    if (selectorPseudo.argument) {
        const nodeTag = getNodeTag(node)?.toLowerCase();
        if (selectorPseudo.argument !== nodeTag) {
            return false;
        }
    }
    
    // Match the selector without the pseudo-element part
    // (match everything before the ::pseudo-element)
    const selectorWithoutPseudo = selector.slice(0, -1);
    if (selectorWithoutPseudo.length === 0) {
        // Selector like `::marker` (no element part) matches all applicable elements
        return true;
    }
    
    return matchFromIndex(node, selectorWithoutPseudo, selectorWithoutPseudo.length - 1);
}

/**
 * Collect matched declarations for a pseudo-element.
 */
function collectPseudoElementDeclarations(
    node: CliNode,
    pseudoElement: string
): MatchedDeclaration[] {
    const matched: MatchedDeclaration[] = [];
    for (const sheet of STYLESHEET_REGISTRY.values()) {
        for (const rule of sheet.rules) {
            for (const selector of rule.selectors) {
                if (!matchesSelectorForPseudoElement(node, selector, pseudoElement)) {
                    continue;
                }
                // Calculate specificity based on the selector without the pseudo-element
                const selectorWithoutPseudo = selector.slice(0, -1);
                const specificity = selectorWithoutPseudo.length > 0
                    ? computeSpecificity(selectorWithoutPseudo)
                    : 0;
                
                for (const decl of rule.declarations) {
                    matched.push({
                        property: decl.property,
                        value: decl.value,
                        important: decl.important,
                        specificity,
                        order: rule.order,
                    });
                }
            }
        }
    }
    return matched;
}

function collectMatchedDeclarations(node: CliNode): MatchedDeclaration[] {
    const matched: MatchedDeclaration[] = [];
    for (const sheet of STYLESHEET_REGISTRY.values()) {
        for (const rule of sheet.rules) {
            const specificity = getMatchingSpecificity(node, rule.selectors);
            const classes = node.className ?? '';
            if (specificity === null) continue;
            for (const decl of rule.declarations) {
                matched.push({
                    property: decl.property,
                    value: decl.value,
                    important: decl.important,
                    specificity,
                    order: rule.order,
                });
            }
        }
    }
    return matched;
}

function getMatchingSpecificity(node: CliNode, selectors: Selector[]): number | null {
    for (const selector of selectors) {
        if (matchesSelector(node, selector)) {
            return computeSpecificity(selector);
        }
    }
    return null;
}

/**
 * Parse a css-tree SelectorList into our internal Selector[] format.
 */
function parseSelectors(selectorList: csstree.SelectorList): Selector[] {
    const selectors: Selector[] = [];
    
    selectorList.children.forEach((selectorNode) => {
        if (selectorNode.type === 'Selector') {
            const selector: Selector = [];
            
            selectorNode.children.forEach((child) => {
                const component = parseSelectorComponent(child);
                if (component) {
                    selector.push(component);
                }
            });
            
            if (selector.length > 0) {
                selectors.push(selector);
            }
        }
    });
    
    return selectors;
}

/**
 * Parse a single css-tree selector component into our internal format.
 */
function parseSelectorComponent(node: csstree.CssNode): SelectorComponent | null {
    switch (node.type) {
        case 'TypeSelector':
            // css-tree parses * as TypeSelector with name "*"
            if (node.name === '*') {
                return { type: 'universal' };
            }
            return { type: 'type', name: node.name.toLowerCase() };
        case 'ClassSelector':
            return { type: 'class', name: node.name };
        case 'IdSelector':
            return { type: 'id', name: node.name };
        case 'AttributeSelector': {
            const result: AttributeSelector = {
                type: 'attribute',
                name: node.name.name,
            };
            if (node.matcher && node.value) {
                const valueStr = node.value.type === 'String' 
                    ? node.value.value 
                    : node.value.type === 'Identifier' 
                    ? node.value.name 
                    : '';
                result.operation = {
                    operator: mapAttributeOperator(node.matcher),
                    value: valueStr,
                };
            }
            return result;
        }
        case 'PseudoClassSelector': {
            const pseudo: PseudoClassSelector = { type: 'pseudo-class', kind: node.name };
            // Handle functional pseudo-classes with arguments
            if (node.children && node.children.size > 0) {
                pseudo.argument = generatePseudoClassArgument(node.children);
                // For relational pseudo-classes, parse the inner selectors
                if (isRelationalPseudoClass(node.name) && pseudo.argument) {
                    pseudo.selectors = parsePseudoClassSelectors(pseudo.argument);
                }
            }
            return pseudo;
        }
        case 'PseudoElementSelector': {
            const pseudoName = node.name.toLowerCase();
            // Handle functional pseudo-elements like ::picker(select)
            let argument: string | undefined;
            if (node.children) {
                const children = node.children.toArray();
                if (children.length > 0 && children[0].type === 'Raw') {
                    argument = (children[0] as { value: string }).value.toLowerCase();
                }
            }
            return { type: 'pseudo-element', name: pseudoName, argument };
        }
        case 'Combinator': {
            const value = mapCombinator(node.name);
            if (value) {
                return { type: 'combinator', value };
            }
            return null;
        }
        default:
            return null;
    }
}

/**
 * Map css-tree attribute operator to our internal format.
 */
function mapAttributeOperator(matcher: string): 'equal' | 'dash-match' | 'prefix' | 'suffix' | 'substring' | 'includes' {
    switch (matcher) {
        case '=': return 'equal';
        case '|=': return 'dash-match';
        case '^=': return 'prefix';
        case '$=': return 'suffix';
        case '*=': return 'substring';
        case '~=': return 'includes';
        default: return 'equal';
    }
}

/**
 * Map css-tree combinator to our internal format.
 */
function mapCombinator(name: string): Combinator['value'] | null {
    switch (name) {
        case ' ': return 'descendant';
        case '>': return 'child';
        case '+': return 'next-sibling';
        case '~': return 'later-sibling';
        default: return null;
    }
}

/**
 * Pseudo-classes that take selector arguments (relational pseudo-classes).
 */
const RELATIONAL_PSEUDO_CLASSES = new Set(['has', 'not', 'is', 'where']);

/**
 * Check if a pseudo-class is relational (takes selector arguments).
 */
function isRelationalPseudoClass(name: string): boolean {
    return RELATIONAL_PSEUDO_CLASSES.has(name);
}

/**
 * Generate a string representation of pseudo-class arguments from a css-tree List.
 */
function generatePseudoClassArgument(children: csstree.List<csstree.CssNode>): string {
    const parts: string[] = [];
    children.forEach((child) => {
        parts.push(csstree.generate(child));
    });
    return parts.join('').trim();
}

/**
 * Parse selector arguments for relational pseudo-classes like :has(), :not(), :is(), :where().
 * Returns parsed selectors or undefined if parsing fails.
 */
function parsePseudoClassSelectors(argument: string): Selector[] | undefined {
    try {
        const innerAst = csstree.parse(argument, { context: 'selectorList' }) as csstree.SelectorList;
        return parseSelectors(innerAst);
    } catch {
        // If parsing fails, return undefined
        return undefined;
    }
}

/**
 * Parse a css-tree Block into our internal StylesheetDeclaration[] format.
 * Also extracts and stores CSS custom properties.
 * @param block The css-tree Block node
 * @param customProps Optional map to store custom properties found in this block
 */

// Valid values for enum-style properties
const LIST_STYLE_TYPES = [
    'disc', 'circle', 'square', 'decimal', 'decimal-leading-zero',
    'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman', 'none'
] as const;

const LIST_STYLE_POSITIONS = ['inside', 'outside'] as const;

const OVERFLOW_VALUES = ['visible', 'hidden', 'scroll', 'auto'] as const;

// Known custom properties that should be processed as style declarations
const KNOWN_CUSTOM_PROPERTIES = new Set([
    // Border background styling
    '--border-background-color',
    '--border-top-background-color',
    '--border-right-background-color',
    '--border-bottom-background-color',
    '--border-left-background-color',
    '--border-top-left-background-color',
    '--border-top-right-background-color',
    '--border-bottom-left-background-color',
    '--border-bottom-right-background-color',
    // List styling
    '--list-marker-color',
    // Progress bar styling
    '--progress-bar-color',
    '--progress-track-color',
    '--progress-filled-char',
    '--progress-empty-char',
    '--meter-good-color',
    '--meter-average-color',
    '--meter-poor-color',
    '--meter-track-color',
    '--meter-filled-char',
    '--meter-empty-char',
    // Caret/cursor styling (caret-color is standard CSS, no -- prefix)
    '--caret-char',
    '--caret-inverse',
    // Placeholder styling
    '--placeholder-color',
    // Scrollbar styling
    '--scrollbar-track-color',
    '--scrollbar-thumb-color',
    '--scrollbar-track-char',
    '--scrollbar-thumb-char',
    // Scroll keyboard configuration
    '--scroll-keyboard',
    '--scroll-keys',
    '--scroll-key-up',
    '--scroll-key-down',
    '--scroll-key-page-up',
    '--scroll-key-page-down',
    '--scroll-key-half-up',
    '--scroll-key-half-down',
    '--scroll-key-top',
    '--scroll-key-bottom',
]);

function parseDeclarations(
    block: csstree.Block | null,
    customProps?: Map<string, string>
): StylesheetDeclaration[] {
    if (!block) return [];
    const declarations: StylesheetDeclaration[] = [];

    block.children.forEach((child) => {
        if (child.type === 'Declaration') {
            const property = child.property;
            const important = child.important === true;
            let value = csstree.generate(child.value);
            
            // Check if this is a custom property definition
            if (property.startsWith('--')) {
                // Store the custom property value for var() resolution
                if (customProps) {
                    customProps.set(property, value);
                }
                // Skip generic custom properties, but process our known ones
                if (!KNOWN_CUSTOM_PROPERTIES.has(property)) {
                return;
                }
            }
            
            // Resolve any var() references in the value
            if (value.includes('var(')) {
                value = resolveVarReferences(value);
        }

            declarations.push({
            property,
            value,
            important,
        });
        }
    });

    return declarations;
}

function matchesSelector(node: CliNode, selector: Selector): boolean {
    return matchFromIndex(node, selector, selector.length - 1);
}

function matchFromIndex(node: CliNode | null, selector: Selector, index: number): boolean {
    if (!node) return false;
    let current: CliNode | null = node;
    let i = index;

    while (i >= 0 && current) {
        const component = selector[i];
        if (component.type === 'combinator') {
            const nextIndex = i - 1;
            switch (component.value) {
                case 'descendant': {
                    let ancestor = current.parent;
                    while (ancestor) {
                        if (matchFromIndex(ancestor, selector, nextIndex)) {
                            return true;
                        }
                        ancestor = ancestor.parent;
                    }
                    return false;
                }
                case 'child': {
                    current = current.parent;
                    i = nextIndex;
                    continue;
                }
                case 'next-sibling': {
                    current = getPreviousSibling(current);
                    i = nextIndex;
                    continue;
                }
                case 'later-sibling': {
                    let sibling = getPreviousSibling(current);
                    while (sibling) {
                        if (matchFromIndex(sibling, selector, nextIndex)) {
                            return true;
                        }
                        sibling = getPreviousSibling(sibling);
                    }
                    return false;
                }
                default:
                    return false;
            }
        } else if (!matchesSimpleSelector(current, component)) {
            return false;
        } else {
            i -= 1;
        }
    }

    return i < 0;
}

function matchesSimpleSelector(node: CliNode, component: SelectorComponent): boolean {
    switch (component.type) {
        case 'type':
            return getNodeTag(node) === component.name;
        case 'class':
            return getClassTokens(node).includes(component.name);
        case 'id':
            return node.id === component.name;
        case 'attribute':
            return matchesAttribute(node, component);
        case 'pseudo-class':
            return matchesPseudoClass(node, component);
        case 'pseudo-element':
            // Pseudo-elements don't match nodes directly - handled separately
            return false;
        case 'universal':
            return true;
        default:
            return false;
    }
}

function matchesAttribute(
    node: CliNode,
    component: AttributeSelector
): boolean {
    const attrValue = (node as unknown as Record<string, unknown>)[component.name];
    if (!component.operation) {
        // For attribute presence selectors like [open], [disabled], etc.
        // Check if the attribute is present AND truthy (for boolean attributes)
        // or has a non-empty value (for string attributes)
        if (attrValue === undefined || attrValue === null) {
            return false;
        }
        // Boolean false means attribute is not present
        if (attrValue === false) {
            return false;
        }
        // Empty string means attribute is present (e.g., <details open="">)
        return true;
    }

        const expected = String(component.operation.value ?? '');
    const actual = String(attrValue ?? '');
    
    switch (component.operation.operator) {
        case 'equal':
            return actual.toLowerCase() === expected.toLowerCase();
        case 'dash-match':
            return actual === expected || actual.startsWith(expected + '-');
        case 'prefix':
            return actual.startsWith(expected);
        case 'suffix':
            return actual.endsWith(expected);
        case 'substring':
            return actual.includes(expected);
        case 'includes':
            return actual.split(/\s+/).includes(expected);
        default:
    return false;
    }
}

function matchesPseudoClass(
    node: CliNode,
    component: PseudoClassSelector
): boolean {
    switch (component.kind) {
        case 'focus':
            return node.__focusState === 'focused';
        case 'focus-within':
        case 'focus-inside':
            return hasFocusedDescendant(node);
        case 'focus-visible':
            // In CLI, focus-visible is same as focus (no mouse distinction)
            return node.__focusState === 'focused';
        case 'disabled':
            return !!node.disabled;
        case 'enabled':
            return !node.disabled;
        case 'checked':
            return !!node.checked;
        case 'indeterminate':
            return node.indeterminate === true;
        case 'required':
            return !!node.required;
        case 'optional':
            return !node.required;
        case 'valid':
            return node.valid !== false && !node.validationMessage;
        case 'invalid':
            return node.valid === false || !!node.validationMessage;
        case 'read-only':
            return !!node.readonly;
        case 'read-write':
            return !node.readonly && !node.disabled;
        case 'placeholder-shown':
            return isPlaceholderShown(node);
        case 'empty':
            return isEmptyNode(node);
        case 'hover':
            return node.__hoverState === 'hovered';
        case 'active':
            return node.__activeState === 'active';
        case 'first-child':
            return isFirstChild(node);
        case 'last-child':
            return isLastChild(node);
        case 'only-child':
            return isOnlyChild(node);
        case 'first-of-type':
            return isFirstOfType(node);
        case 'last-of-type':
            return isLastOfType(node);
        case 'only-of-type':
            return isOnlyOfType(node);
        case 'nth-child':
            return matchesNthChild(node, component.argument);
        case 'nth-last-child':
            return matchesNthLastChild(node, component.argument);
        case 'nth-of-type':
            return matchesNthOfType(node, component.argument);
        case 'nth-last-of-type':
            return matchesNthLastOfType(node, component.argument);
        case 'has':
            return matchesHas(node, component.selectors);
        case 'not':
            return !matchesAnySelector(node, component.selectors);
        case 'is':
        case 'where':
            return matchesAnySelector(node, component.selectors);
        case 'popover-open':
            return !!node.__popoverOpen;
        case 'modal':
            return isDialogModal(node);
        case 'root':
            return node.parent === null || node.parent === undefined;
        default:
            return false;
    }
}

function hasFocusedDescendant(node: CliNode): boolean {
    if (node.__focusState === 'focused') {
        return true;
    }
    const children = node.children ?? [];
    for (const child of children) {
        if (hasFocusedDescendant(child)) {
            return true;
        }
    }
    return false;
}

function isPlaceholderShown(node: CliNode): boolean {
    const value = node.value ?? '';
    const placeholder = node.placeholder;
    return value === '' && !!placeholder;
}

function isEmptyNode(node: CliNode): boolean {
    const children = node.children ?? [];
    if (children.length === 0) return true;
    // Check if all children are whitespace-only text nodes
    for (const child of children) {
        if (child.type === 'text') {
            const text = child.value ?? '';
            if (text.trim() !== '') return false;
        } else {
            return false;
        }
    }
    return true;
}

function isFirstChild(node: CliNode): boolean {
    const parent = node.parent;
    if (!parent || !parent.children?.length) return false;
    const elements = getElementChildren(parent);
    return elements[0] === node;
}

function isLastChild(node: CliNode): boolean {
    const parent = node.parent;
    if (!parent || !parent.children?.length) return false;
    const elements = getElementChildren(parent);
    return elements[elements.length - 1] === node;
}

function isOnlyChild(node: CliNode): boolean {
    const parent = node.parent;
    if (!parent || !parent.children?.length) return false;
    const elements = getElementChildren(parent);
    return elements.length === 1 && elements[0] === node;
}

function isFirstOfType(node: CliNode): boolean {
    const parent = node.parent;
    if (!parent || !parent.children?.length) return false;
    const nodeName = node.nodeName;
    const sameType = getElementChildren(parent).filter(c => c.nodeName === nodeName);
    return sameType[0] === node;
}

function isLastOfType(node: CliNode): boolean {
    const parent = node.parent;
    if (!parent || !parent.children?.length) return false;
    const nodeName = node.nodeName;
    const sameType = getElementChildren(parent).filter(c => c.nodeName === nodeName);
    return sameType[sameType.length - 1] === node;
}

function isOnlyOfType(node: CliNode): boolean {
    const parent = node.parent;
    if (!parent || !parent.children?.length) return false;
    const nodeName = node.nodeName;
    const sameType = getElementChildren(parent).filter(c => c.nodeName === nodeName);
    return sameType.length === 1 && sameType[0] === node;
}

function getElementChildren(parent: CliNode): CliNode[] {
    return (parent.children ?? []).filter(c => c.type !== 'text');
}

function parseNthFormula(arg: string | undefined): { a: number; b: number } | null {
    if (!arg) return null;
    const normalized = arg.trim().toLowerCase();
    if (normalized === 'odd') return { a: 2, b: 1 };
    if (normalized === 'even') return { a: 2, b: 0 };
    // Match "an+b", "an-b", "an", "n+b", "n-b", "n", or just "b"
    const match = normalized.match(/^([+-]?\d*)n([+-]\d+)?$|^([+-]?\d+)$/);
    if (!match) return null;
    if (match[3] !== undefined) {
        // Just a number
        return { a: 0, b: parseInt(match[3], 10) };
    }
    const aStr = match[1] ?? '';
    const a = aStr === '' || aStr === '+' ? 1 : aStr === '-' ? -1 : parseInt(aStr, 10);
    const b = match[2] ? parseInt(match[2], 10) : 0;
    return { a, b };
}

function matchesNthFormula(index: number, formula: { a: number; b: number }): boolean {
    const { a, b } = formula;
    if (a === 0) {
        return index === b;
    }
    const diff = index - b;
    if (a > 0) {
        return diff >= 0 && diff % a === 0;
    } else {
        return diff <= 0 && diff % a === 0;
    }
}

function matchesNthChild(node: CliNode, arg: string | undefined): boolean {
    const parent = node.parent;
    if (!parent || !parent.children?.length) return false;
    const elements = getElementChildren(parent);
    const index = elements.indexOf(node) + 1; // 1-based
    if (index === 0) return false;
    const formula = parseNthFormula(arg);
    return formula ? matchesNthFormula(index, formula) : false;
}

function matchesNthLastChild(node: CliNode, arg: string | undefined): boolean {
    const parent = node.parent;
    if (!parent || !parent.children?.length) return false;
    const elements = getElementChildren(parent);
    const index = elements.length - elements.indexOf(node); // 1-based from end
    if (index === 0) return false;
    const formula = parseNthFormula(arg);
    return formula ? matchesNthFormula(index, formula) : false;
}

function matchesNthOfType(node: CliNode, arg: string | undefined): boolean {
    const parent = node.parent;
    if (!parent || !parent.children?.length) return false;
    const nodeName = node.nodeName;
    const sameType = getElementChildren(parent).filter(c => c.nodeName === nodeName);
    const index = sameType.indexOf(node) + 1; // 1-based
    if (index === 0) return false;
    const formula = parseNthFormula(arg);
    return formula ? matchesNthFormula(index, formula) : false;
}

function matchesNthLastOfType(node: CliNode, arg: string | undefined): boolean {
    const parent = node.parent;
    if (!parent || !parent.children?.length) return false;
    const nodeName = node.nodeName;
    const sameType = getElementChildren(parent).filter(c => c.nodeName === nodeName);
    const index = sameType.length - sameType.indexOf(node); // 1-based from end
    if (index === 0) return false;
    const formula = parseNthFormula(arg);
    return formula ? matchesNthFormula(index, formula) : false;
}

function matchesHas(node: CliNode, selectors: Selector[] | undefined): boolean {
    if (!selectors || selectors.length === 0) return false;
    // :has() matches if any descendant matches the selector
    const descendants = collectDescendants(node);
    for (const selector of selectors) {
        for (const desc of descendants) {
            if (matchesSelector(desc, selector)) {
                return true;
            }
        }
    }
    return false;
}

function matchesAnySelector(node: CliNode, selectors: Selector[] | undefined): boolean {
    if (!selectors || selectors.length === 0) return false;
    for (const selector of selectors) {
        if (matchesSelector(node, selector)) {
            return true;
        }
    }
    return false;
}

function collectDescendants(node: CliNode): CliNode[] {
    const result: CliNode[] = [];
    const children = node.children ?? [];
    for (const child of children) {
        result.push(child);
        result.push(...collectDescendants(child));
    }
    return result;
}

function computeSpecificity(selector: Selector): number {
    let ids = 0;
    let classes = 0;
    let elements = 0;
    for (const component of selector) {
        switch (component.type) {
            case 'id':
                ids += 1;
                break;
            case 'class':
            case 'attribute':
            case 'pseudo-class':
                classes += 1;
                break;
            case 'type':
            case 'pseudo-element':
                // Pseudo-elements have the same specificity as type selectors
                elements += 1;
                break;
            default:
                break;
        }
    }
    return (ids << 16) + (classes << 8) + elements;
}

function getPreviousSibling(node: CliNode): CliNode | null {
    const parent = node.parent;
    if (!parent || !parent.children?.length) {
        return null;
    }
    const index = parent.children.indexOf(node);
    if (index <= 0) {
        return null;
    }
    return parent.children[index - 1];
}

function getClassTokens(node: CliNode): string[] {
    const className = String(node.className || '');
    if (!className.trim()) return [];
    return className
        .split(/\s+/g)
        .map((token) => token.trim())
        .filter(Boolean);
}

function applyDeclaration(style: Partial<Style>, property: string, rawValue: unknown): void {
    const lower = property.toLowerCase();
    switch (lower) {
        case 'color':
            assignColor(style, 'color', rawValue);
            return;
        case 'background':
            assignBackgroundShorthand(style, rawValue);
            return;
        case 'background-color':
            assignColor(style, 'backgroundColor', rawValue);
            return;
        case 'border':
            assignBorderShorthand(style, rawValue);
            return;
        case '--border-background-color':
            assignColor(style, 'borderBackgroundColor', rawValue);
            return;
        case '--border-top-background-color':
            assignColor(style, 'borderTopBackgroundColor', rawValue);
            return;
        case '--border-right-background-color':
            assignColor(style, 'borderRightBackgroundColor', rawValue);
            return;
        case '--border-bottom-background-color':
            assignColor(style, 'borderBottomBackgroundColor', rawValue);
            return;
        case '--border-left-background-color':
            assignColor(style, 'borderLeftBackgroundColor', rawValue);
            return;
        case '--border-top-left-background-color':
            assignColor(style, 'borderTopLeftBackgroundColor', rawValue);
            return;
        case '--border-top-right-background-color':
            assignColor(style, 'borderTopRightBackgroundColor', rawValue);
            return;
        case '--border-bottom-left-background-color':
            assignColor(style, 'borderBottomLeftBackgroundColor', rawValue);
            return;
        case '--border-bottom-right-background-color':
            assignColor(style, 'borderBottomRightBackgroundColor', rawValue);
            return;
        case 'border-color': {
            const multi = extractMultiSideColor(rawValue);
            if (multi) {
                assignColor(style, 'borderColor', multi);
            } else {
                assignColor(style, 'borderColor', rawValue);
            }
            return;
        }
        case 'border-top-color':
            assignColor(style, 'borderColor', rawValue);
            return;
        case 'border-right-color':
            assignColor(style, 'borderColor', rawValue);
            return;
        case 'border-bottom-color':
            assignColor(style, 'borderColor', rawValue);
            return;
        case 'border-left-color':
            assignColor(style, 'borderColor', rawValue);
            return;
        case 'border-style':
            style.borderStyle = normalizeBorderStyle(rawValue);
            return;
        case 'font-weight':
            style.bold = normalizeFontWeight(rawValue);
            return;
        case 'font-style':
            style.italic = String(rawValue || '').toLowerCase().includes('italic');
            return;
        case 'text-align': {
            const normalized = String(rawValue ?? '').toLowerCase();
            if (normalized === 'left' || normalized === 'center' || normalized === 'right') {
                style.textAlign = normalized;
            } else if (normalized === 'start') {
                style.textAlign = 'left';
            } else if (normalized === 'end') {
                style.textAlign = 'right';
            }
            return;
        }
        case 'object-fit': {
            const normalized = String(rawValue ?? '').toLowerCase();
            if (normalized === 'fill' || normalized === 'contain' || normalized === 'cover' || 
                normalized === 'none' || normalized === 'scale-down') {
                style.objectFit = normalized;
            }
            return;
        }
        case 'text-decoration':
            assignTextDecoration(style, rawValue);
            return;
        case 'margin':
            assignBoxEdges(style, 'margin', rawValue);
            return;
        case 'padding':
            assignBoxEdges(style, 'padding', rawValue);
            return;
        case 'margin-top':
        case 'margin-right':
        case 'margin-bottom':
        case 'margin-left':
        case 'padding-top':
        case 'padding-right':
        case 'padding-bottom':
        case 'padding-left': {
            const canonical = canonicalizeStyleProp(property);
            const length = normalizeLength(rawValue);
            if (canonical && length !== undefined) {
                setStyleProp(style, canonical, length);
            }
            return;
        }
        case 'gap': {
            // csstree returns gap as a string: "10px" or "10px 20px" (row column)
            const parts = String(rawValue ?? '').trim().split(/\s+/);
            const rowGap = normalizeLength(parts[0]);
            const colGap = parts.length > 1 ? normalizeLength(parts[1]) : rowGap;
                    if (rowGap !== undefined) {
                        style.rowGap = rowGap as number;
                    }
                    if (colGap !== undefined) {
                        style.columnGap = colGap as number;
            }
            return;
        }
        case 'row-gap':
        case 'column-gap':
        case 'width':
        case 'height':
        case 'min-width':
        case 'min-height':
        case 'max-width':
        case 'max-height':
        case 'top':
        case 'left':
        case 'right':
        case 'bottom': {
            const canonical = canonicalizeStyleProp(property);
            const length = normalizeLength(rawValue);
            if (canonical && length !== undefined) {
                setStyleProp(style, canonical, length);
            }
            return;
        }
        case 'flex-direction':
        case 'flex-wrap':
        case 'justify-content':
        case 'align-items':
        case 'align-self':
        case 'align-content': {
            const canonical = canonicalizeStyleProp(property);
            if (canonical) {
                setStyleProp(style, canonical, String(rawValue ?? '').toLowerCase());
            }
            return;
        }
        case 'display':
            assignEnum(style, 'display', rawValue, ['none', 'flex'] as const);
            return;
        case 'position':
            assignEnum(style, 'position', rawValue, ['absolute', 'relative', 'fixed'] as const);
            return;
        case 'z-index': {
            const value = normalizeZIndex(rawValue);
            if (value !== undefined) {
                style.zIndex = value;
            }
            return;
        }
        case 'list-style-type':
            assignEnum(style, 'listStyleType', rawValue, LIST_STYLE_TYPES);
            return;
        case 'list-style-position':
            assignEnum(style, 'listStylePosition', rawValue, LIST_STYLE_POSITIONS);
            return;
        case 'list-style': {
            // Shorthand: list-style: <type> <position>
            for (const part of String(rawValue ?? '').toLowerCase().trim().split(/\s+/)) {
                assignEnum(style, 'listStyleType', part, LIST_STYLE_TYPES);
                assignEnum(style, 'listStylePosition', part, LIST_STYLE_POSITIONS);
            }
            return;
        }
        case 'content':
            // CSS content property for ::marker, ::before, ::after
            // Supports: none, "string", or 'string'
            style.content = String(rawValue ?? '');
            return;
        case '--list-marker-color': {
            assignColor(style, 'listMarkerColor', rawValue);
            return;
        }
        // Progress element properties
        case '--progress-bar-color': {
            assignColor(style, 'progressBarColor', rawValue);
            return;
        }
        case '--progress-track-color': {
            assignColor(style, 'progressTrackColor', rawValue);
            return;
        }
        case '--progress-filled-char':
            assignString(style, 'progressFilledChar', rawValue);
            return;
        case '--progress-empty-char':
            assignString(style, 'progressEmptyChar', rawValue);
            return;
        // Meter element styling
        case '--meter-good-color':
            assignColor(style, 'meterGoodColor', rawValue);
            return;
        case '--meter-average-color':
            assignColor(style, 'meterAverageColor', rawValue);
            return;
        case '--meter-poor-color':
            assignColor(style, 'meterPoorColor', rawValue);
            return;
        case '--meter-track-color':
            assignColor(style, 'meterTrackColor', rawValue);
            return;
        case '--meter-filled-char':
            assignString(style, 'meterFilledChar', rawValue);
            return;
        case '--meter-empty-char':
            assignString(style, 'meterEmptyChar', rawValue);
            return;
        // Caret properties (for inputs/textareas)
        // Note: caret-color is standard CSS, but we also support it
        case 'caret-color': {
            assignColor(style, 'caretColor', rawValue);
            return;
        }
        case '--caret-char':
            assignString(style, 'caretChar', rawValue);
            return;
        case '--caret-inverse':
            assignBool(style, 'caretInverse', rawValue);
            return;
        // Placeholder color
        case '--placeholder-color': {
            assignColor(style, 'placeholderColor', rawValue);
            return;
        }
        // Overflow properties
        case 'overflow':
            assignEnum(style, 'overflow', rawValue, OVERFLOW_VALUES);
            return;
        case 'overflow-x':
            assignEnum(style, 'overflowX', rawValue, OVERFLOW_VALUES);
            return;
        case 'overflow-y':
            assignEnum(style, 'overflowY', rawValue, OVERFLOW_VALUES);
            return;
        case 'scroll-behavior':
            assignEnum(style, 'scrollBehavior', rawValue, ['smooth', 'auto'] as const);
            return;
        // Scrollbar custom properties
        case '--scrollbar-track-color': {
            assignColor(style, 'scrollbarTrackColor', rawValue);
            return;
        }
        case '--scrollbar-thumb-color': {
            assignColor(style, 'scrollbarThumbColor', rawValue);
            return;
        }
        case '--scrollbar-track-char':
            assignString(style, 'scrollbarTrackChar', rawValue);
            return;
        case '--scrollbar-thumb-char':
            assignString(style, 'scrollbarThumbChar', rawValue);
            return;
        // Scroll keyboard configuration properties
        case '--scroll-keyboard':
            assignEnum(style, 'scrollKeyboard', rawValue, ['auto', 'enabled', 'disabled'] as const);
            return;
        case '--scroll-keys':
            assignString(style, 'scrollKeys', rawValue);
            return;
        case '--scroll-key-up':
            assignString(style, 'scrollKeyUp', rawValue);
            return;
        case '--scroll-key-down':
            assignString(style, 'scrollKeyDown', rawValue);
            return;
        case '--scroll-key-page-up':
            assignString(style, 'scrollKeyPageUp', rawValue);
            return;
        case '--scroll-key-page-down':
            assignString(style, 'scrollKeyPageDown', rawValue);
            return;
        case '--scroll-key-half-up':
            assignString(style, 'scrollKeyHalfUp', rawValue);
            return;
        case '--scroll-key-half-down':
            assignString(style, 'scrollKeyHalfDown', rawValue);
            return;
        case '--scroll-key-top':
            assignString(style, 'scrollKeyTop', rawValue);
            return;
        case '--scroll-key-bottom':
            assignString(style, 'scrollKeyBottom', rawValue);
            return;
        default:
            break;
    }

    const canonical = canonicalizeStyleProp(property);
    if (canonical) {
        if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
            setStyleProp(style, canonical, rawValue);
        }
    }
}

function assignColor(style: Partial<Style>, target: keyof Style, value: unknown): void {
    const resolved = normalizeColor(Array.isArray(value) ? tokensToCss(value) : value);
    if (resolved) {
        setStyleProp(style, target, resolved);
    }
}

/**
 * Assign a string property value, stripping surrounding quotes if present.
 */
function assignString(style: Partial<Style>, target: string, value: unknown): void {
    const val = String(value ?? '').trim();
    if (val.length > 0) {
        setStyleProp(style, target, val.replace(/^["']|["']$/g, ''));
    }
}

/**
 * Assign an enum property value if it matches one of the valid values.
 */
/**
 * Type-safe setter for dynamic style properties.
 * Uses Record cast internally to allow dynamic key access.
 */
function setStyleProp(style: Partial<Style>, key: string, value: unknown): void {
    (style as Record<string, unknown>)[key] = value;
}

function assignEnum<T extends string>(
    style: Partial<Style>,
    target: string,
    value: unknown,
    validValues: readonly T[]
): void {
    const val = String(value ?? '').toLowerCase().trim() as T;
    if (validValues.includes(val)) {
        setStyleProp(style, target, val);
    }
}

/**
 * Assign a boolean property from various truthy/falsy string representations.
 */
function assignBool(style: Partial<Style>, target: string, value: unknown): void {
    const val = String(value ?? '').toLowerCase().trim();
    if (val === 'true' || val === '1' || val === 'yes') {
        setStyleProp(style, target, true);
    } else if (val === 'false' || val === '0' || val === 'no' || val === 'none') {
        setStyleProp(style, target, false);
    }
}

function extractMultiSideColor(value: unknown): unknown {
    if (value && typeof value === 'object') {
        const obj = value as Record<string, any>;
        if (obj.top) {
            return obj.top;
        }
    }
    return undefined;
}

function assignBackgroundShorthand(style: Partial<Style>, value: unknown): void {
    // Handle string values from css-tree
    if (typeof value === 'string') {
        // Simple case: just a color
        assignColor(style, 'backgroundColor', value);
        return;
    }
    if (!Array.isArray(value) || value.length === 0) return;
    const entry = value[0] as Record<string, any>;
    assignColor(style, 'backgroundColor', entry.color);
}

function assignBorderShorthand(style: Partial<Style>, value: unknown): void {
    // Handle string values from css-tree (e.g., "1px solid red")
    if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase();
        
        // Handle "border: none" and "border: 0" as shorthand to disable borders
        if (trimmed === 'none' || trimmed === '0' || trimmed === '0px') {
            style.borderStyle = 'none';
            return;
        }
        
        const parts = trimmed.split(/\s+/);
        for (const part of parts) {
            if (['solid', 'dashed', 'dotted', 'double', 'none', 'groove'].includes(part)) {
                style.borderStyle = normalizeBorderStyle(part);
            } else if (!part.match(/^\d/)) {
                // Not a number, assume it's a color
                assignColor(style, 'borderColor', part);
            }
        }
        return;
    }
    if (!value || typeof value !== 'object') return;
    const border = value as Record<string, any>;
    if (border.color) assignColor(style, 'borderColor', border.color);
    if (border.style) style.borderStyle = normalizeBorderStyle(border.style);
}

function assignTextDecoration(style: Partial<Style>, value: unknown): void {
    const text = String(value ?? '').toLowerCase();
    if (text.includes('underline')) style.underline = true;
    if (text.includes('line-through')) style.strikethrough = true;
}

function assignBoxEdges(style: Partial<Style>, base: 'margin' | 'padding', value: unknown): void {
    // Handle string values from css-tree (e.g., "10px 20px" or "1ch 2ch 3ch 4ch")
    if (typeof value === 'string') {
        const parts = value.trim().split(/\s+/);
        if (parts.length === 1) {
            const v = normalizeLength(parts[0]);
            setEdge(style, `${base}Top`, v);
            setEdge(style, `${base}Right`, v);
            setEdge(style, `${base}Bottom`, v);
            setEdge(style, `${base}Left`, v);
        } else if (parts.length === 2) {
            const vertical = normalizeLength(parts[0]);
            const horizontal = normalizeLength(parts[1]);
            setEdge(style, `${base}Top`, vertical);
            setEdge(style, `${base}Right`, horizontal);
            setEdge(style, `${base}Bottom`, vertical);
            setEdge(style, `${base}Left`, horizontal);
        } else if (parts.length === 3) {
            setEdge(style, `${base}Top`, normalizeLength(parts[0]));
            setEdge(style, `${base}Right`, normalizeLength(parts[1]));
            setEdge(style, `${base}Bottom`, normalizeLength(parts[2]));
            setEdge(style, `${base}Left`, normalizeLength(parts[1]));
        } else if (parts.length >= 4) {
            setEdge(style, `${base}Top`, normalizeLength(parts[0]));
            setEdge(style, `${base}Right`, normalizeLength(parts[1]));
            setEdge(style, `${base}Bottom`, normalizeLength(parts[2]));
            setEdge(style, `${base}Left`, normalizeLength(parts[3]));
        }
        return;
    }
    if (!value || typeof value !== 'object') return;
    const box = value as Record<string, any>;
    setEdge(style, `${base}Top`, normalizeLength(box.top));
    setEdge(style, `${base}Right`, normalizeLength(box.right));
    setEdge(style, `${base}Bottom`, normalizeLength(box.bottom));
    setEdge(style, `${base}Left`, normalizeLength(box.left));
}

function setEdge(style: Partial<Style>, key: string, val: StyleDimension | undefined): void {
    if (val === undefined) return;
    setStyleProp(style, key, val);
}

function normalizeLength(value: unknown): StyleDimension | undefined {
    if (value == null) return undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        
        // Check if this is a calc/min/max/clamp function - parse it
        const calcMatch = trimmed.match(/^(calc|min|max|clamp)\s*\(/i);
        if (calcMatch) {
            // Re-parse the string to get the AST
            try {
                const ast = csstree.parse(`x{v:${trimmed}}`, { context: 'stylesheet' });
                let funcNode: csstree.CssNode | null = null;
                csstree.walk(ast, {
                    enter(node: csstree.CssNode) {
                        if (node.type === 'Function' && isCalcFunction(node.name)) {
                            funcNode = node;
                        }
                    }
                });
                if (funcNode) {
                    const calcValue = parseAndCompileCalc(funcNode, trimmed);
                    if (calcValue) {
                        return calcValue;
                    }
                }
            } catch {
                // Parse failed, fall through to string handling
            }
        }
        
        if (trimmed.endsWith('%')) {
            const percent = parseFloat(trimmed);
            if (!Number.isNaN(percent)) {
                return `${percent}%`;
            }
            return trimmed;
        }
        if (trimmed.endsWith('ch')) {
            const cols = parseFloat(trimmed.slice(0, -2));
            if (!Number.isNaN(cols)) {
                return cols;
            }
        }
        const num = Number(trimmed);
        return Number.isNaN(num) ? undefined : num;
    }
    if (typeof value === 'object') {
        const obj = value as Record<string, any>;
        
        // Handle css-tree Function nodes (calc, min, max, clamp)
        if (obj.type === 'Function' && typeof obj.name === 'string' && isCalcFunction(obj.name)) {
            const cssNode = obj as csstree.CssNode;
            const original = csstree.generate(cssNode);
            const calcValue = parseAndCompileCalc(cssNode, original);
            if (calcValue) {
                return calcValue;
            }
        }
        
        if (obj.type === 'percentage' || obj.unit === '%') {
            const percentValue = typeof obj.value === 'number' ? obj.value : Number(obj.value);
            if (Number.isFinite(percentValue)) {
                return `${percentValue * 100}%`;
            }
        }
        if (obj.unit && typeof obj.value === 'number' && obj.unit !== '%') {
            return obj.value;
        }
        if (typeof obj.value === 'number') return obj.value;
        if (obj.type === 'dimension') {
            return normalizeLength(obj.value);
        }
        if (obj.type === 'percentage') {
            const percentValue = typeof obj.value === 'number' ? obj.value : Number(obj.value);
            if (Number.isFinite(percentValue)) {
                return `${percentValue * 100}%`;
            }
        }
        if (obj.type === 'length' || obj.type === 'length-percentage') {
            return normalizeLength(obj.value);
        }
    }
    return undefined;
}

function normalizeFontWeight(value: unknown): boolean | undefined {
    if (typeof value === 'number') {
        return value >= 600;
    }
    const text = String(value ?? '').toLowerCase();
    if (!text) return undefined;
    if (text === 'bold' || text === 'bolder') return true;
    if (text === 'normal' || text === 'lighter') return false;
    return undefined;
}

function normalizeBorderStyle(value: unknown): Style['borderStyle'] {
    const normalized = String(value ?? '').toLowerCase().trim();
    switch (normalized) {
        case 'double':
            return 'double';
        case 'round':
            return 'round';
        case 'bold':
            return 'bold';
        case 'dashed':
        case 'groove':
            return 'classic';
        case 'dotted':
            return 'dotted';
        case 'none':
        case '0':
        case '0px':
            return 'none';
        default:
            return 'single';
    }
}

/**
 * Normalize CSS overflow property value.
 */
const ANSI_COLORS = [
    { name: 'black', r: 0, g: 0, b: 0 },
    { name: 'red', r: 205, g: 0, b: 0 },
    { name: 'green', r: 0, g: 205, b: 0 },
    { name: 'yellow', r: 205, g: 205, b: 0 },
    { name: 'blue', r: 0, g: 0, b: 205 },
    { name: 'magenta', r: 205, g: 0, b: 205 },
    { name: 'cyan', r: 0, g: 205, b: 205 },
    { name: 'white', r: 229, g: 229, b: 229 },
];

function normalizeColor(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed || trimmed === 'inherit' || trimmed === 'initial') return undefined;
        return trimmed;
    }
    if (typeof value === 'object') {
        const obj = value as Record<string, any>;
        if (obj.type === 'rgb') {
            const r = obj.r ?? 0;
            const g = obj.g ?? 0;
            const b = obj.b ?? 0;
            return `rgb(${r}, ${g}, ${b})`;
        }
        if (obj.color) {
            return normalizeColor(obj.color);
        }
    }
    return undefined;
}

function normalizeZIndex(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function serializeUnparsedTokens(tokens: any[]): string {
    return tokens
        .map((token) => {
            if (token.type === 'token' && token.value) {
                const data = token.value;
                if (data.type === 'hash' && typeof data.value === 'string') {
                    return `#${data.value}`;
                }
                if (typeof data.value === 'string') {
                    return data.value;
                }
                if (typeof data.value === 'number') {
                    return String(data.value);
                }
            }
            return '';
        })
        .join(' ')
        .trim();
}

function tokensToCss(tokens: any[]): string {
    const parts: string[] = [];
    for (const token of tokens) {
        if (token.type === 'token' && token.value) {
            const data = token.value;
            switch (data.type) {
                case 'hash':
                    parts.push(`#${data.value}`);
                    break;
                case 'ident':
                case 'string':
                    parts.push(data.value ?? '');
                    break;
                case 'number':
                    parts.push(String(data.value ?? ''));
                    break;
                case 'dimension':
                    parts.push(`${data.value ?? ''}${data.unit ?? ''}`);
                    break;
                case 'percentage':
                    parts.push(`${data.value ?? ''}%`);
                    break;
                default:
                    if (typeof data.value === 'string') {
                        parts.push(data.value);
                    }
                    break;
            }
        } else if (token.type === 'color' && token.value) {
            parts.push(colorObjectToCss(token.value));
        } else if (token.type === 'function' && token.value) {
            const name = token.value.name ?? '';
            const inner = tokensToCss(token.value.value ?? []);
            parts.push(`${name}(${inner})`);
        } else if (typeof token === 'string') {
            parts.push(token);
        }
    }
    return parts.join('').trim();
}

function colorObjectToCss(color: any): string {
    if (!color) return '';
    if (color.type === 'rgb') {
        const { r = 0, g = 0, b = 0, alpha = 1 } = color;
        if (alpha !== 1) {
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return `rgb(${r}, ${g}, ${b})`;
    }
    return '';
}

/**
 * Register the base stylesheet when needed.
 * Called automatically by mount.ts and can be called manually for tests.
 */
import { BASE_STYLESHEET } from './defaults.js';

export function ensureBaseStyles(): void {
    if (baseStylesRegistered) {
        return;
    }
    registerStylesheet('sveltty:base', BASE_STYLESHEET);
    baseStylesRegistered = true;
}

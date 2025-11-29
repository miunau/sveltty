/**
 * Template operations for CLI rendering
 * Replaces DOM template functions with CLI node tree operations
 */

import type { CliNode, TextNode, CommentNode } from '../types.js';
import { create_text as create_text_node, create_element, create_comment, append as append_node, insert as insert_node, set_text, clear_children } from '../operations.js';
import { set_attribute } from './attributes.js';
import { scheduleRender } from '../mount.js';
import { registerFocusable } from '../focus.js';
import { active_effect } from 'svelte/internal/client';
import { Window } from 'happy-dom';
import { decodeHtmlEntities } from './entities.js';

/**
 * Track which nodes belong to the current effect
 * This is critical for cleanup and updates
 */
function assign_nodes(start: CliNode | null, end: CliNode | null = null): void {
    const effect = active_effect;
    if (effect && effect.nodes_start === null) {
        effect.nodes_start = start;
        effect.nodes_end = end || start;
    }
}

/**
 * Create and append a text node
 * Replaces: $.text()
 */
export function text(value: string = ''): TextNode {
    const stringValue = String(value);
    const node = create_text_node(stringValue);

    Object.defineProperty(node, 'textContent', {
        get() {
            return this.value;
        },
        set(val: string) {
            this.value = String(val);
        },
        enumerable: true,
        configurable: true,
    });

    // Track in active effect
    assign_nodes(node, node);

    return node;
}

/**
 * Create a comment node (invisible anchor)
 * Replaces: $.comment()
 */
export function comment(): CommentNode {
    const node = create_comment();

    // Track in active effect
    assign_nodes(node, node);

    return node;
}

/**
 * Append dom before anchor
 * Replaces: $.append()
 *
 * In Svelte's DOM: anchor.before(dom)
 * For CLI: we insert before the anchor
 */
export function append(anchor: CliNode | null, dom: CliNode | CliNode[]): void {
    if (!anchor) {
        return;
    }

    const parent = anchor.parent ?? anchor;
    const nodes = Array.isArray(dom) ? dom : [dom];

    for (const node of nodes) {
        insert_node(parent, node, anchor.parent ? anchor : null);
    }
}

/**
 * Build CLI tree from structure array
 * Replaces: $.from_tree()
 *
 * This is called by compiled Svelte when using static templates
 */
export function from_tree(structure: unknown[]): CliNode {
    // Structure format: [type, ...args, children]
    const [type, ...rest] = structure;

    if (type === 'text') {
        return create_text_node(String(rest[0] ?? ''));
    }

    // For elements
    const element = create_element(String(type ?? 'box'));

    // Last item might be children array
    const lastItem = rest[rest.length - 1];
    if (Array.isArray(lastItem)) {
        const children = lastItem;
        for (const childStructure of children) {
            if (Array.isArray(childStructure)) {
                const child = from_tree(childStructure);
                append_node(element, child);
            } else if (typeof childStructure === 'string') {
                const textNode = create_text_node(childStructure);
                append_node(element, textNode);
            }
        }
    }

    return element;
}

/**
 * Parse HTML string into CLI nodes using happy-dom for correctness
 */
let parserWindow: Window | null = null;

function getParserDocument() {
    if (!parserWindow) {
        parserWindow = new Window();
    }
    return parserWindow.document;
}

function parse_template(html: string): CliNode[] {
    const nodes: CliNode[] = [];
    const parserDocument = getParserDocument();
    const container = parserDocument.createElement('div');
    container.innerHTML = html;

    const convert = (domNode: any): CliNode | null => {
        if (!domNode) return null;

        // Text node
        if (domNode.nodeType === 3) {
            // Decode HTML entities that Happy DOM doesn't handle
            const rawText = domNode.textContent ?? '';
            const decodedText = decodeHtmlEntities(rawText);
            const textNode = create_text_node(decodedText);
            add_text_content_property(textNode);
            return textNode;
        }

        // Comment node (used as anchor for child components)
        if (domNode.nodeType === 8) {
            const commentNode = create_comment();
            return commentNode;
        }

        // Skip non-element nodes
        if (domNode.nodeType !== 1) {
            return null;
        }

        const tag = domNode.tagName?.toLowerCase?.() || 'box';
        const element = create_element(tag, true);
        add_text_content_property(element);

        // Apply attributes
        if (domNode.attributes) {
            const staticAttrs: Record<string, string> = {};
            for (const item of Array.from(domNode.attributes)) {
                const attr = item as Attr;
                const value = attr.value ?? '';
                set_attribute(element, attr.name, value);
                staticAttrs[attr.name] = value;
            }
            element.__staticAttrs = staticAttrs;
        }

        // Convert children
        for (const child of Array.from(domNode.childNodes)) {
            const converted = convert(child);
            if (converted) {
                append_node(element, converted);
            }
        }

        return element;
    };

    for (const child of Array.from(container.childNodes)) {
        const converted = convert(child);
        if (converted) nodes.push(converted);
    }

    return nodes;
}

/**
 * Add textContent property to a node for Svelte compatibility
 */
function add_text_content_property(node: CliNode): void {
    if (node.type === 'text') {
        Object.defineProperty(node, 'textContent', {
            get() {
                return this.value;
            },
            set(val: string) {
                // Use set_text to update value and Yoga measure function
                set_text(this as TextNode, String(val));
                // Schedule a re-render
                scheduleRender();
            },
            enumerable: true,
            configurable: true,
        });
    } else {
        // For box/container nodes, textContent gets/sets all text content
        Object.defineProperty(node, 'textContent', {
            get() {
                const nodes: CliNode[] =
                    (((this as CliNode & { childNodes?: CliNode[] }).childNodes as CliNode[]) ?? []);
                return nodes
                    .filter((c: CliNode) => c.type === 'text')
                    .map((c: TextNode) => c.value)
                    .join('');
            },
            set(val: string) {
                clear_children(this as CliNode);
                if (val) {
                    const textNode = create_text_node(String(val));
                    add_text_content_property(textNode);
                    append_node(this as CliNode, textNode);
                }
            },
            enumerable: true,
            configurable: true,
        });
    }
}

/**
 * Parse HTML and return a FACTORY FUNCTION
 * Replaces: $.from_html()
 *
 * Following Svelte's pattern: returns () => Node
 */
export function from_html(content: string, flags: number): () => CliNode {
    let cached: CliNode[] | null = null;

    return () => {
        // Parse template on first call
        if (cached === null) {
            cached = parse_template(content);
        }

        // Clone nodes for each component instance
        const cloned = cached.map(node => clone_node_deep(node));

        // If multiple root nodes, wrap in a fragment container
        if (cloned.length > 1) {
            const fragment = create_element('fragment');
            for (const node of cloned) {
                append_node(fragment, node);
            }
            assign_nodes(fragment, fragment);
            return fragment;
        }

        // Single node - return it directly
        const node = cloned[0];
        assign_nodes(node, node);
        return node;
    };
}

/**
 * Parse SVG and return a FACTORY FUNCTION
 * Replaces: $.from_svg()
 */
export function from_svg(content: string, flags: number): () => CliNode {
    // For CLI, SVG is treated same as HTML
    return from_html(content, flags);
}

/**
 * Parse MathML and return a FACTORY FUNCTION
 * Replaces: $.from_mathml()
 */
export function from_mathml(content: string, flags: number): () => CliNode {
    return from_html(content, flags);
}

/**
 * Deep clone a CLI node and its children
 * IMPORTANT: Creates fresh Yoga nodes for each clone
 */
function clone_node_deep(node: CliNode): CliNode {
    if (node.type === 'text') {
        const cloned = create_text_node((node as TextNode).value);
        add_text_content_property(cloned);
        Object.assign(cloned.style, node.style);
        return cloned;
    }

    // Comment nodes are used as anchors for child components
    if (node.type === 'comment') {
        return create_comment();
    }

    const cloned = create_element(node.nodeName?.toLowerCase?.() ?? 'box', true);
    add_text_content_property(cloned);
    Object.assign(cloned.style, node.style);
    cloned.focusable = node.focusable;
    cloned.inputType = node.inputType;
    // Template clones are always box nodes (never root)
    cloned.type = node.type === 'root' ? 'box' : node.type;
    const staticAttrs = node.__staticAttrs as Record<string, string> | undefined;
    if (staticAttrs) {
        for (const [key, value] of Object.entries(staticAttrs)) {
            set_attribute(cloned, key, value);
        }
    }

    const children: CliNode[] = (node.childNodes ?? []) as CliNode[];
    for (const child of children) {
        const clonedChild = clone_node_deep(child);
        append_node(cloned, clonedChild);
    }
    
    if (node.focusable) {
        registerFocusable(cloned);
    }

    return cloned;
}

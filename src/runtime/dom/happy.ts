import { Window } from 'happy-dom';
import type { CliNode } from '../types.js';

const happyWindow = new Window();
const happyDocument = happyWindow.document;

const CLI_TO_DOM = new WeakMap<CliNode, Node>();
const DOM_TO_CLI = new WeakMap<Node, CliNode>();
const DOM_FALLBACK_VALUES = new WeakMap<CliNode, Record<string, unknown>>();

export interface DomPropertyBridge {
    property: string;
    domProperty?: string;
    readOnly?: boolean;
    transform?: {
        get?(raw: unknown, dom: Node | null): unknown;
        set?(value: unknown, dom: Node | null): unknown;
    };
}

/**
 * Link a CLI node to its associated DOM node.
 * Uses unknown to handle happy-dom type hierarchy issues.
 */
export function linkDomNode(cliNode: CliNode, domNode: unknown): void {
    CLI_TO_DOM.set(cliNode, domNode as Node);
    DOM_TO_CLI.set(domNode as Node, cliNode);
}

export function getDomNode(node: CliNode | null | undefined): Node | null {
    if (!node) return null;
    return CLI_TO_DOM.get(node) ?? null;
}

/**
 * Get the associated DOM element for a CLI node.
 * Returns null for text nodes (which have Text nodes, not Elements).
 * For element nodes (box, root), returns the HTMLElement.
 */
export function getDomElement(node: CliNode | null | undefined): HTMLElement | null {
    if (!node || node.type === 'text' || node.type === 'comment') return null;
    const dom = CLI_TO_DOM.get(node);
    return (dom as HTMLElement) ?? null;
}

export function getCliNode<T extends CliNode = CliNode>(dom: Node | null | undefined): T | null {
    if (!dom) return null;
    return (DOM_TO_CLI.get(dom) as T | undefined) ?? null;
}

export function getCliParent(node: CliNode | null | undefined): CliNode | null {
    if (!node) return null;
    const dom = getDomNode(node);
    if (!dom) return null;
    return getCliNode(dom.parentNode);
}

export function getCliChildren(node: CliNode | null | undefined): CliNode[] {
    if (!node) return [];
    const dom = getDomNode(node);
    if (!dom) return [];
    const domChildren = Array.from<Node>(dom.childNodes ?? []);
    return domChildren
        .map(child => getCliNode(child))
        .filter((child): child is CliNode => Boolean(child));
}

export function attachDomBridge(node: CliNode): void {
    if (node.__cliDomBridge) return;
    Object.defineProperty(node, '__cliDomBridge', {
        value: true,
        enumerable: false,
    });

    node.querySelector = (selector: string): CliNode | null => {
        const dom = getDomNode(node);
        if (!dom) return null;
        const element = dom as Element;
        if (typeof element.querySelector !== 'function') return null;
        const result = element.querySelector(selector);
        return result ? getCliNode(result) : null;
    };

    node.querySelectorAll = (selector: string): CliNode[] => {
        const dom = getDomNode(node);
        if (!dom) return [];
        const element = dom as Element;
        if (typeof element.querySelectorAll !== 'function') return [];
        const list = element.querySelectorAll(selector);
        return Array.from(list)
            .map(item => getCliNode(item))
            .filter((item): item is CliNode => item !== null);
    };
}

function readFallback(node: CliNode, property: string): unknown {
    const state = DOM_FALLBACK_VALUES.get(node);
    return state ? state[property] : undefined;
}

function writeFallback(node: CliNode, property: string, value: unknown): void {
    let state = DOM_FALLBACK_VALUES.get(node);
    if (!state) {
        state = {};
        DOM_FALLBACK_VALUES.set(node, state);
    }
    state[property] = value;
}

/**
 * Define getters/setters on the CLI node that always read/write via the associated DOM node.
 */
export function bridgeDomProperties(node: CliNode, descriptors: DomPropertyBridge[]): void {
    if (!descriptors.length) return;
    for (const descriptor of descriptors) {
        const { property, domProperty = property, readOnly, transform } = descriptor;
        // Delete data properties so the descriptor takes effect.
        if (Object.prototype.hasOwnProperty.call(node, property)) {
            delete (node as unknown as Record<string, unknown>)[property];
        }

        Object.defineProperty(node, property, {
            configurable: true,
            enumerable: true,
            get() {
                // Check fallback first (CLI node may have set a value that DOM couldn't accept)
                const fallback = readFallback(node, property);
                if (fallback !== undefined) {
                    return transform?.get ? transform.get(fallback, getDomNode(node)) : fallback;
                }
                const dom = getDomNode(node);
                if (dom && domProperty in dom) {
                    const raw = (dom as unknown as Record<string, unknown>)[domProperty];
                    return transform?.get ? transform.get(raw, dom) : raw;
                }
                return undefined;
            },
            set(value: unknown) {
                if (readOnly) return;
                const dom = getDomNode(node);
                const next = transform?.set ? transform.set(value, dom) : value;
                if (dom && domProperty in dom) {
                    try {
                        (dom as unknown as Record<string, unknown>)[domProperty] = next;
                        // Verify the value was actually set (DOM may silently reject)
                        if ((dom as unknown as Record<string, unknown>)[domProperty] === next) {
                            // Clear fallback since DOM accepted the value
                            writeFallback(node, property, undefined);
                            return;
                        }
                    } catch {
                        // Fall back to storing locally if DOM rejects the value.
                    }
                }
                writeFallback(node, property, next);
            },
        });
    }
}

export { happyWindow, happyDocument };


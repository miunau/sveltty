/**
 * Runtime operations for CLI rendering
 * These replace DOM operations in compiled Svelte components
 */

import Yoga from 'yoga-layout';
import type {
    CliNode,
    TextNode,
    BoxNode,
    RootNode,
    CommentNode,
    Style,
    TextStyle,
} from './types.js';
import { scheduleRender } from './mount.js';
import { registerFocusable, unregisterFocusable, updateFormAssociation, setFocus, blurNode } from './focus.js';
import { document, window } from './dom/document.js';
import {
    linkDomNode,
    getDomNode,
    getDomElement,
    getCliNode,
    getCliChildren,
    attachDomBridge,
    bridgeDomProperties,
} from './dom/happy.js';
import type { DomPropertyBridge } from './dom/happy.js';
import { canonicalizeStyleProp, NUMERIC_STYLE_PROPS } from './style/properties.js';
import { setPopoverMode } from './popover.js';
import { initDialogState } from './dialog.js';
import { loadImageForNode } from './render/image.js';
import { getStringWidth } from './render/string-width.js';
import { getNodeTag } from './utils/node.js';
import { measureWrappedText, getWrapOptionsFromStyle } from './render/text-wrap.js';
import { getComputedCliStyle } from './style/computed.js';

const CONTROL_BRIDGES: DomPropertyBridge[] = [
    { property: 'disabled' },
    { property: 'name' },
    { property: 'tabIndex', domProperty: 'tabIndex' },
    { property: 'required' },
    { property: 'pattern' },
    { property: 'min' },
    { property: 'max' },
    { property: 'step' },
    { property: 'minLength', domProperty: 'minLength' },
    { property: 'maxLength', domProperty: 'maxLength' },
];

const INPUT_TEXT_BRIDGES: DomPropertyBridge[] = [
    { property: 'value' },
    { property: 'defaultValue' },
    { property: 'placeholder' },
    { property: 'readonly', domProperty: 'readOnly' },
    { property: 'selectionStart' },
    { property: 'selectionEnd' },
    { property: 'selectionDirection' },
];

const CHECKABLE_INPUT_BRIDGES: DomPropertyBridge[] = [
    { property: 'checked' },
    { property: 'defaultChecked' },
];

const SELECT_BRIDGES: DomPropertyBridge[] = [
    { property: 'multiple' },
    { property: 'selectedIndex' },
    { property: 'value' },
];

const BUTTON_BRIDGES: DomPropertyBridge[] = [
    { property: 'disabled' },
    { property: 'name' },
    { property: 'tabIndex', domProperty: 'tabIndex' },
    { property: 'value' },
];

const DOM_TEXT_STYLE_PROPS = new Set(['color', 'backgroundColor', 'borderColor', 'bold', 'italic', 'underline', 'strikethrough']);

function toBooleanAttr(value: unknown): boolean {
    return value === true || value === 'true' || value === '' || value === 1 || value === '1';
}

function toNumberAttr(value: unknown): number | undefined {
    const num = Number(value);
    return Number.isNaN(num) ? undefined : num;
}

function handleSpecialAttribute(node: CliNode, name: string, value: any): boolean {
    switch (name) {
        case 'src': {
            const str = value == null ? '' : String(value);
            node.src = str;
            // If this is an img element, start loading the image
            if (getNodeTag(node) === 'img' && str) {
                loadImageForNode(node, str, scheduleRender);
            }
            scheduleRender();
            return true;
        }
        case 'alt': {
            const str = value == null ? '' : String(value);
            node.alt = str;
            scheduleRender();
            return true;
        }
        case 'width': {
            // For img elements, width attribute sets the style width
            if (getNodeTag(node) === 'img') {
                const num = parseInt(value, 10);
                if (!isNaN(num) && num > 0) {
                    node.style.width = num;
                    setStyleValue(node, 'width', num);
                    scheduleRender();
                }
                return true;
            }
            return false;
        }
        case 'height': {
            // For img elements, height attribute sets the style height
            if (getNodeTag(node) === 'img') {
                const num = parseInt(value, 10);
                if (!isNaN(num) && num > 0) {
                    node.style.height = num;
                    setStyleValue(node, 'height', num);
                    scheduleRender();
                }
                return true;
            }
            return false;
        }
        case 'disabled': {
            const bool = toBooleanAttr(value);
            node.disabled = bool;
            if (bool) {
                unregisterFocusable(node);
            } else {
                registerFocusable(node);
            }
            scheduleRender();
            return true;
        }
        case 'readonly': {
            const bool = toBooleanAttr(value);
            node.readonly = bool;
            scheduleRender();
            return true;
        }
        case 'min': {
            const num = toNumberAttr(value);
            if (num !== undefined) {
                node.min = num;
                scheduleRender();
            }
            return true;
        }
        case 'max': {
            const num = toNumberAttr(value);
            if (num !== undefined) {
                node.max = num;
                scheduleRender();
            }
            return true;
        }
        case 'step': {
            const num = toNumberAttr(value);
            if (num !== undefined) {
                node.step = num;
                scheduleRender();
            }
            return true;
        }
        case 'minlength':
        case 'maxlength': {
            const num = toNumberAttr(value);
            if (num !== undefined) {
                if (name === 'minlength') {
                    node.minLength = num;
                } else {
                    node.maxLength = num;
                }
                scheduleRender();
            }
            return true;
        }
        case 'pattern': {
            const str = value == null ? '' : String(value);
            node.pattern = str;
            scheduleRender();
            return true;
        }
        case 'anchor': {
            node.anchor = value == null ? undefined : String(value);
            scheduleRender();
            return true;
        }
        case 'popover': {
            setPopoverMode(node, value);
            return true;
        }
        case 'popovertarget':
        case 'popoverTarget': {
            node.popovertarget = value == null ? undefined : String(value);
            scheduleRender();
            return true;
        }
        case 'popovertargetaction':
        case 'popoverTargetAction': {
            node.popovertargetaction = value == null ? undefined : String(value);
            scheduleRender();
            return true;
        }
        case 'popoverPlacement':
        case 'popoverplacement': {
            node.popoverPlacement = value == null ? undefined : String(value) as typeof node.popoverPlacement;
            scheduleRender();
            return true;
        }
        case 'popoverOffset':
        case 'popoveroffset': {
            const num = toNumberAttr(value);
            node.popoverOffset = num ?? 0;
            scheduleRender();
            return true;
        }
        case 'required': {
            const bool = toBooleanAttr(value);
            node.required = bool;
            scheduleRender();
            return true;
        }
        case 'name': {
            const str = value == null ? '' : String(value);
            node.name = str;
            scheduleRender();
            return true;
        }
        case 'selectionStart':
        case 'selectionEnd': {
            const num = toNumberAttr(value) ?? 0;
            if (name === 'selectionStart') {
                node.selectionStart = num;
            } else {
                node.selectionEnd = num;
            }
            scheduleRender();
            return true;
        }
        case 'selectionDirection': {
            const dir = String(value);
            if (dir === 'forward' || dir === 'backward' || dir === 'none') {
                node.selectionDirection = dir;
            }
            return true;
        }
        case 'type': {
            const str = value == null ? '' : String(value);
            node.inputType = str;
            const dom = getDomNode(node);
            if (dom && 'type' in dom) {
                try {
                    (dom as HTMLInputElement).type = str;
                } catch {
                    // ignore invalid type assignments
                }
            }
            scheduleRender();
            return true;
        }
        case 'value': {
            const strValue = value == null ? '' : String(value);
            node.value = value;
            node.__rawValue = strValue;
            node.__setValue?.(value);
            scheduleRender();
            return true;
        }
        case 'placeholder': {
            const str = value == null ? '' : String(value);
            node.placeholder = str;
            scheduleRender();
            return true;
        }
        case 'checked': {
            const bool = toBooleanAttr(value);
            node.checked = bool;
            node.__setChecked?.(bool);
            scheduleRender();
            return true;
        }
        case 'options': {
            if (Array.isArray(value)) {
                const mappedOptions = value.map((opt: unknown) => {
                    const o = opt as { label?: string; value?: unknown; selected?: boolean; disabled?: boolean };
                    return {
                        label: String(o.label ?? o.value ?? opt),
                        value: o.value ?? o.label ?? opt,
                        selected: !!o.selected,
                        disabled: !!o.disabled,
                    };
                });
                node.options = mappedOptions;
                // Set selectedIndex based on first selected option
                const selectedIdx = mappedOptions.findIndex(o => o.selected);
                node.selectedIndex = selectedIdx >= 0 ? selectedIdx : 0;
                scheduleRender();
            }
            return true;
        }
        case 'multiple': {
            const bool = toBooleanAttr(value);
            node.multiple = bool;
            scheduleRender();
            return true;
        }
        case 'defaultValue': {
            node.defaultValue = value;
            node.value = value;
            scheduleRender();
            return true;
        }
        case 'defaultChecked': {
            const bool = toBooleanAttr(value);
            node.defaultChecked = bool;
            node.checked = bool;
            scheduleRender();
            return true;
        }
        case 'focusable': {
            const bool = toBooleanAttr(value);
            node.focusable = bool;
            if (bool) {
                registerFocusable(node);
            } else {
                unregisterFocusable(node);
            }
            scheduleRender();
            return true;
        }
        case 'tabIndex':
        case 'tabindex': {
            const tab = Number(value);
            const normalized = Number.isNaN(tab) ? 0 : tab;
            node.tabIndex = normalized;
            registerFocusable(node);
            scheduleRender();
            return true;
        }
        case 'oninput':
        case 'onInput':
            node.onInput = value;
            return true;
        case 'onchange':
        case 'onChange':
            node.onChange = value;
            return true;
        case 'onFocus':
        case 'onfocus':
            node.onFocus = value;
            return true;
        case 'onBlur':
        case 'onblur':
            node.onBlur = value;
            return true;
        case 'onKeyDown':
        case 'onkeydown':
            node.onKeyDown = value;
            return true;
        default:
            return false;
    }
}

function normalizeStyleValue(prop: string, value: any): any {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return undefined;
        if (NUMERIC_STYLE_PROPS.has(prop)) {
            const num = Number(trimmed);
            if (!Number.isNaN(num)) {
                return num;
            }
        }
        return trimmed;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }
    return value;
}

function markTextNodeDirty(node: CliNode): void {
    if ((node as TextNode).type === 'text' && typeof node.yogaNode.markDirty === 'function') {
        node.yogaNode.markDirty();
    }
}

function setStyleValue(node: CliNode, prop: string, value: unknown): void {
    const normalized = normalizeStyleValue(prop, value);
    const style = node.style as Record<string, unknown>;
    if (normalized === undefined) {
        if (prop in style) {
            delete style[prop];
            markTextNodeDirty(node);
            scheduleRender();
        }
        return;
    }
    if (style[prop] === normalized) {
        return;
    }
    style[prop] = normalized;
    markTextNodeDirty(node);
    scheduleRender();
}

function applyInlineStyles(node: CliNode, cssText: string, domNode?: HTMLElement | null): void {
    const declarations = cssText.split(';');
    for (const decl of declarations) {
        if (!decl.trim()) continue;
        const [rawName, rawValue] = decl.split(':');
        if (!rawName || rawValue === undefined) continue;
        const cssName = rawName.trim().toLowerCase();
        const canonical = canonicalizeStyleProp(cssName);
        const mapped =
            canonical ?? cssName.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
        setStyleValue(node, mapped, rawValue.trim());
    }
    if (domNode?.style) {
        domNode.style.cssText = cssText;
    }
}

function updateDomTextStyles(node: CliNode, touched: string[]): void {
    if (!touched.some(prop => DOM_TEXT_STYLE_PROPS.has(prop))) return;
    const element = getDomElement(node);
    if (!element?.style) return;
    const style = (node.style as TextStyle) ?? {};

    if (touched.includes('color')) {
        element.style.color = style.color ?? '';
    }
    if (touched.includes('backgroundColor')) {
        element.style.backgroundColor = style.backgroundColor ?? '';
    }
    if (touched.includes('borderColor')) {
        element.style.borderColor = style.borderColor ?? '';
    }
    if (touched.includes('bold')) {
        element.style.fontWeight = style.bold ? 'bold' : '';
    }
    if (touched.includes('italic')) {
        element.style.fontStyle = style.italic ? 'italic' : '';
    }
    if (touched.some(prop => prop === 'underline' || prop === 'strikethrough')) {
        const decorations: string[] = [];
        if (style.underline) decorations.push('underline');
        if (style.strikethrough) decorations.push('line-through');
        element.style.textDecoration = decorations.join(' ') || '';
    }
}

/**
 * Create a text node
 * Replaces: document.createTextNode()
 */
export function create_text(value: string = ''): TextNode {
    const yogaNode = Yoga.Node.create();

    const node: TextNode = {
        type: 'text',
        value,
        yogaNode,
        parent: null,
        children: [],
        style: {},
        nodeName: '#text',
        nodeType: 3,
        remove() {
            detach(node);
        },
    };

    // Set measure function for text node
    // This tells Yoga how big the text will be, including wrapping
    yogaNode.setMeasureFunc((width, widthMode, height, heightMode) => {
        const currentValue = node.value;
        
        // Empty or whitespace-only text
        if (!currentValue || currentValue.trim().length === 0) {
            return { width: 0, height: 0 };
        }
        
        // Get computed style for text wrapping settings
        const computedStyle = getComputedCliStyle(node as CliNode);
        const wrapOptions = getWrapOptionsFromStyle(computedStyle);
        
        // Determine available width from Yoga's constraint
        // widthMode: 0 = undefined, 1 = exactly, 2 = at-most
        let maxWidth: number | undefined;
        if (widthMode === Yoga.MEASURE_MODE_EXACTLY || widthMode === Yoga.MEASURE_MODE_AT_MOST) {
            maxWidth = Math.floor(width);
        }
        
        // Measure with wrapping
        const measured = measureWrappedText(currentValue, maxWidth, wrapOptions);
        
        return {
            width: measured.width,
            height: measured.height,
        };
    });

    const domNode = document.createTextNode(value);
    linkDomNode(node as CliNode, domNode);
    attachDomBridge(node as CliNode);
    node.childNodes = node.children;

    return node;
}

/**
 * Create a box element (container)
 * Replaces: document.createElement()
 */
export function create_element(tag: string = 'box', skipFocusReg: boolean = false): BoxNode {
    const yogaNode = Yoga.Node.create();

    // Default flex container with column direction (like Ink.js)
    // This makes elements stack vertically by default
    yogaNode.setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN);

    const node: BoxNode = {
        type: 'box',
        yogaNode,
        parent: null,
        children: [],
        style: {},
        nodeName: tag,
        nodeType: 1,
        inputType: undefined,
        options: [],
        cursorPosition: 0,
        valid: true,
        validationMessage: '',
        remove() {
            detach(node);
        },
    };

    const domNode = document.createElement(tag);
    const cliNode = node as CliNode;
    linkDomNode(cliNode, domNode);
    attachDomBridge(cliNode);
    // childNodes is a DOM compatibility alias for children
    Object.defineProperty(node, 'childNodes', {
        get: () => node.children,
        enumerable: false,
        configurable: true,
    });
    
    // Add focus() and blur() methods for DOM compatibility
    cliNode.focus = function() {
        if (cliNode.focusable) {
            setFocus(cliNode);
        }
    };
    cliNode.blur = function() {
        blurNode(cliNode);
    };

    const isInput = tag === 'input';
    const isTextarea = tag === 'textarea';
    const isSelect = tag === 'select';
    const isButton = tag === 'button';

    if (isInput || isTextarea || isSelect) {
        bridgeDomProperties(cliNode, CONTROL_BRIDGES);
    }
    if (isInput || isTextarea) {
        bridgeDomProperties(cliNode, INPUT_TEXT_BRIDGES);
        if (isInput) {
            bridgeDomProperties(cliNode, CHECKABLE_INPUT_BRIDGES);
        }
    }
    if (isSelect) {
        bridgeDomProperties(cliNode, SELECT_BRIDGES);
    }
    if (isButton) {
        bridgeDomProperties(cliNode, BUTTON_BRIDGES);
    }

    if (isInput || isTextarea) {
        cliNode.value = '';
        cliNode.defaultValue = '';
        cliNode.selectionStart = 0;
        cliNode.selectionEnd = 0;
        cliNode.selectionDirection = 'none';
        if (isInput) {
            cliNode.checked = false;
            cliNode.defaultChecked = false;
        }
    }

    if (isSelect) {
        cliNode.selectedIndex = 0;
        cliNode.multiple = false;
        cliNode.value = '';
    }

    if (['input', 'select', 'button', 'textarea', 'summary'].includes(tag)) {
        cliNode.focusable = true;

        if (!skipFocusReg) {
            registerFocusable(cliNode);
        }
    }
    
    // Initialize details element with open property
    if (tag === 'details') {
        // Set up open property with HTML attribute semantics
        // In HTML, the presence of the 'open' attribute (even as empty string) means open
        let _open = false;
        Object.defineProperty(node, 'open', {
            get() { return _open; },
            set(value: any) {
                const oldOpen = _open;
                // Handle HTML attribute semantics: empty string or 'open' means true
                if (value === '' || value === 'open') {
                    _open = true;
                } else {
                _open = Boolean(value);
                }
                if (oldOpen !== _open) {
                    scheduleRender();
                }
            },
            enumerable: true,
            configurable: true,
        });
    }
    
    // Initialize dialog element with show/showModal/close API
    if (tag === 'dialog') {
        initDialogState(cliNode);
    }
    
    // Initialize progress element with value/max/position properties
    if (tag === 'progress') {
        let _value: number | undefined = undefined;
        let _max: number = 1;
        
        Object.defineProperty(node, 'value', {
            get() { return _value; },
            set(val: number | string | undefined) {
                if (val === undefined || val === null || val === '') {
                    _value = undefined;
                } else {
                    const num = typeof val === 'number' ? val : parseFloat(val as string);
                    _value = Number.isFinite(num) ? Math.max(0, num) : undefined;
                }
                scheduleRender();
            },
            enumerable: true,
            configurable: true,
        });
        
        Object.defineProperty(node, 'max', {
            get() { return _max; },
            set(val: number | string) {
                const num = typeof val === 'number' ? val : parseFloat(val as string);
                _max = Number.isFinite(num) && num > 0 ? num : 1;
                scheduleRender();
            },
            enumerable: true,
            configurable: true,
        });
        
        Object.defineProperty(node, 'position', {
            get() {
                if (_value === undefined) return -1;
                return Math.max(0, Math.min(1, _value / _max));
            },
            enumerable: true,
            configurable: false,
        });
    }

    return node;
}

/**
 * Create root node
 */
export function create_root(): RootNode {
    const yogaNode = Yoga.Node.create();
    yogaNode.setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN);

    const node: RootNode = {
        type: 'root',
        yogaNode,
        parent: null,
        children: [],
        style: {},
        nodeName: 'root',
        nodeType: 1,
        remove() {
            detach(node);
        },
    };

    const domNode = document.createElement('root');
    linkDomNode(node as CliNode, domNode);
    attachDomBridge(node as CliNode);
    node.childNodes = node.children;

    return node;
}

/**
 * Create a comment node (invisible anchor for Svelte)
 * Replaces: document.createComment()
 */
export function create_comment(data: string = ''): CommentNode {
    const yogaNode = Yoga.Node.create();

    // Comment nodes have zero size
    yogaNode.setWidth(0);
    yogaNode.setHeight(0);

    const node: CommentNode = {
        type: 'comment',
        yogaNode,
        parent: null,
        children: [],
        style: {},
        data,
        remove() {
            detach(node);
        },
    };

    const domNode = document.createComment(data);
    linkDomNode(node as CliNode, domNode);
    attachDomBridge(node as CliNode);
    node.childNodes = node.children;

    return node;
}

/**
 * Check if a node is a whitespace-only text node (contains only whitespace characters)
 * Empty strings are NOT considered whitespace-only (they may be filled later)
 */
function isWhitespaceOnlyText(node: CliNode): boolean {
    if (node.type !== 'text') return false;
    const value = (node as TextNode).value ?? '';
    // Only skip if the value contains actual whitespace characters
    // Empty strings should NOT be skipped (they may be filled programmatically later)
    return value.length > 0 && value.trim().length === 0;
}

/**
 * Append a child node to a parent
 * Replaces: parent.appendChild(child)
 */
export function append(parent: CliNode, child: CliNode): void {
    if (child.parent) {
        detach(child);
    }

    parent.children ??= [];
    parent.children.push(child);
    child.parent = parent;

    const domParent = getDomNode(parent);
    const domChild = getDomNode(child);
    if (domParent && domChild) {
        domParent.appendChild(domChild);
    }

    // Skip inserting whitespace-only text nodes into Yoga tree
    // This prevents gap from being applied between invisible whitespace nodes
    if (!isWhitespaceOnlyText(child)) {
        // Use Yoga's child count for the index since we may have skipped whitespace nodes
        const index = parent.yogaNode.getChildCount();
        parent.yogaNode.insertChild(child.yogaNode, index);
        if (child.type === 'text') {
            (child as TextNode).__inYogaTree = true;
        }
    } else if (child.type === 'text') {
        (child as TextNode).__inYogaTree = false;
    }

    if (child.form) {
        updateFormAssociation(child, child.form);
    }
}

/**
 * Insert a child node before a reference node
 * Replaces: parent.insertBefore(child, ref)
 */
export function insert(parent: CliNode, child: CliNode, anchor: CliNode | null): void {
    if (child.parent) {
        detach(child);
    }

    parent.children ??= [];
    const index = anchor ? parent.children.indexOf(anchor) : parent.children.length;

    if (index === -1) {
        append(parent, child);
        return;
    }

    parent.children.splice(index, 0, child);
    child.parent = parent;

    const domParent = getDomNode(parent);
    const domChild = getDomNode(child);
    const domAnchor = getDomNode(anchor ?? null);

    if (!domParent || !domChild) {
        append(parent, child);
        return;
    }

    domParent.insertBefore(domChild, domAnchor ?? null);
    
    // Skip inserting whitespace-only text nodes into Yoga tree
    if (!isWhitespaceOnlyText(child)) {
        // Calculate the correct Yoga index by counting non-whitespace siblings before anchor
        let yogaIndex = 0;
        if (anchor) {
            for (const sibling of parent.children) {
                if (sibling === child) continue; // skip the child we're inserting
                if (sibling === anchor) break;
                if (!isWhitespaceOnlyText(sibling)) {
                    yogaIndex++;
                }
            }
        } else {
            yogaIndex = parent.yogaNode.getChildCount();
        }
        parent.yogaNode.insertChild(child.yogaNode, yogaIndex);
        if (child.type === 'text') {
            (child as TextNode).__inYogaTree = true;
        }
    } else if (child.type === 'text') {
        (child as TextNode).__inYogaTree = false;
    }

    if (child.form) {
        updateFormAssociation(child, child.form);
    }
}

/**
 * Remove a node from its parent
 * Replaces: child.remove()
 */
export function detach(node: CliNode): void {
    const domNode = getDomNode(node);
    const domParent = domNode?.parentNode ?? null;
    const parentCli = getCliNode(domParent);
    if (parentCli) {
        parentCli.children ??= [];
        const idx = parentCli.children.indexOf(node);
        if (idx !== -1) {
            parentCli.children.splice(idx, 1);
        }
        parentCli.yogaNode.removeChild(node.yogaNode);
    }

    // Unregister from focus manager/control registry if needed
    unregisterFocusable(node);
    updateFormAssociation(node, undefined);

    if (domParent && domNode) {
        domParent.removeChild(domNode);
    }
}

/**
 * Set text content
 * Replaces: node.textContent = value
 */
export function set_text(node: TextNode, value: string): void {
    if (!node || !node.yogaNode) return;
    
    const stringValue = String(value);
    if (node.value === stringValue) return;
    
    const wasInYogaTree = node.__inYogaTree === true;
    const isNowWhitespaceOnly = stringValue.trim().length === 0;
    
    node.value = stringValue;

    try {
        // Update measure function with display width (accounting for Unicode)
        node.yogaNode.setMeasureFunc((width, widthMode, height, heightMode) => {
            const displayWidth = node.value.trim().length === 0 ? 0 : getStringWidth(node.value);
            return { width: displayWidth, height: displayWidth === 0 ? 0 : 1 };
        });

        // If not in Yoga tree but now has content, add to Yoga tree
        if (!wasInYogaTree && !isNowWhitespaceOnly && node.parent) {
            const yogaIndex = node.parent.yogaNode.getChildCount();
            node.parent.yogaNode.insertChild(node.yogaNode, yogaIndex);
            node.__inYogaTree = true;
        }
        // If in Yoga tree but now whitespace-only, remove from Yoga tree
        else if (wasInYogaTree && isNowWhitespaceOnly && node.parent) {
            node.parent.yogaNode.removeChild(node.yogaNode);
            node.__inYogaTree = false;
        }

        // Mark dirty so Yoga recalculates layout
        node.yogaNode.markDirty();
    } catch (err) {
        // Yoga node might be freed
        return;
    }

    const domNode = getDomNode(node as CliNode);
    if (domNode) {
        domNode.textContent = node.value;
    }

    // Request a render so text updates are shown
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    scheduleRender();
}

/**
 * Set attribute/prop on a node
 * Replaces: element.setAttribute() or element.prop = value
 */
export function set_attribute(node: CliNode, name: string, value: any): void {
    const domElement = getDomElement(node);

    const styleKey = canonicalizeStyleProp(name as string);
    if (styleKey) {
        setStyleValue(node, styleKey, value);
        return;
    }

    if (name === 'style' && typeof value === 'string') {
        applyInlineStyles(node, value, domElement);
        return;
    }

    if (name === 'form') {
        const normalized = value == null ? undefined : String(value);
        node.form = normalized;
        updateFormAssociation(node, normalized);
        if (domElement) {
            if (normalized === undefined) {
                domElement.removeAttribute('form');
            } else {
                domElement.setAttribute('form', normalized);
            }
        }
        return;
    }

    if (handleSpecialAttribute(node, name, value)) {
        return;
    }

    if (name === 'class' || name === 'className') {
        const normalized = value == null ? '' : String(value);
        if (domElement) {
            domElement.className = normalized;
        }
        node.className = normalized;
        node.classList = normalized
            .split(/\s+/g)
            .map((token) => token.trim())
            .filter(Boolean);
        return;
    }

    if (name === 'value') {
        (node as unknown as Record<string, unknown>)[name] = value;
    }

    if (domElement) {
            if (value === null || value === undefined) {
            domElement.removeAttribute(name);
            } else {
            domElement.setAttribute(name, String(value));
            }
        }
    (node as unknown as Record<string, unknown>)[name] = value;
}

/**
 * Get first child of a node
 * Replaces: node.firstChild
 */
export function get_first_child(node: CliNode): CliNode | null {
    const dom = getDomNode(node);
    if (!dom?.firstChild) return null;
    return getCliNode(dom.firstChild);
}

/**
 * Get next sibling of a node
 * Replaces: node.nextSibling
 */
export function get_next_sibling(node: CliNode): CliNode | null {
    const dom = getDomNode(node);
    if (!dom?.nextSibling) return null;
    return getCliNode(dom.nextSibling);
}

/**
 * Clear all children from a node
 * Replaces: element.innerHTML = ''
 */
export function clear_children(node: CliNode): void {
    node.children ??= [];
    while (node.children.length > 0) {
        detach(node.children[0]);
    }
}

/**
 * Clone a node (shallow)
 */
export function clone_node(node: CliNode): CliNode {
    if (node.type === 'text') {
        return create_text(node.value);
    } else if (node.type === 'root') {
        return create_root();
    } else if (node.type === 'comment') {
        return create_comment(node.data ?? '');
    }

    const cloned = create_element(getNodeTag(node) || 'box');
    cloned.children ??= [];
    node.children ??= [];
    for (const child of node.children) {
        const clonedChild = clone_node(child);
        clonedChild.parent = cloned;
        cloned.children.push(clonedChild);
        cloned.yogaNode.insertChild(clonedChild.yogaNode, cloned.children.length - 1);
    }
    return cloned;
}

/**
 * Set styles on a node
 */
export function set_style(node: CliNode, styles: Partial<Style>): void {
    Object.assign(node.style, styles);
    updateDomTextStyles(node, Object.keys(styles));
}

/**
 * Listen for events (placeholder for future implementation)
 */
export function listen(
    node: CliNode,
    event: string,
    handler: (event: any) => void,
    options?: AddEventListenerOptions
): () => void {
    const dom = getDomNode(node);
    if (!dom?.addEventListener) {
        return noop;
    }
    const wrapped = (native: Event) => handler.call(node, native);
    dom.addEventListener(event, wrapped as EventListener, options);
    return () => {
        dom.removeEventListener(event, wrapped as EventListener, options);
    };
}

/** Event init options for creating DOM events */
interface EventInitOptions {
    bubbles?: boolean;
    cancelable?: boolean;
    detail?: unknown;
}

function createDomEvent(type: string, init: EventInitOptions = {}): Event {
    const { bubbles, cancelable, detail } = init;
    // happy-dom CustomEvent types differ from standard DOM
    const eventInit = {
        bubbles: bubbles ?? (type !== 'focus' && type !== 'blur'),
        cancelable: cancelable ?? true,
        detail,
    };
    return new window.CustomEvent(type, eventInit as never) as unknown as Event;
}

/**
 * Dispatch a DOM event on a CLI node's associated DOM element.
 * 
 * @param node - Target CLI node.
 * @param type - Event type.
 * @param init - Event initialization options.
 * @returns The dispatched Event.
 */
export function dispatchNodeEvent(node: CliNode | null, type: string, init: EventInitOptions = {}): Event {
    const event = createDomEvent(type, init);
    if (!node) return event;
    const dom = getDomNode(node);
    if (!dom) return event;
    dom.dispatchEvent(event);
    return event;
}

/**
 * Noop function for operations we don't need to implement
 */
export function noop(): void {
    // Intentionally empty
}

/**
 * Free Yoga node resources
 */
export function free_node(node: CliNode): void {
    if (node.__freed) {
        return;
    }
    node.__freed = true;

    node.children ??= [];
    for (const child of node.children) {
        free_node(child);
    }

    node.yogaNode.free();
}

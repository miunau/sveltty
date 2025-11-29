import type Yoga from 'yoga-layout';
import type { CalcValue } from './style/calc.js';

/**
 * Style dimension type that accepts numbers, strings (with units), or calc expressions.
 */
export type StyleDimension = number | string | CalcValue;

/**
 * DOM-like node type constants to align with browser APIs.
 */
export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const COMMENT_NODE = 8;
export const DOCUMENT_FRAGMENT_NODE = 11;

/**
 * Node types in the CLI tree
 */
export type NodeType = 'text' | 'box' | 'root' | 'comment' | 'fragment';

/**
 * Flexbox style properties (subset that maps to Yoga)
 */
export interface FlexStyle {
    // Layout
    flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
    flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
    flexGrow?: number;
    flexShrink?: number;
    flexBasis?: number | string;

    // Dimensions (support calc expressions)
    width?: StyleDimension;
    height?: StyleDimension;
    minWidth?: StyleDimension;
    minHeight?: StyleDimension;
    maxWidth?: StyleDimension;
    maxHeight?: StyleDimension;

    // Spacing (support calc expressions)
    margin?: StyleDimension;
    marginTop?: StyleDimension;
    marginRight?: StyleDimension;
    marginBottom?: StyleDimension;
    marginLeft?: StyleDimension;
    marginX?: StyleDimension;
    marginY?: StyleDimension;

    padding?: StyleDimension;
    paddingTop?: StyleDimension;
    paddingRight?: StyleDimension;
    paddingBottom?: StyleDimension;
    paddingLeft?: StyleDimension;
    paddingX?: StyleDimension;
    paddingY?: StyleDimension;

    // Alignment
    justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
    alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
    alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
    alignContent?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'space-between' | 'space-around';

    // Position (offsets support calc expressions)
    position?: 'relative' | 'absolute' | 'fixed';
    top?: StyleDimension;
    right?: StyleDimension;
    bottom?: StyleDimension;
    left?: StyleDimension;
    zIndex?: number;

    // Display and visibility
    display?: 'flex' | 'none';
    visibility?: 'visible' | 'hidden' | 'collapse';

    // Gap (support calc expressions)
    gap?: StyleDimension;
    rowGap?: StyleDimension;
    columnGap?: StyleDimension;

    // Anchor positioning
    anchorName?: string;
    positionAnchor?: string;
    positionArea?: string;
    positionTry?: string;
    positionTryFallbacks?: string;
    positionTryOrder?: string;
    positionVisibility?: string;

    // Overflow - scroll behavior
    overflow?: 'visible' | 'hidden' | 'scroll' | 'auto';
    overflowX?: 'visible' | 'hidden' | 'scroll' | 'auto';
    overflowY?: 'visible' | 'hidden' | 'scroll' | 'auto';
    scrollBehavior?: 'auto' | 'smooth';
    
    // Scroll keyboard configuration
    scrollKeyboard?: 'auto' | 'enabled' | 'disabled';
    scrollKeys?: string;
    scrollKeyUp?: string;
    scrollKeyDown?: string;
    scrollKeyPageUp?: string;
    scrollKeyPageDown?: string;
    scrollKeyHalfUp?: string;
    scrollKeyHalfDown?: string;
    scrollKeyTop?: string;
    scrollKeyBottom?: string;
}

/**
 * Text styling properties
 */
export interface TextStyle {
    color?: string;
    backgroundColor?: string;
    borderColor?: string;
    borderBg?: string;
    borderStyle?: 'none' | 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic' | 'dotted';
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    dim?: boolean;
    inverse?: boolean;
    textAlign?: 'left' | 'center' | 'right';
    
    // Text wrapping
    whiteSpace?: 'normal' | 'nowrap' | 'pre' | 'pre-wrap' | 'pre-line' | 'break-spaces';
    wordBreak?: 'normal' | 'break-all' | 'keep-all' | 'break-word';
    overflowWrap?: 'normal' | 'break-word' | 'anywhere';
    textWrap?: 'wrap' | 'nowrap' | 'balance' | 'pretty' | 'stable';
    
    // List styling
    listStyleType?: string;
    listStylePosition?: 'inside' | 'outside';
    listMarkerColor?: string;
    
    // Pseudo-element content (for ::marker, ::before, ::after)
    content?: string;
    
    // Progress element styling
    progressBarColor?: string;
    progressTrackColor?: string;
    progressFilledChar?: string;
    progressEmptyChar?: string;

    // Meter element styling
    meterGoodColor?: string;
    meterAverageColor?: string;
    meterPoorColor?: string;
    meterTrackColor?: string;
    meterFilledChar?: string;
    meterEmptyChar?: string;

    // Caret/cursor styling (for inputs)
    caretColor?: string;
    caretChar?: string;
    caretInverse?: boolean;
    
    // Placeholder styling
    placeholderColor?: string;
    
    // Image styling
    objectFit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';

    // Scrollbar styling
    scrollbarTrackColor?: string;
    scrollbarThumbColor?: string;
    scrollbarTrackChar?: string;
    scrollbarThumbChar?: string;
}

/**
 * Border properties
 */
export interface BorderStyle {
    borderStyle?: 'none' | 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic' | 'dotted';
    borderColor?: string;
    borderTop?: boolean;
    borderRight?: boolean;
    borderBottom?: boolean;
    borderLeft?: boolean;
    borderBg?: string;
    borderBackgroundColor?: string;
    borderTopBackgroundColor?: string;
    borderRightBackgroundColor?: string;
    borderBottomBackgroundColor?: string;
    borderLeftBackgroundColor?: string;
    borderTopLeftBackgroundColor?: string;
    borderTopRightBackgroundColor?: string;
    borderBottomLeftBackgroundColor?: string;
    borderBottomRightBackgroundColor?: string;
}

/**
 * Combined style properties
 */
export interface Style extends FlexStyle, TextStyle, BorderStyle {}

/**
 * Focusable props and metadata
 */
export interface FocusProps {
    focusable?: boolean;
    tabIndex?: number;
    role?: string;
    label?: string;
    description?: string;
    onFocus?: () => void;
    onBlur?: () => void;
    onKeyDown?: (event: KeyPressEvent) => void;
    onInput?: (event: InputEventDetail) => void;
    onChange?: (event: InputEventDetail) => void;
    /** Toggle event handler for details element */
    ontoggle?: (event: ToggleEventDetail) => void;
}

/**
 * Computed layout information from Yoga
 */
export interface ComputedLayout {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * Event detail for input/change events.
 */
export interface InputEventDetail {
    value: unknown;
}

/**
 * Toggle event detail for details element.
 * Mirrors the ToggleEvent API from the DOM.
 */
export interface ToggleEventDetail {
    type: 'toggle';
    target: CliNode;
    oldState: 'open' | 'closed';
    newState: 'open' | 'closed';
}

/**
 * Scroll state for scroll containers.
 */
export interface ScrollState {
    scrollTop: number;
    scrollLeft: number;
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
}

/**
 * Base CLI node - all node types extend this interface.
 */
export interface BaseNode {
    // Core node properties
    type: NodeType;
    yogaNode: ReturnType<typeof Yoga.Node.create>;
    style: Style;
    computedLayout?: ComputedLayout;
    parent: CliNode | null;
    children: CliNode[];
    /** Alias for children, for DOM compatibility */
    childNodes?: CliNode[];

    // DOM-like identity
    nodeName?: string;
    nodeType?: number;
    id?: string;
    className?: string;
    classList?: string[];
    textContent?: string;

    // Accessibility and focus
    focusable?: boolean;
    tabIndex?: number;
    role?: string;
    label?: string;
    description?: string;
    autofocus?: boolean;

    // Event handlers
    onFocus?: () => void;
    onBlur?: () => void;
    onKeyDown?: (event: KeyPressEvent) => void;
    onInput?: (event: InputEventDetail) => void;
    onChange?: (event: InputEventDetail) => void;
    /** Toggle event handler for details element */
    ontoggle?: (event: ToggleEventDetail) => void;

    // Form control properties
    value?: unknown;
    inputType?: string;
    name?: string;
    placeholder?: string;
    required?: boolean;
    readonly?: boolean;
    disabled?: boolean;
    form?: string;

    // Input/textarea specific
    cursorPosition?: number;
    selectionStart?: number;
    selectionEnd?: number;
    selectionDirection?: 'none' | 'forward' | 'backward';
    defaultValue?: unknown;
    rows?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;

    // Numeric input specific
    min?: number;
    max?: number;
    step?: number;

    // Checkbox/radio specific
    checked?: boolean;
    defaultChecked?: boolean;

    // Select specific
    options?: Array<{ label: string; value: unknown; selected?: boolean; disabled?: boolean }>;
    selectedIndex?: number;
    multiple?: boolean;

    // Validation
    valid?: boolean;
    validationMessage?: string;
    dirty?: boolean;

    // Details/dialog specific
    open?: boolean;
    closedby?: 'any' | 'closerequest' | 'none';

    // Image specific
    src?: string;
    alt?: string;

    // Label specific
    htmlFor?: string;

    // Popover properties
    anchor?: string;
    popoverPlacement?: 'top' | 'bottom' | 'left' | 'right';
    popoverOffset?: number;
    popover?: 'auto' | 'manual' | 'hint';
    popovertarget?: string;
    popovertargetaction?: string;

    // DOM-like methods
    remove: () => void;
    focus?: () => void;
    blur?: () => void;

    // Internal state (prefixed with __)
    /** Internal scroll state for scroll containers */
    __scroll?: ScrollState;
    /** Input text horizontal scroll offset */
    __scrollX?: number;
    /** Input text vertical scroll offset */
    __scrollY?: number;
    
    // DOM-compatible scroll API (added dynamically)
    /** Scroll position from top */
    scrollTop?: number;
    /** Scroll position from left */
    scrollLeft?: number;
    /** Total scrollable width */
    scrollWidth?: number;
    /** Total scrollable height */
    scrollHeight?: number;
    /** Visible client width */
    clientWidth?: number;
    /** Visible client height */
    clientHeight?: number;
    /** Scroll to position */
    scroll?: (xOrOptions?: number | ScrollToOptions, y?: number) => void;
    /** Scroll to position (alias) */
    scrollTo?: (xOrOptions?: number | ScrollToOptions, y?: number) => void;
    /** Scroll by delta */
    scrollBy?: (xOrOptions?: number | ScrollToOptions, y?: number) => void;
    /** Scroll element into view */
    scrollIntoView?: (options?: boolean | ScrollIntoViewOptions) => void;
    
    // Common element attributes
    /** Starting index for ordered lists */
    start?: number;
    /** Column span for table cells */
    colspan?: number;
    /** Column span (DOM property style) */
    colSpan?: number;
    /** Row span for table cells */
    rowspan?: number;
    /** Row span (DOM property style) */
    rowSpan?: number;
    /** Element width */
    width?: number | string;
    /** Element height */
    height?: number | string;
    /** Get attribute value */
    getAttribute?: (name: string) => string | null;
    /** Committed numeric value for number inputs */
    __committedValue?: unknown;
    /** Raw string value before parsing */
    __rawValue?: string;
    /** Svelte value binding setter */
    __setValue?: (v: unknown) => void;
    /** Svelte checked binding setter */
    __setChecked?: (v: boolean) => void;
    /** Svelte bind:group array */
    __bindingGroup?: CliNode[];
    /** Svelte bind:group getter */
    __groupGet?: () => unknown[];
    /** Svelte bind:group setter */
    __groupSet?: (v: unknown) => void;
    /** Internal value for radio/checkbox groups */
    __value?: unknown;
    /** Select dropdown open state */
    __dropdownOpen?: boolean;
    /** Select type-ahead buffer */
    __typeaheadBuffer?: string;
    /** Select type-ahead timeout handle */
    __typeaheadTimeout?: ReturnType<typeof setTimeout> | null;
    /** Cached computed CSS style */
    __cssStyle?: Style;
    /** Popover open state */
    __popoverOpen?: boolean;
    /** Popover mode */
    __popoverMode?: 'auto' | 'manual' | 'hint';
    /** Anchored position for popovers */
    __anchoredPosition?: { x: number; y: number };
    /** Focus state marker */
    __focusState?: 'focused' | null;
    /** Static attributes cache */
    __staticAttrs?: Record<string, unknown>;
    /** Whether the node has been freed */
    __freed?: boolean;
    /** DOM bridge marker */
    __cliDomBridge?: boolean;

    // DOM-like query methods
    /** Query a single descendant by CSS selector */
    querySelector?: (selector: string) => CliNode | null;
    /** Query all descendants matching a CSS selector */
    querySelectorAll?: (selector: string) => CliNode[];

    // Option element property
    /** Whether this option is selected (for option elements) */
    selected?: boolean;

    // Checkbox indeterminate state
    /** Whether checkbox is in indeterminate state */
    indeterminate?: boolean;


    // Interactive states for CSS pseudo-classes
    /** Hover state for :hover */
    __hoverState?: 'hovered' | null;
    /** Active state for :active */
    __activeState?: 'active' | null;
}

/**
 * Text node - leaf node containing text content
 */
export interface TextNode extends BaseNode {
    type: 'text';
    value: string;
    /** Whether this node is currently in the Yoga layout tree */
    __inYogaTree?: boolean;
}

/**
 * Box node - container for other nodes
 */
export interface BoxNode extends BaseNode {
    type: 'box';
}

/**
 * Root node - top-level container
 */
export interface RootNode extends BaseNode {
    type: 'root';
}

/**
 * Comment node - invisible anchor for Svelte
 */
export interface CommentNode extends BaseNode {
    type: 'comment';
    data?: string;
}

/**
 * Union type for all CLI nodes
 */
export type CliNode = TextNode | BoxNode | RootNode | CommentNode;

/**
 * Props that can be passed to components
 */
export interface ComponentProps extends Style, FocusProps {
    // Children handling
    children?: CliNode[];

    // Event handlers (for future use)
    onKeyPress?: (key: KeyPressEvent) => void;
    onMount?: () => void;
    onUnmount?: () => void;
}

/**
 * Key press event
 */
export interface KeyPressEvent {
    key: string;
    ctrl: boolean;
    shift: boolean;
    meta: boolean;
    alt?: boolean;
    sequence?: string;
    escape: boolean;
    return: boolean;
    tab: boolean;
    backspace: boolean;
    delete: boolean;
    upArrow: boolean;
    downArrow: boolean;
    leftArrow: boolean;
    rightArrow: boolean;
    home: boolean;
    end: boolean;
}

/**
 * Render output
 */
export interface RenderOutput {
    output: string;
    width: number;
    height: number;
}

/**
 * Mount options
 */
export interface MountOptions {
    props?: Record<string, unknown>;
    stdin?: NodeJS.ReadStream;
    stdout?: NodeJS.WriteStream;
    stderr?: NodeJS.WriteStream;
    exitOnCtrlC?: boolean;
    /** When false, do not clear the terminal on unmount */
    clearOnExit?: boolean;
    debug?: boolean;
}

/**
 * Mounted app instance
 */
export interface AppInstance {
    unmount: () => void;
    waitUntilExit: () => Promise<void>;
    rerender: (props?: Record<string, unknown>) => void;
}

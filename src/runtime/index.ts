/**
 * CLI Runtime for Svelte
 * Core primitives for rendering Svelte components in the terminal
 */

// Types
export type {
    CliNode,
    TextNode,
    BoxNode,
    RootNode,
    Style,
    FlexStyle,
    TextStyle,
    BorderStyle,
    ComputedLayout,
    ComponentProps,
    KeyPressEvent,
    RenderOutput,
    MountOptions,
    AppInstance,
} from './types.js';

// Operations
export {
    create_text,
    create_element,
    create_root,
    append,
    insert,
    detach,
    set_text,
    set_attribute,
    get_first_child,
    get_next_sibling,
    clear_children,
    clone_node,
    set_style,
    listen,
    noop,
    free_node,
} from './operations.js';

// Layout
export {
    applyStylesToYoga,
    computeLayout,
} from './layout.js';

// Rendering
export {
    renderToString,
    measureText,
} from './render.js';

// Mounting
export {
    mount,
    createMountContext,
    scheduleRender,
    getCurrentRoot,
} from './mount.js';

// Actions
export {
    valueBindingAction,
    checkedBindingAction,
    selectValueBindingAction,
} from './actions/bindings.js';

// Occlusion system
export type {
    Rect,
    OcclusionZone,
    VisibleRegion,
} from './render/occlusion.js';

export {
    clearOcclusionZones,
    addOcclusionZone,
    getOcclusionZones,
    isPointOccluded,
    isRectOccluded,
    isRectFullyOccluded,
    getVisibleRegions,
    rectsOverlap,
} from './render/occlusion.js';

// Top-layer system for overlays (popovers, dropdowns, modals, etc.)
export type {
    TopLayerType,
    TopLayerElement,
    TopLayerRenderFn,
} from './render/top-layer.js';

export {
    clearTopLayer,
    addToTopLayer,
    addPopoverToTopLayer,
    addDropdownToTopLayer,
    addDialogToTopLayer,
    addModalToTopLayer,
    getTopLayerElements,
    registerTopLayerOcclusion,
    clearGridArea,
} from './render/top-layer.js';

// Table rendering
export {
    isTable,
    isTableSection,
    isTableRow,
    isTableCell,
    extractTableStructure,
    getTableDimensions,
    renderTable,
} from './render/table.js';

// Scroll system
export type {
    ScrollState,
    ScrollOptions,
    ScrollToOptions,
    ScrollIntoViewOptions,
} from './scroll.js';

export {
    getScrollState,
    initScrollState,
    setScrollPosition,
    scrollBy,
    isScrollContainer,
    findScrollParent,
    scrollIntoView,
    getMaxScroll,
    canScrollVertically,
    canScrollHorizontally,
    // DOM-compatible scroll methods
    domScroll,
    domScrollTo,
    domScrollBy,
    domScrollIntoView,
    attachScrollMethods,
    getScrollPropertyDescriptors,
    getScrollMethodDescriptors,
} from './scroll.js';

// Scroll keyboard configuration
export type {
    ScrollKeyboardMode,
    ScrollAction,
    ScrollKeyBindings,
} from './scroll-keyboard.js';

export {
    parseKeyBinding,
    parseScrollKeysShorthand,
    getScrollKeyBindings,
    getScrollKeyboardMode,
    matchesKeyBinding,
    handleScrollKeyboard,
    handleExplicitScrollKeyboard,
    handleDefaultScroll,
    scrollByWithChaining,
    elementCapturesArrows,
} from './scroll-keyboard.js';

// Scrollbar rendering
export type {
    ScrollbarStyle,
} from './render/scrollbar.js';

export {
    renderVerticalScrollbar,
    renderHorizontalScrollbar,
    shouldShowVerticalScrollbar,
    shouldShowHorizontalScrollbar,
    getScrollbarStyleFromCSS,
} from './render/scrollbar.js';

// Dialog element support
export {
    isDialogElement,
    isDialogOpen,
    isDialogModal,
    shouldHideDialog,
    getDialogReturnValue,
    showDialog,
    showDialogModal,
    closeDialog,
    cancelDialog,
    handleDialogEscape,
    getOpenDialogs,
    getOpenModals,
    hasOpenModal,
    getTopmostModal,
    findAutofocusElement,
    resetDialogs,
} from './dialog.js';

// Debug logging
export {
    log,
    setLogFile,
    enableLogging,
    isLoggingEnabled,
} from './logger.js';

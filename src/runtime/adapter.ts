/**
 * CLI adapter that re-exports upstream Svelte internals while overriding the DOM-facing
 * pieces with our terminal-specific implementations. This will become the public entry
 * point for `svelte/internal/client` when the CLI runtime is in play.
 */

// -----------------------------------------------------------------------------
// Base exports – everything from upstream unless we override it below
// -----------------------------------------------------------------------------
export * from 'svelte/internal/client';

// -----------------------------------------------------------------------------
// Template & traversal helpers – backed by CLI node operations
// -----------------------------------------------------------------------------
export {
    text,
    comment,
    append,
    from_tree,
    from_html,
    from_svg,
    from_mathml,
} from './client/template.js';

export { child, first_child, sibling } from './client/traversal.js';

export { set_text } from './client/update.js';

// -----------------------------------------------------------------------------
// Attributes & styles – translate DOM mutations into Yoga operations
// -----------------------------------------------------------------------------
export { set_attribute, set_class, set_style } from './client/attributes.js';
export { append_styles } from './client/styles.js';

// -----------------------------------------------------------------------------
// Events & bindings – CLI-specific event loop and form controls
// -----------------------------------------------------------------------------
export { event, apply, delegate, replay_events } from './client/events.js';

export {
    bind_prop,
    bind_this,
    bind_value,
    bind_checked,
    bind_select_value,
    bind_group,
    setRangeText,
    select,
    setSelectionRange,
    copy,
    paste,
} from './client/bindings.js';

// -----------------------------------------------------------------------------
// Special DOM-only features – currently stubs/warnings in CLI
// -----------------------------------------------------------------------------
export { html, css_props, head } from './client/special.js';
export { create_custom_element } from './client/custom-element.js';

// -----------------------------------------------------------------------------
// Hydration, transitions, and actions – no-ops for CLI today
// -----------------------------------------------------------------------------
export { hydrate_template, next, reset } from './client/hydration.js';
export { transition, animation, action } from './client/transitions.js';

// -----------------------------------------------------------------------------
// Browser globals – explicitly undefined in the terminal runtime
// -----------------------------------------------------------------------------
export const window = undefined;
export const document = undefined;


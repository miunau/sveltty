/**
 * Terminal User-Agent Stylesheet
 * 
 * This is the default stylesheet applied to all elements, similar to browser
 * user-agent stylesheets. It defines the base appearance for all HTML elements
 * in the terminal environment.
 * 
 * Uses CSS system colors (Canvas, CanvasText, Field, ButtonFace, etc.) which
 * map to terminal-appropriate ANSI colors.
 */
export const BASE_STYLESHEET = `
/* ============================================================================
   CSS Custom Properties (Theme Variables)
   ============================================================================ */
:root {
    box-sizing: border-box;
    
    /* Base colors */
    --color-text: CanvasText;
    --color-background: Canvas;
    
    /* Border colors */
    --color-border: ButtonBorder;
    --color-border-focus: AccentColor;
    --color-border-disabled: #333333;
    --color-border-invalid: #cc0000;
    
    /* Form control colors */
    --color-field-background: Field;
    --color-field-text: FieldText;
    --color-field-focus-background: #0a2540;
    --color-field-placeholder: GrayText;
    
    /* Selection colors */
    --color-selection-background: Highlight;
    --color-selection-text: HighlightText;
    
    /* Accent/focus colors */
    --color-accent: AccentColor;
    --color-accent-text: AccentColorText;
    
    /* Disabled state */
    --color-disabled: GrayText;
    
    /* Link colors */
    --color-link: LinkText;
    --color-link-visited: VisitedText;
    
    /* List marker */
    --color-marker: cyan;
    
    /* Progress bar */
    --color-progress-bar: cyan;
    --color-progress-track: GrayText;
    --progress-filled-char: "█";
    --progress-empty-char: "░";
    
    /* Caret/cursor */
    --caret-char: "";
    --caret-color: inherit;
    --caret-inverse: true;
    
    /* Scrollbar */
    --scrollbar-track-color: #333333;
    --scrollbar-thumb-color: #888888;
    --scrollbar-track-char: "░";
    --scrollbar-thumb-char: "█";
}

/* ============================================================================
   Universal Box Sizing
   ============================================================================ */
*, *::before, *::after {
    box-sizing: inherit;
}

/* ============================================================================
   Document & Sectioning Elements
   ============================================================================ */
body,
main,
section,
article,
header,
footer,
nav,
aside,
form,
div {
    display: flex;
    flex-direction: column;
    min-width: 0;
    color: var(--color-text);
}

/* ============================================================================
   Text Content Elements
   ============================================================================ */
p {
    display: flex;
    flex-direction: column;
    margin: 0;
}

blockquote {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding-left: 2ch;
    border-left-style: single;
    border-color: var(--color-border);
}

pre {
    display: flex;
    flex-direction: column;
    margin: 0;
    white-space: pre;
    overflow: auto;
}

hr {
    display: flex;
    height: 1;
    border-style: single;
    border-color: var(--color-border);
    margin: 1 0;
}

/* ============================================================================
   Inline Text Elements
   ============================================================================ */
span,
label,
strong,
em,
small,
code,
kbd,
samp,
var,
abbr,
cite,
dfn,
sub,
sup,
time,
mark {
    display: inline-flex;
    flex-direction: row;
    align-items: baseline;
}

strong,
b {
    font-weight: bold;
}

em,
i {
    font-style: italic;
}

u {
    text-decoration: underline;
}

s,
del,
strike {
    text-decoration: line-through;
}

mark {
    background-color: Mark;
    color: MarkText;
}

code,
kbd,
samp {
    color: cyan;
}

/* ============================================================================
   Headings
   ============================================================================ */
h1, h2, h3, h4, h5, h6 {
    display: flex;
    flex-direction: row;
    font-weight: bold;
    margin: 0;
}

/* ============================================================================
   Lists
   ============================================================================ */
ul,
ol {
    display: flex;
    flex-direction: column;
    padding-left: 2ch;
    margin: 0;
    --list-marker-color: var(--color-marker);
}

li {
    display: flex;
    flex-direction: row;
}

li::marker {
    color: var(--color-marker);
}

/* Nested list marker cycling is handled by the renderer */

/* ============================================================================
   Links
   ============================================================================ */
a {
    color: var(--color-link);
    text-decoration: underline;
}

a:visited {
    color: var(--color-link-visited);
}

/* ============================================================================
   Form Controls - Common
   ============================================================================ */
input,
select,
textarea,
button {
    display: flex;
    flex-direction: row;
    min-width: 0;
    color: var(--color-field-text);
    border-style: single;
    border-color: var(--color-border);
    caret-color: var(--caret-color);
    --placeholder-color: var(--color-field-placeholder);
}

input::selection,
select::selection,
textarea::selection {
    background-color: var(--color-selection-background);
    color: var(--color-selection-text);
}

textarea {
    overflow: auto;
}

input:focus,
select:focus,
textarea:focus,
button:focus {
    border-color: var(--color-border-focus);
    background-color: var(--color-field-focus-background);
}

input:disabled,
select:disabled,
textarea:disabled,
button:disabled {
    color: var(--color-disabled);
    border-color: var(--color-border-disabled);
}

input:invalid,
select:invalid,
textarea:invalid {
    border-color: var(--color-border-invalid);
}

/* ============================================================================
   Input Types
   ============================================================================ */
input[type="checkbox"],
input[type="radio"] {
    min-width: 3ch;
    min-height: 1;
    max-width: 3ch;
}

/* ============================================================================
   Button
   ============================================================================ */
button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background-color: ButtonFace;
}

button:focus {
    background-color: var(--color-field-focus-background);
}

button:disabled {
    background-color: transparent;
}

/* ============================================================================
   Select
   ============================================================================ */
select option:checked {
    color: cyan;
    font-weight: bold;
}

/* Optgroup styling */
optgroup {
    font-weight: bold;
}

optgroup:disabled {
    opacity: 0.5;
}

/* Options within optgroups inherit disabled state */
optgroup:disabled option {
    opacity: 0.5;
}

/* Picker (dropdown) styling - inherits from select by default */
select::picker(select) {
    background-color: var(--color-field-background);
    border-color: var(--color-border);
    color: var(--color-field-text);
}

/* ============================================================================
   Details/Summary
   ============================================================================ */
details {
    display: flex;
    flex-direction: column;
    border-style: single;
    border-color: var(--color-border);
}

details:focus-within {
    border-color: var(--color-border-focus);
}

summary {
    display: flex;
    flex-direction: row;
}

summary::marker {
    color: var(--color-marker);
}

details[open] > summary::marker {
    content: "▼ ";
}

details:not([open]) > summary::marker {
    content: "▶ ";
}

/* ============================================================================
   Progress
   ============================================================================ */
progress {
    display: flex;
    flex-direction: row;
    min-width: 10ch;
    min-height: 1;
    --progress-bar-color: var(--color-progress-bar);
    --progress-track-color: var(--color-progress-track);
    --progress-filled-char: var(--progress-filled-char);
    --progress-empty-char: var(--progress-empty-char);
}

/* ============================================================================
   Images
   ============================================================================ */
img {
    display: flex;
    min-width: 1ch;
    min-height: 1;
    object-fit: fill;
}

/* ============================================================================
   Table Elements
   ============================================================================ */
table {
    display: flex;
    flex-direction: column;
    border-style: single;
    border-color: var(--color-border);
    
    /* Table-specific CSS custom properties */
    --table-border-color: var(--color-border);
    --table-header-background: transparent;
    --table-header-color: CanvasText;
    --table-row-background: transparent;
    --table-row-alt-background: transparent;
}

thead {
    display: none; /* Handled by table renderer */
}

tbody {
    display: none; /* Handled by table renderer */
}

tfoot {
    display: none; /* Handled by table renderer */
}

tr {
    display: none; /* Handled by table renderer */
}

td,
th {
    display: none; /* Handled by table renderer */
    padding: 0 1ch;
}

th {
    font-weight: bold;
    background-color: var(--table-header-background);
    color: var(--table-header-color);
}

/* ============================================================================
   Dialog
   ============================================================================ */
dialog {
    display: flex;
    flex-direction: column;
    border-style: single;
    border-color: var(--color-border);
    background-color: Canvas;
    padding: 1ch;
}

dialog::backdrop {
    background-color: #333333;
}

/* ============================================================================
   Fieldset & Legend
   ============================================================================ */
fieldset {
    display: flex;
    flex-direction: column;
    border-style: single;
    border-color: var(--color-border);
    padding: 1ch;
    margin: 0;
}

legend {
    display: inline-flex;
    padding: 0 1ch;
}

/* ============================================================================
   Generic Element Focus States
   Any element with a border can show focus styling
   ============================================================================ */
*:focus {
    border-color: var(--color-border-focus);
}

/* Elements with borders get focus ring styling */
div:focus,
section:focus,
article:focus,
aside:focus,
nav:focus,
header:focus,
footer:focus,
main:focus,
fieldset:focus {
    border-color: var(--color-border-focus);
}
`;

/**
 * Default layout values used by the Yoga layout engine.
 * These are applied when explicit values are not provided.
 */
export const LAYOUT_DEFAULTS = {
    /** Characters of left margin per list nesting level */
    LIST_INDENT_PER_LEVEL: 2,
    /** Characters of left padding for list marker space */
    LIST_MARKER_PADDING: 3,
    /** Characters of left padding for summary disclosure marker */
    SUMMARY_MARKER_PADDING: 2,
    /** Default width for text input/select/textarea controls */
    DEFAULT_INPUT_WIDTH: 20,
    /** Default width for progress elements */
    DEFAULT_PROGRESS_WIDTH: 20,
} as const;

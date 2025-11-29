# Supported CSS Properties

This document describes all CSS properties supported by the sveltty runtime, including standard properties with CLI-specific behavior and custom properties unique to terminal rendering.

## Supported CSS Properties

### Layout

| Property | Values | Description |
|----------|--------|-------------|
| `display` | `flex`, `none` | Only flex layout is supported |
| `flex-direction` | `row`, `column`, `row-reverse`, `column-reverse` | Main axis direction |
| `flex-wrap` | `nowrap`, `wrap`, `wrap-reverse` | Line wrapping behavior |
| `flex-grow` | `<number>` | Flex grow factor |
| `flex-shrink` | `<number>` | Flex shrink factor |
| `flex-basis` | `<length>`, `auto` | Initial main size |
| `justify-content` | `flex-start`, `flex-end`, `center`, `space-between`, `space-around`, `space-evenly` | Main axis alignment |
| `align-items` | `flex-start`, `flex-end`, `center`, `stretch`, `baseline` | Cross axis alignment |
| `align-self` | `auto`, `flex-start`, `flex-end`, `center`, `stretch`, `baseline` | Individual cross axis alignment |
| `align-content` | `flex-start`, `flex-end`, `center`, `stretch`, `space-between`, `space-around` | Multi-line cross axis alignment |
| `gap` | `<length>` | Gap between flex items (in `ch` units) |
| `row-gap` | `<length>` | Gap between rows |
| `column-gap` | `<length>` | Gap between columns |

### Dimensions

| Property | Values | Description |
|----------|--------|-------------|
| `width` | `<length>`, `<percentage>`, `auto` | Element width (in `ch` units) |
| `height` | `<length>`, `<percentage>`, `auto` | Element height (in lines) |
| `min-width` | `<length>` | Minimum width |
| `min-height` | `<length>` | Minimum height |
| `max-width` | `<length>` | Maximum width |
| `max-height` | `<length>` | Maximum height |

### Spacing

| Property | Values | Description |
|----------|--------|-------------|
| `margin` | `<length>` | Margin on all sides |
| `margin-top` | `<length>` | Top margin |
| `margin-right` | `<length>` | Right margin |
| `margin-bottom` | `<length>` | Bottom margin |
| `margin-left` | `<length>` | Left margin |
| `padding` | `<length>` | Padding on all sides |
| `padding-top` | `<length>` | Top padding |
| `padding-right` | `<length>` | Right padding |
| `padding-bottom` | `<length>` | Bottom padding |
| `padding-left` | `<length>` | Left padding |

### Positioning

| Property | Values | Description |
|----------|--------|-------------|
| `position` | `relative`, `absolute`, `fixed` | Positioning scheme |
| `top` | `<length>` | Top offset |
| `right` | `<length>` | Right offset |
| `bottom` | `<length>` | Bottom offset |
| `left` | `<length>` | Left offset |
| `z-index` | `<integer>` | Stacking order |

### Text Styling

| Property | Values | Description |
|----------|--------|-------------|
| `color` | `<color>` | Text color (hex, RGB, named colors, ANSI) |
| `background-color` | `<color>` | Background color |
| `font-weight` | `bold`, `normal` | Bold text |
| `font-style` | `italic`, `normal` | Italic text |
| `text-decoration` | `underline`, `line-through`, `none` | Text decoration |
| `text-align` | `left`, `center`, `right` | Horizontal text alignment |

### Borders

| Property | Values | Description |
|----------|--------|-------------|
| `border-style` | `none`, `single`, `double`, `round`, `bold`, `classic`, `dotted` | Border line style |
| `border-color` | `<color>` | Border color |
| `--border-background-color` | `<color>` | Background behind border characters |
| `--border-top-background-color` | `<color>` | Background for top border |
| `--border-right-background-color` | `<color>` | Background for right border |
| `--border-bottom-background-color` | `<color>` | Background for bottom border |
| `--border-left-background-color` | `<color>` | Background for left border |
| `--border-top-left-background-color` | `<color>` | Background for top-left corner |
| `--border-top-right-background-color` | `<color>` | Background for top-right corner |
| `--border-bottom-left-background-color` | `<color>` | Background for bottom-left corner |
| `--border-bottom-right-background-color` | `<color>` | Background for bottom-right corner |

Border style characters:

| Style | Corners | Lines |
|-------|---------|-------|
| `single` | `┌ ┐ └ ┘` | `─ │` |
| `double` | `╔ ╗ ╚ ╝` | `═ ║` |
| `round` | `╭ ╮ ╰ ╯` | `─ │` |
| `bold` | `┏ ┓ ┗ ┛` | `━ ┃` |
| `classic` | `+ + + +` | `- \|` |
| `dotted` | `· · · ·` | `· ·` |

---

## CLI-Specific CSS Properties

These properties are unique to the CLI runtime and have no web equivalent. All CLI-specific properties use CSS custom property syntax with `--` prefix.

### List Styling

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `list-style-type` | `disc`, `circle`, `square`, `decimal`, `decimal-leading-zero`, `lower-alpha`, `upper-alpha`, `lower-roman`, `upper-roman`, `none` | Cycles by nesting | Type of list marker |
| `list-style-position` | `inside`, `outside` | `outside` | Marker position relative to content |
| `list-style` | Shorthand | — | Combines type and position |
| `--list-marker-color` | `<color>` | Theme `list.marker.color` | Color of list markers |

```css
ul {
    list-style-type: square;
    --list-marker-color: #ff6b6b;
}

ol {
    list-style-type: upper-roman;
    --list-marker-color: gold;
}

/* Nested lists automatically cycle through: • ◦ ▪ ▫ */
```

### Details/Summary Styling

The disclosure marker is styled using the standard `::marker` pseudo-element:

```css
/* Style marker color */
summary::marker {
    color: #4ecdc4;
}

/* Custom marker characters */
details[open] > summary::marker {
    content: "− ";
}
details:not([open]) > summary::marker {
    content: "+ ";
}

/* Hide the marker entirely */
summary::marker {
    content: none;
}

/* Arrow style markers */
details[open] > summary::marker {
    content: "↓ ";
}
details:not([open]) > summary::marker {
    content: "→ ";
}
```

### Progress Bar Styling

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `--progress-bar-color` | `<color>` | Theme `progress.bar.color` | Color of filled portion |
| `--progress-track-color` | `<color>` | Theme `progress.track.color` | Color of empty portion |
| `--progress-filled-char` | `<string>` | `"█"` | Character for filled portion |
| `--progress-empty-char` | `<string>` | `"░"` | Character for empty portion |

```css
progress {
    --progress-bar-color: #00ff00;
    --progress-track-color: #333333;
    --progress-filled-char: "▓";
    --progress-empty-char: "░";
}

/* ASCII-style progress bar */
progress.ascii {
    --progress-filled-char: "#";
    --progress-empty-char: "-";
}

/* Block-style progress bar */
progress.blocks {
    --progress-filled-char: "▰";
    --progress-empty-char: "▱";
}
```

### Meter Element Styling

The `<meter>` element displays a scalar value within a known range, with automatic coloring based on the value's position relative to `low`, `high`, and `optimum` thresholds. See [MDN meter documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meter).

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `--meter-good-color` | `<color>` | `#22c55e` | Color when value is in good range |
| `--meter-average-color` | `<color>` | `#eab308` | Color when value is in average range |
| `--meter-poor-color` | `<color>` | `#ef4444` | Color when value is in poor range |
| `--meter-track-color` | `<color>` | `gray` | Color of empty portion |
| `--meter-filled-char` | `<string>` | `"█"` | Character for filled portion |
| `--meter-empty-char` | `<string>` | `"░"` | Character for empty portion |

**Coloring logic** (matches browser behavior):
- If `optimum` is in the low segment (≤ `low`): low values are "good" (green), high values are "poor" (red)
- If `optimum` is in the high segment (≥ `high`): high values are "good" (green), low values are "poor" (red)
- If `optimum` is in the middle: middle values are "good", extremes are "average"

```css
meter {
    --meter-good-color: #4ade80;
    --meter-average-color: #facc15;
    --meter-poor-color: #f87171;
}

/* ASCII-style meter */
meter.ascii {
    --meter-filled-char: "=";
    --meter-empty-char: "-";
}
```

**HTML attributes:**
- `value` - Current numeric value (required)
- `min` - Minimum value (default: 0)
- `max` - Maximum value (default: 1)
- `low` - Upper bound of "low" range
- `high` - Lower bound of "high" range
- `optimum` - Optimal value (determines coloring)

```html
<!-- Disk usage: high values are bad -->
<meter value="0.8" min="0" max="1" low="0.3" high="0.7" optimum="0">80%</meter>

<!-- Battery: low values are bad -->
<meter value="0.2" min="0" max="1" low="0.2" high="0.5" optimum="1">20%</meter>
```

### Dialog Element

The `<dialog>` element creates modal and non-modal dialogs. See [MDN dialog documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).

**JavaScript API:**
- `dialog.show()` - Display as non-modal dialog
- `dialog.showModal()` - Display as modal with backdrop
- `dialog.close(returnValue?)` - Close the dialog
- `dialog.open` - Boolean property reflecting open state
- `dialog.returnValue` - String set when closing

**Events:**
- `close` - Fired when dialog closes
- `cancel` - Fired when canceled (Escape key)

**Attributes:**
- `open` - Reflects dialog open state
- `closedby` - Controls close behavior (`'any'`, `'closerequest'`, `'none'`)

**Styling with `::backdrop`:**

The modal backdrop is styled using the standard `::backdrop` pseudo-element:

```css
dialog {
    border-style: double;
    border-color: #4a9eff;
    background-color: #1a1a2e;
    padding: 2ch;
}

dialog::backdrop {
    background-color: rgba(0, 0, 0, 0.7);
}
```

```html
<dialog id="confirm-dialog">
    <p>Are you sure?</p>
    <button autofocus>Yes</button>
    <button>No</button>
</dialog>

<script>
    const dialog = document.getElementById('confirm-dialog');
    dialog.showModal();  // Opens with backdrop
    dialog.close('confirmed');  // Closes and sets returnValue
</script>
```

**Modal vs Non-Modal:**
- Modal dialogs (`showModal()`) include a backdrop and trap focus
- Non-modal dialogs (`show()`) don't have a backdrop
- Escape key closes modal dialogs by default (controlled by `closedby`)

**Autofocus:** Elements with the `autofocus` attribute inside dialogs and popovers receive focus when opened.

### Input/Textarea Caret Styling

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `caret-color` | `<color>` | Theme `caret.color` | Color of text cursor (standard CSS) |
| `--caret-char` | `<string>` | `"\|"` | Character to display as cursor |
| `--caret-inverse` | `true`, `false` | `true` | Whether to invert colors at cursor position |

```css
input {
    caret-color: cyan;
    --caret-char: "█";
    --caret-inverse: false;
}

/* Thin cursor */
input.thin-cursor {
    --caret-char: "▏";
}

/* Underline cursor */
input.underline-cursor {
    --caret-char: "_";
}
```

### Placeholder Styling

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `--placeholder-color` | `<color>` | Theme `input.placeholder.color` | Color of placeholder text |

```css
input {
    --placeholder-color: #666666;
}
```

### Selection Styling

Use the standard `::selection` pseudo-element:

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `color` | `<color>` | `HighlightText` | Text color when selected |
| `background-color` | `<color>` | `Highlight` | Background when selected |

```css
input::selection,
textarea::selection {
    color: white;
    background-color: #0066cc;
}
```

### Picker Styling

Use the `::picker(select)` pseudo-element to style the dropdown popup of `<select>` elements:

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `color` | `<color>` | Inherited from select | Text color in dropdown |
| `background-color` | `<color>` | Inherited from select | Dropdown background |
| `border-color` | `<color>` | Inherited from select | Dropdown border color |

```css
select::picker(select) {
    background-color: #1a1a2e;
    border-color: #0066cc;
    color: white;
}
```

### Overflow & Scrolling

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `overflow` | `visible`, `hidden`, `scroll`, `auto` | `hidden` | How content overflow is handled |
| `overflow-x` | `visible`, `hidden`, `scroll`, `auto` | — | Horizontal overflow behavior |
| `overflow-y` | `visible`, `hidden`, `scroll`, `auto` | — | Vertical overflow behavior |
| `scroll-behavior` | `auto`, `smooth` | `auto` | Scrolling behavior (smooth not yet animated) |

Overflow values:
- `visible` - Content is not clipped
- `hidden` - Content is clipped, no scrolling
- `scroll` - Always show scrollbar
- `auto` - Show scrollbar only when content overflows

```css
.scrollable-list {
    height: 10;
    overflow: auto;
}

.no-scroll {
    overflow: hidden;
}
```

### Scrollbar Styling

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `--scrollbar-track-color` | `<color>` | `#333333` | Color of the scrollbar track |
| `--scrollbar-thumb-color` | `<color>` | `#888888` | Color of the scrollbar thumb |
| `--scrollbar-track-char` | `<string>` | `"│"` | Character used for vertical track |
| `--scrollbar-thumb-char` | `<string>` | `"█"` | Character used for thumb |

```css
/* Custom scrollbar colors */
.dark-scroll {
    --scrollbar-track-color: #1a1a1a;
    --scrollbar-thumb-color: #4a9eff;
}

/* ASCII-style scrollbar */
.ascii-scroll {
    --scrollbar-track-char: "|";
    --scrollbar-thumb-char: "#";
}

/* Minimal scrollbar */
.minimal-scroll {
    --scrollbar-track-char: " ";
    --scrollbar-thumb-char: "▐";
}
```

### Scroll Keyboard Configuration

These properties enable CSS-configurable keyboard bindings for scroll containers. This allows different scroll regions to have different keybindings.

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `--scroll-keyboard` | `auto`, `enabled`, `disabled` | `auto` | Keyboard scrolling mode for this container |
| `--scroll-keys` | `<string>` | — | Shorthand for multiple key bindings |
| `--scroll-key-up` | `<string>` | — | Key(s) to scroll up one line |
| `--scroll-key-down` | `<string>` | — | Key(s) to scroll down one line |
| `--scroll-key-page-up` | `<string>` | — | Key(s) to scroll up one page |
| `--scroll-key-page-down` | `<string>` | — | Key(s) to scroll down one page |
| `--scroll-key-half-up` | `<string>` | — | Key(s) to scroll up half page |
| `--scroll-key-half-down` | `<string>` | — | Key(s) to scroll down half page |
| `--scroll-key-top` | `<string>` | — | Key(s) to scroll to top |
| `--scroll-key-bottom` | `<string>` | — | Key(s) to scroll to bottom |

#### Keyboard Modes

The `--scroll-keyboard` property controls how keyboard scrolling behaves:

| Mode | Behavior |
|------|----------|
| `auto` | Browser-like behavior. Arrow keys scroll by default unless the focused element (e.g., textarea, select, input[type=number]) captures them. Scroll chaining bubbles to parent containers at boundaries. |
| `enabled` | Only explicit key bindings from `--scroll-key-*` properties work. Arrow keys do NOT scroll by default. |
| `disabled` | No keyboard scrolling. Scroll events must be triggered programmatically. |

**Preventing Default Scroll:** In `auto` mode, components can call `event.preventDefault()` on the keyboard event to prevent the default scroll behavior. This allows custom behavior to take over when needed.

**Scroll Chaining:** When a scroll container reaches its scroll boundary (top or bottom), the scroll action bubbles to the next outer scroll container, just like in browsers.

Key format: `modifier+key` where modifier is `ctrl`, `alt`, `shift`, `meta`, or combinations like `ctrl+shift+k`. Multiple keys are separated by `, `.

```css
/* Enable Vim-style scrolling */
.editor-panel {
    overflow: auto;
    --scroll-keyboard: enabled;
    --scroll-key-up: "k";
    --scroll-key-down: "j";
    --scroll-key-half-up: "ctrl+u";
    --scroll-key-half-down: "ctrl+d";
    --scroll-key-top: "g";
    --scroll-key-bottom: "shift+g";
}

/* Enable arrow key scrolling */
.log-viewer {
    overflow: auto;
    --scroll-keyboard: enabled;
    --scroll-key-up: "arrowup";
    --scroll-key-down: "arrowdown";
    --scroll-key-page-up: "shift+arrowup";
    --scroll-key-page-down: "shift+arrowdown";
}

/* Using shorthand for multiple bindings */
.terminal-output {
    overflow: auto;
    --scroll-keyboard: enabled;
    --scroll-keys: "page-up:ctrl+b, page-down:ctrl+f, half-up:ctrl+u, half-down:ctrl+d";
}

/* Multiple key bindings for same action */
.file-browser {
    overflow: auto;
    --scroll-keyboard: enabled;
    --scroll-key-up: "k, arrowup";
    --scroll-key-down: "j, arrowdown";
}

/* Disable keyboard scrolling (scroll programmatically only) */
.custom-scroll-area {
    overflow: auto;
    --scroll-keyboard: disabled;
}

/* Browser-like scrolling (default) - arrows scroll unless element captures them */
.content-panel {
    overflow: auto;
    --scroll-keyboard: auto;  /* This is the default */
}
```

**Preventing Default Scroll in Svelte:**

```svelte
<script>
    function handleKeyDown(event) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();  // Prevents default scroll
            // Custom behavior here
        }
    }
</script>

<div class="scroll-container" on:keydown={handleKeyDown}>
    <!-- Content -->
</div>
```

The shorthand `--scroll-keys` property accepts a comma-separated list of `action:key` pairs:

| Action Name | Description |
|-------------|-------------|
| `up` | Scroll up one line |
| `down` | Scroll down one line |
| `page-up` | Scroll up one page (viewport height) |
| `page-down` | Scroll down one page (viewport height) |
| `half-up` | Scroll up half page |
| `half-down` | Scroll down half page |
| `top` | Scroll to top |
| `bottom` | Scroll to bottom |

Individual properties override the shorthand, allowing you to set defaults and then customize specific actions.

### Image Styling

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `object-fit` | `fill`, `contain`, `cover`, `none`, `scale-down` | `fill` | How image content is resized to fit its container |

The `object-fit` property controls how the image is scaled within its allocated space:

| Value | Behavior |
|-------|----------|
| `fill` | Stretches to fill the entire area (may distort aspect ratio) |
| `contain` | Scales to fit inside, maintaining aspect ratio (may letterbox) |
| `cover` | Scales to cover entire area, maintaining aspect ratio (may crop) |
| `none` | No resizing, uses original image dimensions |
| `scale-down` | Like `contain`, but never scales up beyond original size |

```css
/* Stretch to fill (default, like browsers) */
img {
    object-fit: fill;
}

/* Maintain aspect ratio, fit inside */
img.letterbox {
    object-fit: contain;
}

/* Maintain aspect ratio, fill and crop */
img.cover {
    object-fit: cover;
}

/* Original size */
img.original {
    object-fit: none;
}
```

---

## CSS Custom Properties (Variables)

CSS custom properties are fully supported:

```css
:root {
    --primary-color: #0ea5e9;
    --border-radius: round;
    --marker-char: "→";
}

button {
    background-color: var(--primary-color);
    border-style: var(--border-radius);
}

ul {
    list-marker-color: var(--primary-color);
}
```

---

## Pseudo-Classes

### Supported Pseudo-Classes

| Pseudo-Class | Description |
|--------------|-------------|
| `:focus` | Element has keyboard focus |
| `:focus-within` | Element or descendant has focus |
| `:focus-visible` | Focus is visible (same as `:focus` in CLI) |
| `:hover` | Not applicable in CLI (always false) |
| `:active` | Not applicable in CLI (always false) |
| `:disabled` | Form element is disabled |
| `:enabled` | Form element is enabled |
| `:checked` | Checkbox/radio is checked |
| `:indeterminate` | Checkbox is indeterminate |
| `:valid` | Form element passes validation |
| `:invalid` | Form element fails validation |
| `:required` | Form element has required attribute |
| `:optional` | Form element is optional |
| `:read-only` | Form element is read-only |
| `:read-write` | Form element is editable |
| `:placeholder-shown` | Input showing placeholder |
| `:empty` | Element has no children |
| `:first-child` | First child of parent |
| `:last-child` | Last child of parent |
| `:only-child` | Only child of parent |
| `:nth-child(n)` | Matches nth child |
| `:nth-last-child(n)` | Matches nth child from end |
| `:first-of-type` | First of its type in parent |
| `:last-of-type` | Last of its type in parent |
| `:only-of-type` | Only of its type in parent |
| `:nth-of-type(n)` | Matches nth of type |
| `:nth-last-of-type(n)` | Matches nth of type from end |
| `:not(selector)` | Negation |
| `:is(selector)` | Matches any of the selectors |
| `:where(selector)` | Same as `:is()` but zero specificity |
| `:has(selector)` | Parent has matching descendant |
| `:root` | Root element |
| `:popover-open` | Popover is visible |
| `:modal` | Element is modal |

```css
input:focus {
    border-color: #38bdf8;
    background-color: #0c4a6e;
}

button:disabled {
    color: gray;
    background-color: #1a1a1a;
}

li:first-child {
    color: gold;
}

.container:has(input:focus) {
    border-color: cyan;
}
```

---

## Color Values

### Supported Formats

| Format | Example | Description |
|--------|---------|-------------|
| Hex | `#ff6b6b`, `#f00` | 6 or 3 digit hex |
| RGB | `rgb(255, 107, 107)` | RGB function |
| RGBA | `rgba(255, 107, 107, 0.5)` | RGB with alpha (alpha ignored) |
| Named | `red`, `cyan`, `gold` | CSS named colors |
| ANSI | `ansi(1)`, `ansi(196)` | Direct ANSI color codes |

### ANSI Color Names

Basic 16 colors: `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, and their bright variants (`brightred`, etc.)

### Gradients

CSS gradients are fully supported with 24-bit color interpolation:

#### Linear Gradients

```css
.header {
    background: linear-gradient(to right, #ff0000, #0000ff);
}

.diagonal {
    background: linear-gradient(45deg, red, yellow, green);
}

.vertical {
    background: linear-gradient(to bottom, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}
```

Supported direction keywords:
- `to top`, `to bottom`, `to left`, `to right`
- `to top right`, `to bottom left`, etc.
- Angles: `45deg`, `90deg`, `-30deg`, `0.5turn`, `100grad`, `1.57rad`

#### Radial Gradients

```css
.spotlight {
    background: radial-gradient(circle, white, black);
}

.ellipse {
    background: radial-gradient(ellipse, #ff6b6b 0%, #4ecdc4 50%, #1a535c 100%);
}
```

Supported shapes:
- `circle` - Circular gradient
- `ellipse` - Elliptical gradient (default)

#### Color Stops

Color stops can include positions:

```css
.custom-stops {
    background: linear-gradient(
        to right,
        red 0%,
        yellow 25%,
        green 50%,
        cyan 75%,
        blue 100%
    );
}
```

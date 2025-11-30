# SvelTTY

SvelTTY provides a runtime that allows you to render and interact with Svelte apps in the terminal.

Pains are taken to make it easy to use and translate mindset-wise from the web to a TUI. There are no special `<Box>` or `<Text>` components; just use regular HTML, CSS and JavaScript, including Svelte runes.

- Supports most common HTML elements and attributes (typography, forms, lists, tables, details, progress, etc.) and their CSS properties.
- Full styling of everything using common CSS with a few novel properties for terminal-specific behavior.
- Full 24-bit color support. Renders CSS gradients, `<img>` elements in supported terminals. Colors, alignment/layout, padding/margin, backgrounds, borders, states, gradients et cetera, including calc() and custom CSS variables, work out of the box as you would (mostly) expect.
- Supports JavaScript and Svelte 5 reactivity (`$state`, `$effect`, `$derived`, etc.).
- Popover + anchor positioning API support.

## Installation

```bash
npm install sveltty svelte
```

Svelte is a peer dependency, so you need to install it as well.

## Quick Start

```ts
import { runFile } from 'sveltty';

await runFile('./App.svelte', {
    baseDir: import.meta.dirname,
});
```

or with runner:

```bash
node --import sveltty/register app.js
```

```ts
import App from './App.svelte';
import { runComponent } from 'sveltty';

runComponent(App);
```

See the [example](./example) for a complete example.

### First things to know

- Everything is a flex container; the only `display` values that are supported are `flex` and `none`, with `flex` being the default.
- The base CSS styling for all elements is overrideable. SvelTTY provides a [default "user agent stylesheet"](./src/runtime/style/defaults.ts) that defines the base appearance for all elements in the terminal environment, however, everything is customizable.
- I use `ch` as the CSS sizing unit, but any non-percentage unit is treated the same, so feel free to use `px` etc.
- You can use `<img>` elements to render images in supported terminals. Be sure to set a width and height.

## License

MIT

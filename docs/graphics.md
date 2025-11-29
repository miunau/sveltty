# Terminal Graphics

The CLI runtime supports inline image rendering using multiple terminal graphics protocols. The best available protocol is auto-detected.

## Supported Protocols

| Protocol | Terminals | Features |
|----------|-----------|----------|
| **Kitty** (preferred) | Kitty, WezTerm, Konsole | Full RGBA, positioning, z-index, chunked transfer |
| **iTerm2** | iTerm2 | Inline images with dimensions |
| **Sixel** | XTerm, foot, mlterm, iTerm2 | 256-color indexed images |

## Using `<img>` Elements

Images can be rendered using standard HTML `<img>` elements:

```svelte
<img src="./logo.png" width="20" height="10" alt="Logo" />

<!-- With CSS styling -->
<img src="./photo.jpg" class="cover-image" alt="Photo" />

<style>
    .cover-image {
        width: 40ch;
        height: 20;
        object-fit: cover;
    }
</style>
```

### Image Attributes

| Attribute | Description |
|-----------|-------------|
| `src` | Image source (file path or URL) |
| `alt` | Alt text (shown when graphics not supported) |
| `width` | Width in terminal cells |
| `height` | Height in terminal cells |

Images are loaded asynchronously. While loading, a placeholder box is displayed. When graphics protocols are not supported, the alt text is shown in a bordered box.

## Programmatic API

```typescript
import {
    detectGraphicsCapabilities,
    encodeImage,
    createSolidImage,
} from 'sveltty';

// Detect terminal capabilities
const caps = detectGraphicsCapabilities();
console.log(`Using ${caps.protocol} protocol`);

// Create and encode an image
const image = createSolidImage(100, 50, 255, 0, 0); // Red 100x50 image
const encoded = encodeImage(image, {
    cellWidth: 20,
    cellHeight: 10,
});

// Write to terminal
process.stdout.write(encoded);
```

## Image Options

| Option | Type | Description |
|--------|------|-------------|
| `cellWidth` | `number` | Target width in terminal cells |
| `cellHeight` | `number` | Target height in terminal cells |
| `x` | `number` | X position (Kitty only) |
| `y` | `number` | Y position (Kitty only) |
| `zIndex` | `number` | Layer order (Kitty only) |
| `background` | `boolean` | Place behind text (Kitty only) |
| `id` | `number` | Image ID for updates/deletion |
| `protocol` | `string` | Force specific protocol |

## Kitty-Specific Functions

```typescript
import { deleteKittyImage, clearKittyImages } from 'sveltty';

// Delete specific image
process.stdout.write(deleteKittyImage(42));

// Clear all images
process.stdout.write(clearKittyImages());
```

## Image Loading API

For advanced use cases, you can load and process images directly:

```typescript
import {
    loadImage,
    loadImageForTerminal,
    loadImageCached,
    getImageMetadata,
    createPlaceholderImage,
    clearImageCache,
} from 'sveltty';

// Load an image from file, URL, or buffer
const image = await loadImage('./photo.png', {
    width: 160,   // Target pixel width
    height: 80,   // Target pixel height
    fit: 'cover', // 'fill', 'contain', 'cover', 'inside', 'outside'
});

// Load and resize for terminal cell dimensions
const terminalImage = await loadImageForTerminal(
    './photo.png',
    20,           // Cell width
    10,           // Cell height
    8,            // Pixels per cell width (default: 8)
    16,           // Pixels per cell height (default: 16)
    'cover'       // Object-fit mode
);

// Get image metadata without loading full data
const metadata = await getImageMetadata('./photo.png');
console.log(`${metadata.width}x${metadata.height} ${metadata.format}`);

// Create a placeholder image
const placeholder = createPlaceholderImage(100, 50);

// Load with caching (for repeated loads of same image)
const cached = await loadImageCached('./logo.png', { width: 80, height: 40 });

// Clear the image cache
clearImageCache();
```

---

## Units

| Unit | Description |
|------|-------------|
| `ch` | Character width/height (1ch = 1 terminal column/line) |
| `px` | Alias for `ch` |
| `%` | Percentage of parent dimension |
| (unitless) | Treated as `ch` for most properties |

```css
.box {
    width: 40ch;      /* 40 characters wide */
    height: 10;       /* 10 lines tall */
    padding: 1ch 2ch; /* 1 line top/bottom, 2 chars left/right */
    gap: 1ch;         /* 1 character gap */
}
```


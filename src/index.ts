/**
 * SvelTTY - Main entry point with DOM architecture
 */

import { ensureDomGlobals, ensureRuntimeReady } from './runtime/dom/setup.js';

ensureDomGlobals();
void ensureRuntimeReady();

export { mount } from './runtime/mount.js';
export { runComponent, runSvelteFile, loadSvelteFile, compileSvelte, clearModuleCache, invalidateModule } from './runner.js';

// Export types
export type {
    AppInstance,
    MountOptions,
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
} from './runtime/types.js';

export { document } from './runtime/dom/document.js';

// Graphics support (Kitty, Sixel, iTerm2)
export {
    detectGraphicsCapabilities,
    detectGraphicsCapabilitiesAsync,
    resetGraphicsCapabilities,
    encodeImage,
    encodeKittyImage,
    encodeIterm2Image,
    deleteKittyImage,
    clearKittyImages,
    renderImageAt,
    scaleImageToCells,
    createSolidImage,
    createGradientImage,
} from './runtime/render/graphics.js';
export type {
    GraphicsProtocol,
    GraphicsCapabilities,
    ImageData,
    RenderImageOptions,
} from './runtime/render/graphics.js';

// Sixel-specific exports (lower-level API)
export {
    encodeSixelImage,
    encodeSixelHeader,
    encodeRgbaToSixel,
    rgbaToIndexed,
} from './runtime/render/sixel.js';
export type { SixelImageConfig } from './runtime/render/sixel.js';

// Image loading
export {
    loadImage,
    loadImageForTerminal,
    loadImageCached,
    getImageMetadata,
    createPlaceholderImage,
    clearImageCache,
} from './runtime/render/image-loader.js';
export type { ImageSource, LoadImageOptions } from './runtime/render/image-loader.js';

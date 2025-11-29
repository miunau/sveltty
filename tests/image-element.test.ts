import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    create_root,
    create_element,
    append,
    set_style,
    set_attribute,
    computeLayout,
    renderToString,
    free_node,
} from '../src/runtime/index.js';
import {
    clearRenderedImages,
    getRenderedImages,
    loadImageForNode,
    isImageReady,
    getEncodedImage,
} from '../src/runtime/render/image.js';
import {
    resetGraphicsCapabilities,
} from '../src/runtime/render/graphics.js';
import { scheduleRender } from '../src/runtime/mount.js';

describe('image element', () => {
    beforeEach(() => {
        clearRenderedImages();
        resetGraphicsCapabilities();
    });

    afterEach(() => {
        clearRenderedImages();
        resetGraphicsCapabilities();
    });

    it('creates an img element with src attribute', () => {
        const root = create_root();
        set_style(root, { width: 40, height: 20 });

        const img = create_element('img');
        set_attribute(img, 'src', '/path/to/image.png');
        set_attribute(img, 'alt', 'Test image');
        set_style(img, { width: 10, height: 5 });
        
        append(root, img);

        expect(img.nodeName).toBe('img');
        expect(img.src).toBe('/path/to/image.png');
        expect(img.alt).toBe('Test image');
        
        free_node(root);
    });

    it('renders placeholder when graphics not supported', () => {
        // Ensure no graphics support
        delete process.env.KITTY_WINDOW_ID;
        delete process.env.KITTY_PID;
        delete process.env.TERM_PROGRAM;
        delete process.env.KONSOLE_VERSION;
        delete process.env.WEZTERM_EXECUTABLE;
        delete process.env.MLTERM;
        delete process.env.XTERM_VERSION;
        resetGraphicsCapabilities();

        const root = create_root();
        set_style(root, { width: 40, height: 20 });

        const img = create_element('img');
        set_attribute(img, 'alt', 'Test');
        set_style(img, { width: 10, height: 5 });
        
        append(root, img);
        computeLayout(root, 40, 20);

        const result = renderToString(root);
        
        // Should render placeholder box with alt text
        expect(result.output).toContain('┌');
        expect(result.output).toContain('┐');
        expect(result.output).toContain('└');
        expect(result.output).toContain('┘');
        expect(result.output).toContain('Test');
        
        free_node(root);
    });

    it('renders loading state while image loads', () => {
        // Simulate Kitty terminal
        process.env.KITTY_WINDOW_ID = '1';
        resetGraphicsCapabilities();

        const root = create_root();
        set_style(root, { width: 40, height: 20 });

        const img = create_element('img');
        // Set src which starts async loading
        set_attribute(img, 'src', '/path/to/image.png');
        set_style(img, { width: 10, height: 5 });
        
        append(root, img);
        computeLayout(root, 40, 20);

        // Render before image loads - should show loading indicator
        const result = renderToString(root);
        
        // Should render loading box
        expect(result.output).toContain('┌');
        expect(result.output).toContain('...');
        
        free_node(root);
    });

    it('stores image state on node when src is set', () => {
        process.env.KITTY_WINDOW_ID = '1';
        resetGraphicsCapabilities();

        const img = create_element('img');
        set_style(img, { width: 10, height: 5 });
        
        // Before setting src, no image state
        expect(isImageReady(img)).toBe(false);
        expect(getEncodedImage(img)).toBe(null);
        
        // Set src - starts loading
        set_attribute(img, 'src', '/path/to/image.png');
        
        // Image is loading but not ready yet
        expect(isImageReady(img)).toBe(false);
    });
});

describe('rendered images', () => {
    beforeEach(() => {
        clearRenderedImages();
    });

    afterEach(() => {
        clearRenderedImages();
    });

    it('starts with empty rendered images', () => {
        expect(getRenderedImages().length).toBe(0);
    });

    it('clears rendered images correctly', () => {
        // Rendered images are populated during paintTree
        // Just verify clearing works
        clearRenderedImages();
        expect(getRenderedImages().length).toBe(0);
    });
});

describe('loadImageForNode', () => {
    beforeEach(() => {
        resetGraphicsCapabilities();
    });

    afterEach(() => {
        resetGraphicsCapabilities();
    });

    it('does not load when graphics not supported', () => {
        delete process.env.KITTY_WINDOW_ID;
        delete process.env.KITTY_PID;
        delete process.env.TERM_PROGRAM;
        resetGraphicsCapabilities();

        const img = create_element('img');
        set_style(img, { width: 10, height: 5 });
        
        let renderCalled = false;
        loadImageForNode(img, '/path/to/image.png', () => { renderCalled = false; });
        
        // Should not be ready (no graphics support means no loading)
        expect(isImageReady(img)).toBe(false);
    });

    it('starts loading when graphics supported', () => {
        process.env.KITTY_WINDOW_ID = '1';
        resetGraphicsCapabilities();

        const img = create_element('img');
        set_style(img, { width: 10, height: 5 });
        
        let renderScheduled = false;
        loadImageForNode(img, '/path/to/image.png', () => { renderScheduled = true; });
        
        // Loading started but not complete
        expect(isImageReady(img)).toBe(false);
    });
});

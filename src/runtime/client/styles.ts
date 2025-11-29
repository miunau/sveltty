/**
 * Style handling for CLI
 */
import { registerStylesheet } from '../style/stylesheet.js';

/**
 * Append styles triggered by compiled Svelte components.
 * Reuses the CLI stylesheet registry instead of actual DOM <style> tags.
 */

type StylePayload = {
    hash?: string;
    code?: string;
};

export function append_styles(target: any, style_sheet_id: string | StylePayload, styles?: string): void {
    if (style_sheet_id && typeof style_sheet_id === 'object' && typeof style_sheet_id.code === 'string') {
        const id = style_sheet_id.hash ?? 'svelte-inline';
        registerStylesheet(id, style_sheet_id.code);
        return;
    }
    if (typeof style_sheet_id === 'string' && typeof styles === 'string') {
        registerStylesheet(style_sheet_id, styles);
    }
}

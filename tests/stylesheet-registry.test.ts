import { beforeEach, describe, expect, it } from 'vitest';
import { append_styles } from '../src/runtime/client/styles.js';
import {
    getRegisteredStylesheet,
    listRegisteredStylesheets,
    resetStylesheets,
} from '../src/runtime/style/stylesheet.js';

describe('stylesheet registry', () => {
    beforeEach(() => {
        resetStylesheets();
    });

    it('registers selectors and declarations from append_styles', () => {
        append_styles(null, 'svelte-xyz', 'button.svelte-xyz{color:red;margin:4px}');

        const artifact = getRegisteredStylesheet('svelte-xyz');
        expect(artifact).toBeTruthy();
        expect(artifact?.rules.length).toBe(1);

        const rule = artifact?.rules[0];
        expect(rule?.selectors[0][0]).toMatchObject({ type: 'type', name: 'button' });
        expect(rule?.selectors[0][1]).toMatchObject({ type: 'class', name: 'svelte-xyz' });

        const colorDecl = rule?.declarations.find((decl) => decl.property === 'color');
        // css-tree returns string values
        expect(colorDecl?.value).toBe('red');

        const marginDecl = rule?.declarations.find((decl) => decl.property === 'margin');
        // css-tree returns string values like "4px"
        expect(marginDecl?.value).toBe('4px');
    });

    it('deduplicates repeated stylesheet registrations by id', () => {
        append_styles(null, 'svelte-xyz', '.svelte-xyz{color:red}');
        append_styles(null, 'svelte-xyz', '.svelte-xyz{color:blue}');

        const sheets = listRegisteredStylesheets();
        expect(sheets).toHaveLength(1);
    });

    it('resolves CSS custom properties (variables)', () => {
        append_styles(null, 'svelte-vars', `
            :root { --primary-color: #ff0000; --spacing: 2ch; }
            .box.svelte-vars { color: var(--primary-color); margin: var(--spacing); }
        `);

        const artifact = getRegisteredStylesheet('svelte-vars');
        expect(artifact).toBeTruthy();
        
        // Find the .box rule (not the :root rule which only has custom props)
        const boxRule = artifact?.rules.find(r => 
            r.selectors.some(sel => sel.some(c => c.type === 'class' && c.name === 'box'))
        );
        expect(boxRule).toBeTruthy();

        const colorDecl = boxRule?.declarations.find((decl) => decl.property === 'color');
        expect(colorDecl?.value).toBe('#ff0000');

        const marginDecl = boxRule?.declarations.find((decl) => decl.property === 'margin');
        expect(marginDecl?.value).toBe('2ch');
    });

    it('resolves CSS variables with fallback values', () => {
        append_styles(null, 'svelte-fallback', `
            .box.svelte-fallback { color: var(--undefined-var, blue); }
        `);

        const artifact = getRegisteredStylesheet('svelte-fallback');
        const rule = artifact?.rules[0];
        const colorDecl = rule?.declarations.find((decl) => decl.property === 'color');
        expect(colorDecl?.value).toBe('blue');
    });

    it('resolves nested CSS variables', () => {
        append_styles(null, 'svelte-nested', `
            :root { --base: red; --derived: var(--base); }
            .box.svelte-nested { color: var(--derived); }
        `);

        const artifact = getRegisteredStylesheet('svelte-nested');
        const boxRule = artifact?.rules.find(r => 
            r.selectors.some(sel => sel.some(c => c.type === 'class' && c.name === 'box'))
        );
        const colorDecl = boxRule?.declarations.find((decl) => decl.property === 'color');
        expect(colorDecl?.value).toBe('red');
    });
});


import { defineConfig } from 'vitest/config';
import { svelteCliAliasPlugin } from './src/tools/vite-plugin-sveltty.ts';

export default defineConfig({
    plugins: [svelteCliAliasPlugin('workspace')],
    test: {
        environment: 'node',
        include: ['tests/**/*.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['src/**/*.ts'],
        },
    },
});

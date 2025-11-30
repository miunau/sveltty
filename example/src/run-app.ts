import { runFile } from 'sveltty';

// Zero-config - just point to a .svelte file
await runFile('./components/Showcase.svelte', {
    baseDir: import.meta.dirname,
});

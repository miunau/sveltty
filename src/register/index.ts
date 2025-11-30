/**
 * Node.js ESM Loader Registration
 * 
 * Usage: node --import sveltty/register app.js
 * 
 * This enables direct import of .svelte files:
 *   import App from './App.svelte';
 */

import { register } from 'node:module';

// Register the loader hooks
// import.meta.url is already a file:// URL
register('./hooks.js', import.meta.url);


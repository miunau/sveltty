/**
 * Debug File Logger
 * 
 * Provides file-based logging for debugging the CLI runtime.
 * Logs are written to a file to avoid interfering with terminal output.
 * 
 * Usage:
 *   import { log, setLogFile, enableLogging } from './logger.js';
 *   enableLogging(true);
 *   setLogFile('/tmp/sveltty-debug.log');
 *   log('scrollIntoView', { target: node.nodeName, scrollParent: parent.nodeName });
 */

import { appendFileSync, writeFileSync } from 'fs';

let logFile: string | null = null;
let loggingEnabled = false;

/**
 * Set the log file path.
 * @param path - Absolute path to the log file.
 */
export function setLogFile(path: string): void {
    logFile = path;
    // Clear the file on start
    try {
        writeFileSync(path, `=== SvelTTY Debug Log - ${new Date().toISOString()} ===\n`);
    } catch {
        // Ignore errors
    }
}

/**
 * Enable or disable logging.
 * @param enabled - Whether logging should be enabled.
 */
export function enableLogging(enabled: boolean): void {
    loggingEnabled = enabled;
}

/**
 * Check if logging is enabled.
 */
export function isLoggingEnabled(): boolean {
    return loggingEnabled && logFile !== null;
}

/**
 * Log a message to the debug file.
 * @param label - A label for the log entry (e.g., function name).
 * @param data - Optional data to log (will be JSON stringified).
 */
export function log(label: string, data?: Record<string, unknown>): void {
    if (!loggingEnabled || !logFile) return;
    
    try {
        const timestamp = new Date().toISOString().split('T')[1];
        let line = `[${timestamp}] ${label}`;
        if (data !== undefined) {
            // Safely stringify, handling circular references and DOM nodes
            const safeData: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(data)) {
                if (value === null || value === undefined) {
                    safeData[key] = value;
                } else if (typeof value === 'object' && 'nodeName' in value) {
                    // It's a node - just log the name and id
                    const node = value as { nodeName?: string; id?: string };
                    safeData[key] = `<${node.nodeName ?? 'node'}#${node.id ?? ''}>`;
                } else if (typeof value === 'object') {
                    try {
                        // Try to stringify, but catch circular reference errors
                        JSON.stringify(value);
                        safeData[key] = value;
                    } catch {
                        safeData[key] = '[circular]';
                    }
                } else {
                    safeData[key] = value;
                }
            }
            line += ` ${JSON.stringify(safeData)}`;
        }
        appendFileSync(logFile, line + '\n');
    } catch {
        // Ignore logging errors
    }
}

/**
 * Log a function entry with arguments.
 * @param fnName - Function name.
 * @param args - Arguments as key-value pairs.
 */
export function logEntry(fnName: string, args?: Record<string, unknown>): void {
    log(`>>> ${fnName}`, args);
}

/**
 * Log a function exit with return value.
 * @param fnName - Function name.
 * @param result - Return value or result data.
 */
export function logExit(fnName: string, result?: Record<string, unknown>): void {
    log(`<<< ${fnName}`, result);
}


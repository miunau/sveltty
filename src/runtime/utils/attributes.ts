/**
 * Utilities for parsing and normalizing DOM attribute values.
 * 
 * HTML attributes can be strings, numbers, or missing. These utilities
 * provide consistent parsing with proper type narrowing.
 */

/**
 * Parse a value that may be a string or number into a number.
 * Returns the default value if the input is invalid, null, undefined, or empty.
 * 
 * @param value - The value to parse (may be string, number, null, undefined).
 * @param defaultValue - The default value to return if parsing fails.
 * @returns The parsed number or the default value.
 */
export function parseNumericAttribute(value: unknown, defaultValue: number): number {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : defaultValue;
    }
    const num = parseFloat(String(value));
    return Number.isFinite(num) ? num : defaultValue;
}

/**
 * Parse a value that may be a string or number into a number, or return undefined.
 * Used when undefined is a valid sentinel (e.g., indeterminate progress).
 * 
 * @param value - The value to parse (may be string, number, null, undefined).
 * @returns The parsed number or undefined if input is empty/invalid.
 */
export function parseNumericAttributeOrUndefined(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }
    const num = parseFloat(String(value));
    return Number.isFinite(num) ? num : undefined;
}

/**
 * Parse a string attribute, converting to string if needed.
 * Returns undefined if the value is null, undefined, or empty.
 * 
 * @param value - The value to parse.
 * @returns The string value or undefined.
 */
export function parseStringAttribute(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    return String(value);
}

/**
 * Parse a boolean attribute following HTML semantics.
 * In HTML, boolean attributes are true if present (even if empty string).
 * 
 * @param value - The attribute value.
 * @returns true if the attribute is present (not undefined/null), false otherwise.
 */
export function parseBooleanAttribute(value: unknown): boolean {
    return value !== undefined && value !== null;
}


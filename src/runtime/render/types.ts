import type { TextStyle } from '../types.js';

export interface GridCell {
    char: string;
    style?: TextStyle;
}

export interface ClipRect {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

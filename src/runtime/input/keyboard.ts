import type { KeyPressEvent } from '../types.js';
import { log } from '../logger.js';

export interface RawKey {
    key: string;
    code: string;
    sequence: string;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
    repeat: boolean;
    tab: boolean;
    escape: boolean;
    enter: boolean;
    backspace: boolean;
    delete: boolean;
    upArrow: boolean;
    downArrow: boolean;
    leftArrow: boolean;
    rightArrow: boolean;
    home: boolean;
    end: boolean;
}

const CTRL_C = 0x03;
const TAB = 0x09;
const ENTER = 0x0d;
const LF = 0x0a;
const SPACE = 0x20;
const ESC = 0x1b;
const BACKSPACE = 0x7f;

const codeFromKey = (key: string): string => {
    if (key.length === 1 && /[a-z]/i.test(key)) {
        return `Key${key.toUpperCase()}`;
    }
    if (key.length === 1 && /[0-9]/.test(key)) {
        return `Digit${key}`;
    }
    const special: Record<string, string> = {
        Tab: 'Tab',
        Enter: 'Enter',
        Escape: 'Escape',
        Backspace: 'Backspace',
        Delete: 'Delete',
        ArrowUp: 'ArrowUp',
        ArrowDown: 'ArrowDown',
        ArrowLeft: 'ArrowLeft',
        ArrowRight: 'ArrowRight',
        Home: 'Home',
        End: 'End',
        ' ': 'Space',
    };
    return special[key] ?? '';
};

function baseRawKey(): RawKey {
    return {
        key: '',
        code: '',
        sequence: '',
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
        repeat: false,
        tab: false,
        escape: false,
        enter: false,
        backspace: false,
        delete: false,
        upArrow: false,
        downArrow: false,
        leftArrow: false,
        rightArrow: false,
        home: false,
        end: false,
    };
}

export function decodeKey(data: Buffer): RawKey | null {
    const raw = baseRawKey();
    raw.sequence = data.toString();
    
    // Debug logging for keyboard input
    const bytes = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
    log('decodeKey:input', { len: data.length, bytes, str: data.toString() });

    if (data.length === 0) {
        return null;
    }

    if (data.length === 1) {
        const code = data[0];
        switch (code) {
            case CTRL_C:
                raw.ctrl = true;
                raw.key = 'c';
                raw.code = 'KeyC';
                return raw;
            case TAB:
                raw.key = 'Tab';
                raw.code = 'Tab';
                raw.tab = true;
                return raw;
            case ENTER:
            case LF:
                raw.key = 'Enter';
                raw.code = 'Enter';
                raw.enter = true;
                return raw;
            case SPACE:
                raw.key = ' ';
                raw.code = 'Space';
                return raw;
            case ESC:
                raw.key = 'Escape';
                raw.code = 'Escape';
                raw.escape = true;
                return raw;
            case BACKSPACE:
                raw.key = 'Backspace';
                raw.code = 'Backspace';
                raw.backspace = true;
                return raw;
            default: {
                const ch = String.fromCharCode(code);
                const isLetter = /[a-z]/i.test(ch);
                raw.key = ch;
                raw.shift = ch.toUpperCase() === ch && isLetter;
                raw.code = codeFromKey(ch);
                return raw;
            }
        }
    }

    const str = raw.sequence;
    if (str === '\x1b[Z') {
        raw.key = 'Tab';
        raw.code = 'Tab';
        raw.shift = true;
        raw.tab = true;
        return raw;
    }
    if (str === '\x1b[A') {
        raw.key = 'ArrowUp';
        raw.code = 'ArrowUp';
        raw.upArrow = true;
        return raw;
    }
    if (str === '\x1b[B') {
        raw.key = 'ArrowDown';
        raw.code = 'ArrowDown';
        raw.downArrow = true;
        return raw;
    }
    if (str === '\x1b[C') {
        raw.key = 'ArrowRight';
        raw.code = 'ArrowRight';
        raw.rightArrow = true;
        return raw;
    }
    if (str === '\x1b[D') {
        raw.key = 'ArrowLeft';
        raw.code = 'ArrowLeft';
        raw.leftArrow = true;
        return raw;
    }
    // Home key - various terminal encodings
    if (str === '\x1b[H' || str === '\x1b[1~' || str === '\x1bOH') {
        raw.key = 'Home';
        raw.code = 'Home';
        raw.home = true;
        return raw;
    }
    // End key - various terminal encodings
    if (str === '\x1b[F' || str === '\x1b[4~' || str === '\x1bOF') {
        raw.key = 'End';
        raw.code = 'End';
        raw.end = true;
        return raw;
    }

    if (str.startsWith('\x1b')) {
        raw.alt = true;
        const ch = str.slice(1);
        raw.key = ch;
        raw.code = codeFromKey(ch);
        return raw;
    }

    return null;
}

export function rawKeyToPressEvent(raw: RawKey): KeyPressEvent {
    return {
        key: raw.key,
        ctrl: raw.ctrl,
        shift: raw.shift,
        meta: raw.meta,
        escape: raw.escape,
        return: raw.enter,
        tab: raw.tab,
        backspace: raw.backspace,
        delete: raw.delete,
        upArrow: raw.upArrow,
        downArrow: raw.downArrow,
        leftArrow: raw.leftArrow,
        rightArrow: raw.rightArrow,
        home: raw.home,
        end: raw.end,
        alt: raw.alt,
        sequence: raw.sequence,
    };
}


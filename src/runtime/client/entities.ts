/**
 * HTML Entity Decoding
 * 
 * Decodes HTML named entities that Happy DOM doesn't handle.
 * Happy DOM only decodes: &lt; &gt; &amp; &quot; &apos; &nbsp;
 * This module handles the rest of the HTML5 named entities.
 */

/**
 * Common HTML named entities not handled by Happy DOM.
 * This is a subset of the full HTML5 entity list, covering the most commonly used ones.
 */
const HTML_ENTITIES: Record<string, string> = {
    // Currency
    'cent': '\u00A2',
    'pound': '\u00A3',
    'curren': '\u00A4',
    'yen': '\u00A5',
    'euro': '\u20AC',
    
    // Legal/Copyright
    'copy': '\u00A9',
    'reg': '\u00AE',
    'trade': '\u2122',
    
    // Punctuation
    'sect': '\u00A7',
    'para': '\u00B6',
    'middot': '\u00B7',
    'bull': '\u2022',
    'hellip': '\u2026',
    'ndash': '\u2013',
    'mdash': '\u2014',
    'lsquo': '\u2018',
    'rsquo': '\u2019',
    'sbquo': '\u201A',
    'ldquo': '\u201C',
    'rdquo': '\u201D',
    'bdquo': '\u201E',
    'laquo': '\u00AB',
    'raquo': '\u00BB',
    'lsaquo': '\u2039',
    'rsaquo': '\u203A',
    'prime': '\u2032',
    'Prime': '\u2033',
    
    // Math/Technical
    'plusmn': '\u00B1',
    'times': '\u00D7',
    'divide': '\u00F7',
    'minus': '\u2212',
    'lowast': '\u2217',
    'radic': '\u221A',
    'infin': '\u221E',
    'asymp': '\u2248',
    'ne': '\u2260',
    'equiv': '\u2261',
    'le': '\u2264',
    'ge': '\u2265',
    'sum': '\u2211',
    'prod': '\u220F',
    'int': '\u222B',
    'part': '\u2202',
    'nabla': '\u2207',
    'deg': '\u00B0',
    'permil': '\u2030',
    'micro': '\u00B5',
    'frac14': '\u00BC',
    'frac12': '\u00BD',
    'frac34': '\u00BE',
    'sup1': '\u00B9',
    'sup2': '\u00B2',
    'sup3': '\u00B3',
    'ordf': '\u00AA',
    'ordm': '\u00BA',
    
    // Arrows
    'larr': '\u2190',
    'uarr': '\u2191',
    'rarr': '\u2192',
    'darr': '\u2193',
    'harr': '\u2194',
    'crarr': '\u21B5',
    'lArr': '\u21D0',
    'uArr': '\u21D1',
    'rArr': '\u21D2',
    'dArr': '\u21D3',
    'hArr': '\u21D4',
    
    // Symbols
    'spades': '\u2660',
    'clubs': '\u2663',
    'hearts': '\u2665',
    'diams': '\u2666',
    'dagger': '\u2020',
    'Dagger': '\u2021',
    'loz': '\u25CA',
    'not': '\u00AC',
    'macr': '\u00AF',
    'acute': '\u00B4',
    'cedil': '\u00B8',
    'uml': '\u00A8',
    'circ': '\u02C6',
    'tilde': '\u02DC',
    
    // Greek letters (lowercase)
    'alpha': '\u03B1',
    'beta': '\u03B2',
    'gamma': '\u03B3',
    'delta': '\u03B4',
    'epsilon': '\u03B5',
    'zeta': '\u03B6',
    'eta': '\u03B7',
    'theta': '\u03B8',
    'iota': '\u03B9',
    'kappa': '\u03BA',
    'lambda': '\u03BB',
    'mu': '\u03BC',
    'nu': '\u03BD',
    'xi': '\u03BE',
    'omicron': '\u03BF',
    'pi': '\u03C0',
    'rho': '\u03C1',
    'sigmaf': '\u03C2',
    'sigma': '\u03C3',
    'tau': '\u03C4',
    'upsilon': '\u03C5',
    'phi': '\u03C6',
    'chi': '\u03C7',
    'psi': '\u03C8',
    'omega': '\u03C9',
    
    // Greek letters (uppercase)
    'Alpha': '\u0391',
    'Beta': '\u0392',
    'Gamma': '\u0393',
    'Delta': '\u0394',
    'Epsilon': '\u0395',
    'Zeta': '\u0396',
    'Eta': '\u0397',
    'Theta': '\u0398',
    'Iota': '\u0399',
    'Kappa': '\u039A',
    'Lambda': '\u039B',
    'Mu': '\u039C',
    'Nu': '\u039D',
    'Xi': '\u039E',
    'Omicron': '\u039F',
    'Pi': '\u03A0',
    'Rho': '\u03A1',
    'Sigma': '\u03A3',
    'Tau': '\u03A4',
    'Upsilon': '\u03A5',
    'Phi': '\u03A6',
    'Chi': '\u03A7',
    'Psi': '\u03A8',
    'Omega': '\u03A9',
    
    // Special characters
    'iexcl': '\u00A1',
    'iquest': '\u00BF',
    'brvbar': '\u00A6',
    'shy': '\u00AD',
    
    // Accented Latin characters (common)
    'Agrave': '\u00C0',
    'Aacute': '\u00C1',
    'Acirc': '\u00C2',
    'Atilde': '\u00C3',
    'Auml': '\u00C4',
    'Aring': '\u00C5',
    'AElig': '\u00C6',
    'Ccedil': '\u00C7',
    'Egrave': '\u00C8',
    'Eacute': '\u00C9',
    'Ecirc': '\u00CA',
    'Euml': '\u00CB',
    'Igrave': '\u00CC',
    'Iacute': '\u00CD',
    'Icirc': '\u00CE',
    'Iuml': '\u00CF',
    'ETH': '\u00D0',
    'Ntilde': '\u00D1',
    'Ograve': '\u00D2',
    'Oacute': '\u00D3',
    'Ocirc': '\u00D4',
    'Otilde': '\u00D5',
    'Ouml': '\u00D6',
    'Oslash': '\u00D8',
    'Ugrave': '\u00D9',
    'Uacute': '\u00DA',
    'Ucirc': '\u00DB',
    'Uuml': '\u00DC',
    'Yacute': '\u00DD',
    'THORN': '\u00DE',
    'szlig': '\u00DF',
    'agrave': '\u00E0',
    'aacute': '\u00E1',
    'acirc': '\u00E2',
    'atilde': '\u00E3',
    'auml': '\u00E4',
    'aring': '\u00E5',
    'aelig': '\u00E6',
    'ccedil': '\u00E7',
    'egrave': '\u00E8',
    'eacute': '\u00E9',
    'ecirc': '\u00EA',
    'euml': '\u00EB',
    'igrave': '\u00EC',
    'iacute': '\u00ED',
    'icirc': '\u00EE',
    'iuml': '\u00EF',
    'eth': '\u00F0',
    'ntilde': '\u00F1',
    'ograve': '\u00F2',
    'oacute': '\u00F3',
    'ocirc': '\u00F4',
    'otilde': '\u00F5',
    'ouml': '\u00F6',
    'oslash': '\u00F8',
    'ugrave': '\u00F9',
    'uacute': '\u00FA',
    'ucirc': '\u00FB',
    'uuml': '\u00FC',
    'yacute': '\u00FD',
    'thorn': '\u00FE',
    'yuml': '\u00FF',
    'OElig': '\u0152',
    'oelig': '\u0153',
    'Scaron': '\u0160',
    'scaron': '\u0161',
    'Yuml': '\u0178',
    'fnof': '\u0192',
};

/**
 * Decode HTML entities in a string.
 * Handles both named entities (&copy;) and numeric entities (&#169; and &#xA9;).
 * 
 * @param text - Text containing HTML entities
 * @returns Text with entities decoded to their Unicode characters
 */
export function decodeHtmlEntities(text: string): string {
    if (!text || !text.includes('&')) {
        return text;
    }
    
    return text.replace(/&(#?[a-zA-Z0-9]+);/g, (match, entity) => {
        // Numeric entity (decimal)
        if (entity.startsWith('#') && !entity.startsWith('#x') && !entity.startsWith('#X')) {
            const code = parseInt(entity.slice(1), 10);
            if (!isNaN(code) && code >= 0 && code <= 0x10FFFF) {
                return String.fromCodePoint(code);
            }
            return match;
        }
        
        // Numeric entity (hexadecimal)
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
            const code = parseInt(entity.slice(2), 16);
            if (!isNaN(code) && code >= 0 && code <= 0x10FFFF) {
                return String.fromCodePoint(code);
            }
            return match;
        }
        
        // Named entity
        const decoded = HTML_ENTITIES[entity];
        if (decoded) {
            return decoded;
        }
        
        // Unknown entity - return as-is
        return match;
    });
}


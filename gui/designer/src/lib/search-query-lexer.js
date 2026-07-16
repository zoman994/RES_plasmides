/**
 * search-query-lexer — a tiny pure lexer for the query language (REV #2 §6.1).
 *
 * Replaces the old `split(' ')`: it understands `prefix:value`, groups double-quoted
 * values (`"…"` with `\"` and `\\` escapes), and records a source `span` for every
 * token so the UI can atomically lift a recognised prefix/filter into a chip without
 * corrupting neighbouring text. An unclosed quote yields a diagnostic, never a crash.
 *
 * The lexer only SPLITS — it does not resolve prefixes against the registry or validate
 * values (that is classifyQuery's job): `t.prefix` is the raw candidate string (or null).
 *
 * @typedef {{ raw:string, prefix:string|null, value:string, quoted:boolean, span:{start:number,end:number} }} QueryToken
 */

// Any Unicode whitespace separates tokens — clipboard text often carries NBSP ( )
// and other Unicode spaces; \s matches them all.
const isSpace = (c) => /\s/u.test(c);
// A prefix is one or more letters (Latin or Cyrillic, for RU aliases) before a ':'.
const isPrefixChar = (c) => /[A-Za-zА-Яа-яЁё]/.test(c);

/**
 * @param {string} input
 * @returns {{ tokens: QueryToken[], diagnostics: Array<{code:string,severity:string,messageKey:string,span:{start:number,end:number}}> }}
 */
export function tokenizeQuery(input) {
  const s = typeof input === 'string' ? input : '';
  const n = s.length;
  const tokens = [];
  const diagnostics = [];
  let i = 0;

  while (i < n) {
    while (i < n && isSpace(s[i])) i += 1;
    if (i >= n) break;
    const start = i;

    // Optional `prefix:` — letters immediately followed by a colon.
    let j = i;
    while (j < n && isPrefixChar(s[j])) j += 1;
    let prefix = null;
    let valueStart = i;
    if (j > i && j < n && s[j] === ':') {
      prefix = s.slice(i, j);
      valueStart = j + 1;
    }

    let value = '';
    let quoted = false;
    let k = valueStart;

    if (k < n && s[k] === '"') {
      quoted = true;
      k += 1; // opening quote
      let buf = '';
      let closed = false;
      while (k < n) {
        const c = s[k];
        if (c === '\\' && k + 1 < n && (s[k + 1] === '"' || s[k + 1] === '\\')) {
          buf += s[k + 1];
          k += 2;
          continue;
        }
        if (c === '"') { closed = true; k += 1; break; }
        buf += c;
        k += 1;
      }
      value = buf;
      if (!closed) {
        diagnostics.push({
          code: 'unclosed-quote', severity: 'error',
          messageKey: 'search.error.unclosedQuote', span: { start, end: k },
        });
      }
    } else {
      let e = valueStart;
      while (e < n && !isSpace(s[e])) e += 1;
      value = s.slice(valueStart, e);
      k = e;
    }

    const end = k;
    tokens.push({ raw: s.slice(start, end), prefix, value, quoted, span: { start, end } });
    i = end;
  }

  return { tokens, diagnostics };
}

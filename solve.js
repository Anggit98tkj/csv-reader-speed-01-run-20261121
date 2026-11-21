// csv-reader-speed-01-run-20261121: a fast drop-in for csv-reader 1.0.0.
// Written from scratch from the reference's stated policy (BOM drop, LF/CRLF
// ends, stray CR dropped, quoted fields with doubled quotes, quote junk,
// unterminated quotes, short/long row padding and cutting, {code, line, row}
// errors in the order met). No code copied from the baseline.
//
// Speed plan: most records hold no quote and no stray CR, so a whole record
// is answered with one native slice plus split(','). Every other field is
// answered with native indexOf scans and slice chunks instead of a
// character-at-a-time loop, so the common paths allocate almost nothing.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  // Transform one quoted segment: CRLF and lone CR each become one LF, and
  // count the line breaks it holds. Only called when the segment holds a
  // CR or LF at all, which is rare.
  function xform(seg) {
    let out = '';
    let d = 0;
    for (let i = 0; i < seg.length; i++) {
      const ch = seg.charCodeAt(i);
      if (ch === 13) {
        out += '\n';
        d++;
        if (seg.charCodeAt(i + 1) === 10) i++;
      } else {
        if (ch === 10) d++;
        out += seg[i];
      }
    }
    return [out, d];
  }

  // Append one quoted segment to the field value, counting its line breaks.
  function addSeg(value, seg) {
    if (seg.length === 0) return value;
    if (seg.indexOf('\r') === -1 && seg.indexOf('\n') === -1) return value + seg;
    const t = xform(seg);
    line += t[1];
    return value + t[0];
  }

  // Read unquoted characters from pos onto `init` up to the next comma or
  // line break. A CR not followed by LF is dropped (stray_cr). Returns
  // {value, ended, added}: added counts the characters kept, so a caller
  // can tell quote junk from nothing at all.
  function scanUq(init) {
    let value = init;
    let added = 0;
    while (true) {
      const iC = text.indexOf(',', pos);
      const iN = text.indexOf('\n', pos);
      const iR = text.indexOf('\r', pos);
      const c = iC === -1 ? Infinity : iC;
      const n = iN === -1 ? Infinity : iN;
      const r = iR === -1 ? Infinity : iR;
      const m = c < n ? (c < r ? c : r) : (n < r ? n : r);
      if (m === Infinity) {
        if (pos < len) {
          value += text.slice(pos, len);
          added += len - pos;
        }
        pos = len;
        return { value, ended: END, added };
      }
      if (m === c) {
        value += text.slice(pos, m);
        added += m - pos;
        pos = m + 1;
        return { value, ended: COMMA, added };
      }
      if (m === n) {
        value += text.slice(pos, m);
        added += m - pos;
        pos = m + 1;
        line++;
        return { value, ended: LINE_BREAK, added };
      }
      // A CR: CRLF ends the record, a lone CR is dropped with an error.
      if (m + 1 < len && text.charCodeAt(m + 1) === 10) {
        value += text.slice(pos, m);
        added += m - pos;
        pos = m + 2;
        line++;
        return { value, ended: LINE_BREAK, added };
      }
      value += text.slice(pos, m);
      added += m - pos;
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = m + 1;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    let fields = null;

    // Fast path: a whole record with no quote and no stray CR. Find its line
    // end, check the segment holds no quote and no CR except a trailing
    // CRLF one, then split it natively.
    const lf = text.indexOf('\n', pos);
    const segEnd0 = lf === -1 ? len : lf;
    let segEnd = segEnd0;
    if (lf !== -1 && segEnd > pos && text.charCodeAt(segEnd - 1) === 13) segEnd--;
    if (segEnd > pos) {
      const q = text.indexOf('"', pos);
      if (q === -1 || q >= segEnd) {
        const r = text.indexOf('\r', pos);
        if (r === -1 || r >= segEnd) {
          fields = text.slice(pos, segEnd).split(',');
          line++;
          pos = lf === -1 ? len : lf + 1;
        }
      }
    }

    let lastQuoted = false;
    if (fields === null) {
      fields = [];
      let ended = END;
      do {
        let value;
        if (text.charCodeAt(pos) === 34) {
          // Quoted field: run to the next quote that is not doubled.
          const open = pos;
          const openLine = line;
          let qval = '';
          let seg = pos + 1;
          let closed = false;
          let closePos = -1;
          while (true) {
            const qq = text.indexOf('"', seg);
            if (qq === -1) break;
            if (qq + 1 < len && text.charCodeAt(qq + 1) === 34) {
              qval = addSeg(qval, text.slice(seg, qq)) + '"';
              seg = qq + 2;
              continue;
            }
            qval = addSeg(qval, text.slice(seg, qq));
            closePos = qq;
            closed = true;
            break;
          }
          lastQuoted = true;
          if (!closed) {
            // Never closes: literal quote, text after it read again unquoted.
            errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
            line = openLine;
            pos = open + 1;
            const s = scanUq('"');
            value = s.value;
            ended = s.ended;
          } else {
            pos = closePos + 1;
            if (pos >= len) {
              value = qval;
              ended = END;
            } else {
              const c = text.charCodeAt(pos);
              if (c === 44) {
                pos++;
                value = qval;
                ended = COMMA;
              } else if (c === 10) {
                pos++;
                line++;
                value = qval;
                ended = LINE_BREAK;
              } else if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
                pos += 2;
                line++;
                value = qval;
                ended = LINE_BREAK;
              } else {
                // Quote junk: appended as it stands, up to comma or break.
                const s = scanUq(qval);
                value = s.value;
                ended = s.ended;
                if (s.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
              }
            }
          }
        } else {
          const s = scanUq('');
          value = s.value;
          ended = s.ended;
        }
        fields.push(value);
      } while (ended === COMMA);

      // A line that held only stray CRs is left with no characters: no record.
      if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}

// Translate the mysql2-style calls the routes make into node-postgres calls.

// Rewrite `?` placeholders (outside quoted strings) into $1, $2, ... with
// mysql2's expansion rules: a flat array becomes a list (for `IN (?)`), and an
// array of arrays becomes row tuples (for bulk `VALUES ?`). An INSERT without
// its own RETURNING gets `RETURNING *` so callers can read insertId.
export function toPg(sql, params = []) {
  const values = [];
  const push = (v) => {
    values.push(v);
    return `$${values.length}`;
  };
  let out = '';
  let p = 0;
  let quote = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === quote) {
        if (sql[i + 1] === quote) { out += sql[++i]; continue; }
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch !== '?') {
      out += ch;
      continue;
    }
    if (p >= params.length) throw new Error('Not enough parameters for SQL placeholders');
    const v = params[p++];
    if (Array.isArray(v)) {
      if (v.length === 0) out += 'NULL';
      else if (Array.isArray(v[0])) out += v.map((row) => `(${row.map(push).join(', ')})`).join(', ');
      else out += v.map(push).join(', ');
    } else {
      out += push(v);
    }
  }
  if (p !== params.length) throw new Error('Too many parameters for SQL placeholders');
  let text = out.trim();
  if (/^insert\s/i.test(text) && !/\breturning\b/i.test(text)) text += ' RETURNING *';
  return { text, values };
}

// Reads resolve to [rows]; writes to [{ insertId, affectedRows, rows }], the
// shape the routes destructure from mysql2.
export function shapeResult(result) {
  const { command, rows, rowCount } = result;
  if (command === 'INSERT' || command === 'UPDATE' || command === 'DELETE') {
    return [{ insertId: rows?.[0]?.id ?? null, affectedRows: rowCount ?? 0, rows: rows || [] }];
  }
  return [rows || []];
}

// Keep the mysql2 error codes the routes already check.
const ERROR_CODES = {
  23505: 'ER_DUP_ENTRY',
  23503: 'ER_NO_REFERENCED_ROW_2',
};

export function mapError(err) {
  if (err && ERROR_CODES[err.code]) {
    err.pgCode = err.code;
    err.code = ERROR_CODES[err.code];
  }
  return err;
}

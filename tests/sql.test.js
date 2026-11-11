import { describe, it, expect } from 'vitest';
import { toPg, shapeResult, mapError } from '../server/lib/sql.js';

describe('toPg', () => {
  it('numbers placeholders', () => {
    expect(toPg('SELECT * FROM t WHERE a = ? AND b = ?', [1, 'x'])).toEqual({
      text: 'SELECT * FROM t WHERE a = $1 AND b = $2', values: [1, 'x'],
    });
  });

  it('expands a flat array for IN (?)', () => {
    expect(toPg('SELECT 1 FROM t WHERE id IN (?) AND x = ?', [[4, 5, 6], 9])).toEqual({
      text: 'SELECT 1 FROM t WHERE id IN ($1, $2, $3) AND x = $4', values: [4, 5, 6, 9],
    });
  });

  it('turns an empty array into NULL so IN () stays valid', () => {
    expect(toPg('SELECT 1 FROM t WHERE id IN (?)', [[]]).text).toBe('SELECT 1 FROM t WHERE id IN (NULL)');
  });

  it('expands rows for bulk VALUES ? and adds RETURNING *', () => {
    expect(toPg('INSERT INTO t (a, b) VALUES ?', [[[1, 2], [3, 4]]])).toEqual({
      text: 'INSERT INTO t (a, b) VALUES ($1, $2), ($3, $4) RETURNING *', values: [1, 2, 3, 4],
    });
  });

  it('keeps an explicit RETURNING', () => {
    expect(toPg('INSERT INTO t (a) VALUES (?) RETURNING id', [1]).text)
      .toBe('INSERT INTO t (a) VALUES ($1) RETURNING id');
  });

  it('ignores question marks inside quoted strings', () => {
    expect(toPg("SELECT 'why?' AS q, \"a?\" FROM t WHERE x = ? AND y = 'it''s ?'", [7])).toEqual({
      text: "SELECT 'why?' AS q, \"a?\" FROM t WHERE x = $1 AND y = 'it''s ?'", values: [7],
    });
  });

  it('rejects a parameter count mismatch', () => {
    expect(() => toPg('SELECT ?', [])).toThrow();
    expect(() => toPg('SELECT 1', [1])).toThrow();
  });
});

describe('shapeResult', () => {
  it('returns [rows] for reads', () => {
    expect(shapeResult({ command: 'SELECT', rows: [{ a: 1 }], rowCount: 1 })).toEqual([[{ a: 1 }]]);
  });
  it('returns a mysql2-style header for writes', () => {
    const [h] = shapeResult({ command: 'INSERT', rows: [{ id: 12 }], rowCount: 1 });
    expect(h.insertId).toBe(12);
    expect(h.affectedRows).toBe(1);
    const [u] = shapeResult({ command: 'UPDATE', rows: [], rowCount: 0 });
    expect(u).toMatchObject({ insertId: null, affectedRows: 0 });
  });
});

describe('mapError', () => {
  it('maps Postgres unique and foreign key errors to the codes routes check', () => {
    expect(mapError({ code: '23505' }).code).toBe('ER_DUP_ENTRY');
    expect(mapError({ code: '23503' }).code).toBe('ER_NO_REFERENCED_ROW_2');
    expect(mapError({ code: '42P01' }).code).toBe('42P01');
  });
});

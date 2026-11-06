import { describe, expect, it } from 'vitest';
import { ensureSchema } from '../src/schema';

describe('ensureSchema', () => {
  it('runs DDL when pages table is missing', async () => {
    const statements: string[] = [];
    let checkCalled = false;
    
    const mockDb = {
      prepare: (sql: string) => {
        if (sql.includes('sqlite_master')) {
          checkCalled = true;
          return { first: async () => null };
        }
        // DDL statements for batch
        return { _sql: sql, first: async () => null };
      },
      batch: async (stmts: any[]) => {
        statements.push(...stmts.map((s: any) => s._sql));
      },
    };

    await ensureSchema(mockDb as any);

    expect(checkCalled).toBe(true);
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.some(s => s.includes('CREATE TABLE IF NOT EXISTS pages'))).toBe(true);
    expect(statements.some(s => s.includes('CREATE TABLE IF NOT EXISTS chunks'))).toBe(true);
    expect(statements.some(s => s.includes('CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts'))).toBe(true);
  });

  it('skips DDL when pages table exists', async () => {
    let batchCalled = false;
    const mockDb = {
      prepare: (_sql: string) => ({
        first: async () => ({ name: 'pages' }), // Table exists
      }),
      batch: async () => {
        batchCalled = true;
      },
    };

    await ensureSchema(mockDb as any);

    expect(batchCalled).toBe(false);
  });
});

// Per-request measurements; never record query text, identities or credentials.
export function measureDatabase(database: D1Database) {
  const stats = { queries: 0, rowsRead: 0, rowsWritten: 0 };
  if (!database) return { DB: database, stats };
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  function record(result: D1Result) {
    stats.queries++;
    stats.rowsRead += result.meta?.rows_read ?? 0;
    stats.rowsWritten += result.meta?.rows_written ?? 0;
  }
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    const wrapped = new Proxy(statement, {
      get(target, property) {
        if (property === 'bind')
          return (...args: unknown[]) => wrap(Reflect.apply(target.bind, target, args));
        if (property === 'first')
          return async (column?: string) => {
            const result = await target.all<Record<string, unknown>>();
            record(result);
            const row = result.results[0] ?? null;
            return column ? (row?.[column] ?? null) : row;
          };
        if (property === 'all' || property === 'run')
          return async (...args: unknown[]) => {
            const result: D1Result = await Reflect.apply(target[property], target, args);
            record(result);
            return result;
          };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    originals.set(wrapped, statement);
    return wrapped;
  }
  const DB = new Proxy(database, {
    get(target, property) {
      if (property === 'prepare') return (sql: string) => wrap(target.prepare(sql));
      if (property === 'batch')
        return async (statements: D1PreparedStatement[]) => {
          const results = await target.batch(
            statements.map((statement) => originals.get(statement) ?? statement),
          );
          results.forEach(record);
          return results;
        };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { DB, stats };
}

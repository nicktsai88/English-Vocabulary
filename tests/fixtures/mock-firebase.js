const docs = new Map();
globalThis.__mockCloud = docs;
const snap = (path) => ({
  id: path.split('/').at(-1),
  exists: () => docs.has(path),
  data: () => structuredClone(docs.get(path)),
});
const set = (path, value) => docs.set(path, structuredClone(value));
export async function connect() {
  return {
    auth: { currentUser: { getIdTokenResult: async () => ({ claims: { admin: true } }) } },
    U: { signOut: async () => {}, GoogleAuthProvider: class {} },
    db: {},
    F: {
      doc: (_, ...parts) => parts.join('/'),
      collection: (_, ...parts) => parts.join('/'),
      serverTimestamp: () => new Date().toISOString(),
      query: (base, ...clauses) => ({
        base: typeof base === 'string' ? base : base.base,
        clauses: [...(base.clauses || []), ...clauses],
      }),
      orderBy: (field) => ({ order: field }),
      limit: (n) => ({ limit: n }),
      startAfter: (cursor) => ({ cursor: cursor.id }),
      getDocsFromServer: async (q) => {
        const rows = [...docs]
          .filter(
            ([k]) =>
              k.startsWith(q.base + '/') && k.split('/').length === q.base.split('/').length + 1,
          )
          .map(([k]) => snap(k))
          .sort(
            (a, b) =>
              (a.data().level || 0) - (b.data().level || 0) ||
              (a.data().sequence || 0) - (b.data().sequence || 0),
          );
        const c = q.clauses.find((c) => c.cursor),
          n = q.clauses.find((c) => c.limit)?.limit || 250;
        const result = rows.slice(
          c ? rows.findIndex((r) => r.id === c.cursor) + 1 : 0,
          (c ? rows.findIndex((r) => r.id === c.cursor) + 1 : 0) + n,
        );
        return { docs: result, size: result.length };
      },
      getDocFromServer: async (path) => snap(path),
      setDoc: async (path, value) => set(path, value),
      runTransaction: async (_, fn) => {
        const ops = [];
        const result = await fn({
          get: async (path) => snap(path),
          set: (p, d) => ops.push(() => set(p, d)),
          update: (p, d) => ops.push(() => set(p, { ...docs.get(p), ...d })),
        });
        ops.forEach((f) => f());
        return result;
      },
      writeBatch: () => {
        const ops = [];
        return {
          set: (p, d) => ops.push(() => set(p, d)),
          commit: async () => ops.forEach((f) => f()),
        };
      },
    },
  };
}

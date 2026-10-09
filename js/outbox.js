// IndexedDB transactions prevent simultaneous tabs from overwriting each other's events.
let opened;
function database() {
  if (!opened)
    opened = new Promise((resolve, reject) => {
      const request = indexedDB.open('english-vocabulary-outbox', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('events', { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(Error('無法保存離線答案。請允許瀏覽器的本機資料儲存後再試。'));
    });
  return opened;
}
async function operation(mode, fn) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('events', mode);
    let result;
    const request = fn(tx.objectStore('events'));
    request.onsuccess = () => (result = request.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error('本機儲存已取消'));
  });
}
export const outbox = {
  put: (uid, event) =>
    operation('readwrite', (s) => s.put({ key: uid + ':' + event.id, uid, event })),
  async list(uid) {
    return (await operation('readonly', (s) => s.getAll()))
      .filter((x) => x.uid === uid)
      .map((x) => x.event)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  },
  remove: (uid, id) => operation('readwrite', (s) => s.delete(uid + ':' + id)),
};

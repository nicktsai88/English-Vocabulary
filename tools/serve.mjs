import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};
http
  .createServer(async (req, res) => {
    try {
      let url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (url.startsWith('/english-vocabulary/')) url = url.slice('/english-vocabulary'.length);
      let file = path.resolve(root, '.' + url);
      if (file !== root && !file.startsWith(root + path.sep)) throw Error('invalid path');
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(4173, '127.0.0.1', () =>
    console.log('Local: http://127.0.0.1:4173/english-vocabulary/index.html?demo'),
  );

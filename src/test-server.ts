import { createServer } from 'node:http';

const host = '127.0.0.1';
const port = 3000;
const payload = Buffer.alloc(1_000_000);

const server = createServer((request, response) => {
  if (request.url !== '/') {
    response.writeHead(404).end();
    return;
  }

  response.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': payload.byteLength,
    'Cache-Control': 'no-store',
  });
  response.end(payload);
});

server.listen(port, host, () => {
  console.log(`Адрес для проверки: http://${host}:${port}/`);
});

import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it, onTestFinished } from 'vitest';

const exec = promisify(execFile);
const script = fileURLToPath(new URL('../src/index.ts', import.meta.url));

function runCli(...args: string[]) {
  return exec(process.execPath, [script, ...args], { timeout: 4000 });
}

async function serve(handler: RequestListener) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  onTestFinished(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/image`;
}

it('скачивает файл 10 раз последовательно и рассчитывает показатели по полным ответам', async () => {
  const paths: string[] = [];
  let active = 0;
  let maxActive = 0;
  let bodyTimeMs = 0;
  const url = await serve((request, response) => {
    paths.push(request.url!);
    maxActive = Math.max(maxActive, ++active);
    const start = performance.now();
    response.write(Buffer.alloc(4000));
    setTimeout(() => {
      bodyTimeMs += performance.now() - start;
      response.end(Buffer.alloc(6000));
      active--;
    }, 20);
  });

  const start = performance.now();
  const { stdout, stderr } = await runCli(url);
  const elapsedMs = performance.now() - start;

  expect(paths).toEqual(Array(10).fill('/image'));
  expect(maxActive).toBe(1);
  expect(stderr).toBe('');
  expect(stdout).toContain('Всего скачано: 100 КБ');
  const averageMs = Number(stdout.match(/Среднее время запроса: (\d+\.\d+) мс/)?.[1]);
  const speedKBps = Number(stdout.match(/Скорость скачивания: (\d+(?:\.\d+)?) КБ\/с/)?.[1]);
  // Учитываем округление среднего времени до сотых миллисекунды.
  expect(averageMs).toBeGreaterThanOrEqual(bodyTimeMs / 10 - 0.005);
  expect(averageMs).toBeLessThanOrEqual(elapsedMs / 10 + 0.005);
  expect(speedKBps / 1000).toBeCloseTo(0.1 / (10 * averageMs / 1000), 2);
});

it.each([
  [0, '0 байт'],
  [999, '999 байт'],
  [1000, '1 КБ'],
  [1500, '1.5 КБ'],
  [999_999, '999.999 КБ'],
  [1_000_000, '1 МБ'],
  [12_000_000, '12 МБ'],
] as const)('подбирает единицу для %i скачанных байт', async (bytes, expected) => {
  const payload = Buffer.alloc(bytes);
  let firstRequest = true;
  const url = await serve((_request, response) => {
    response.end(firstRequest ? payload : undefined);
    firstRequest = false;
  });

  const { stdout } = await runCli(url);
  expect(stdout.split('\n')).toContain(`Всего скачано: ${expected}`);
  if (bytes === 0) {
    expect(stdout.split('\n')).toContain('Скорость скачивания: 0 байт/с');
  }
});

it('останавливается на первом ошибочном HTTP-ответе', async () => {
  let requests = 0;
  const url = await serve((_request, response) => {
    response.writeHead(++requests === 3 ? 503 : 200).end();
  });

  await expect(runCli(url)).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining('Запрос 3: HTTP 503'),
    stdout: '',
  });
  expect(requests).toBe(3);
});

it.each([
  { args: [], message: 'Укажите один URL' },
  { args: ['bad-url'], message: 'Укажите один URL' },
  { args: ['https://example.com', 'extra'], message: 'Укажите один URL' },
  { args: ['file:///image.jpg'], message: 'Адрес должен начинаться с http:// или https://' },
])('отклоняет аргументы $args', async ({ args, message }) => {
  await expect(runCli(...args)).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining(message),
    stdout: '',
  });
});

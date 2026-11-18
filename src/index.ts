const requestCount = 10;
const byteUnits = ['байт', 'КБ', 'МБ', 'ГБ', 'ТБ', 'ПБ', 'ЭБ'];

function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (Number(value.toFixed(3)) >= 1000 && unit < byteUnits.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${Number(value.toFixed(3))} ${byteUnits[unit]}`;
}

async function measureDownload(url: URL): Promise<void> {
  let totalBytes = 0;
  let totalMs = 0;

  for (let i = 1; i <= requestCount; i++) {
    const start = performance.now();
    const response = await fetch(url, { headers: { 'Accept-Encoding': 'identity' } });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Запрос ${i}: HTTP ${response.status}`);
    }

    if (response.body) {
      for await (const chunk of response.body) {
        totalBytes += chunk.byteLength;
      }
    }
    totalMs += performance.now() - start;
  }

  const bytesPerSecond = totalBytes / (totalMs / 1000);
  console.log(`Среднее время запроса: ${(totalMs / requestCount).toFixed(2)} мс`);
  console.log(`Всего скачано: ${formatBytes(totalBytes)}`);
  console.log(`Скорость скачивания: ${formatBytes(bytesPerSecond)}/с`);
}

try {
  const [address, ...extra] = process.argv.slice(2);
  if (!address || extra.length || !URL.canParse(address)) {
    throw new Error('Укажите один URL, например: yarn start https://example.com/image.jpg');
  }
  const url = new URL(address);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Адрес должен начинаться с http:// или https://');
  }
  await measureDownload(url);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const htmlPath = path.join(__dirname, 'index.html');
const configPath = path.join(repoRoot, 'src', 'data', 'floorPlans.json');
const port = Number(process.env.FLOORPLAN_EDITOR_PORT ?? 4310);

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(data));
}

function isValidConfig(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.version === 'number' &&
      typeof value.updatedAt === 'string' &&
      Array.isArray(value.buildings),
  );
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Missing URL.' });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? `localhost:${port}`}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/') {
    const html = await readFile(htmlPath, 'utf8');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/config') {
    const contents = await readFile(configPath, 'utf8');
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(contents);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/config') {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
    });

    request.on('end', async () => {
      try {
        const nextConfig = JSON.parse(body);

        if (!isValidConfig(nextConfig)) {
          sendJson(response, 400, { error: 'Config mist verplichte velden.' });
          return;
        }

        const normalized = {
          ...nextConfig,
          updatedAt: new Date().toISOString(),
        };

        await writeFile(configPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
        sendJson(response, 200, { ok: true, updatedAt: normalized.updatedAt });
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : 'Onbekende fout tijdens opslaan.',
        });
      }
    });

    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
});

server.listen(port, () => {
  console.log(`Floorplan editor draait op http://localhost:${port}`);
  console.log(`Configbestand: ${configPath}`);
});

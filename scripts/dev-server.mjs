import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, get } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const argList = process.argv.slice(2);

const getArgValue = (name, fallback) => {
  const index = argList.indexOf(name);
  if (index >= 0 && argList[index + 1]) return argList[index + 1];
  return fallback;
};

const host = getArgValue('--host', process.env.HOST || '127.0.0.1');
const requestedPort = Number(getArgValue('--port', process.env.PORT || '5177'));
const smokeMode = args.has('--smoke');

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
]);

const send = (response, status, body, headers = {}) => {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(body);
};

const resolveRequestPath = async (urlPathname) => {
  const decodedPath = decodeURIComponent(urlPathname);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.resolve(root, `.${normalizedPath}`);

  if (!filePath.startsWith(root)) return null;

  const fileStat = await stat(filePath).catch(() => null);
  if (fileStat?.isDirectory()) filePath = path.join(filePath, 'index.html');
  return filePath;
};

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return;
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host || `${host}:${requestedPort}`}`);
    const filePath = await resolveRequestPath(url.pathname);
    if (!filePath) {
      send(response, 403, 'Forbidden');
      return;
    }

    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat?.isFile()) {
      send(response, 404, 'Not found');
      return;
    }

    const contentType = MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': fileStat.size,
      'Cache-Control': 'no-store',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  } catch (error) {
    send(response, 500, `Server error: ${error.message}`);
  }
});

const listen = (port, attemptsLeft = 10) => new Promise((resolve, reject) => {
  const onError = (error) => {
    server.off('listening', onListening);
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is busy, trying ${nextPort}...`);
      resolve(listen(nextPort, attemptsLeft - 1));
      return;
    }
    reject(error);
  };
  const onListening = () => {
    server.off('error', onError);
    resolve(port);
  };
  server.once('error', onError);
  server.once('listening', onListening);
  server.listen(port, host);
});

const smokeCheck = (port) => new Promise((resolve, reject) => {
  get(`http://${host}:${port}/`, (response) => {
    response.resume();
    response.on('end', () => {
      if (response.statusCode === 200) resolve();
      else reject(new Error(`Smoke check returned ${response.statusCode}`));
    });
  }).on('error', reject);
});

const port = await listen(requestedPort);
const url = `http://${host}:${port}/`;
console.log(`Moonrock Crafter is running at ${url}`);
console.log('Press Ctrl+C to stop.');

if (smokeMode) {
  await smokeCheck(port);
  console.log('Smoke check passed.');
  server.close();
}

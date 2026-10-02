// Sirve el build optimizado del panel como lo haría Firebase Hosting: comprimido con brotli, con caché
// para lo que tiene hash en el nombre y con `index.html` para cualquier ruta de la aplicación. Sin
// compresión, la medición de rendimiento sería la de un servidor que nadie usa en producción.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

const root = process.argv[2];
const port = Number(process.argv[3]);
/** Cada archivo se comprime una sola vez, como lo deja listo un CDN: comprimir en cada pedido mediría el servidor. */
const compressed = new Map();
const brotli = (file) => {
  if (!compressed.has(file)) compressed.set(file, brotliCompressSync(readFileSync(file), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
  return compressed.get(file);
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };

createServer((request, response) => {
  const path = normalize(decodeURIComponent((request.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  const type = types[extname(file)] ?? 'application/octet-stream';
  const hashed = /-[A-Z0-9]{8}\.(js|css)$/.test(file);
  response.setHeader('Content-Type', type);
  response.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
  if (/text|javascript|json|svg/.test(type) && /\bbr\b/.test(String(request.headers['accept-encoding']))) {
    response.setHeader('Content-Encoding', 'br');
    response.end(brotli(file));
  } else {
    createReadStream(file).pipe(response);
  }
}).listen(port, () => console.log(`panel optimizado en http://localhost:${port}`));

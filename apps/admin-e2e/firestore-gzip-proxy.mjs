// Firestore como lo recibe el navegador en producción: comprimido con gzip (research §14 de la 002,
// verificado contra un proyecto real). El emulador no comprime, y a la red emulada de la medición le
// llegaban unas 10 veces los bytes que viajan de verdad. Se pone delante del emulador solo para
// `admin-e2e:perf`. Comprime a medida que llegan los fragmentos: el canal de escucha de Firestore es
// un flujo largo, y esperar a que termine lo cortaría.
//
// La medición tiene que errar hacia lo pesimista: el proxy nunca comprime mejor que Firestore real.
// Firestore transfirió 25,2 kB por cada 258 kB que el emulador decodifica del mismo documento (9,8%);
// si gzip baja de RATIO, se rellena con bloques vacíos de deflate, que no cambian lo que se decodifica.
import { createServer, request as forward } from 'node:http';
import { constants, createGzip } from 'node:zlib';

const port = Number(process.argv[2]);
const target = { host: '127.0.0.1', port: Number(process.argv[3]) };
/** Lo mínimo que se transfiere, como fracción de lo decodificado: el 9,8% medido, redondeado hacia arriba. */
const RATIO = 0.1;
/** Un bloque almacenado de deflate, vacío y no final: válido después de un flush, no agrega contenido. */
const EMPTY_STORED_BLOCK = Buffer.from([0x00, 0x00, 0x00, 0xff, 0xff]);

/** Comprime `response` hacia `outgoing`, fragmento por fragmento, sin bajar de RATIO. */
function compress(response, outgoing) {
  const gzip = createGzip();
  let sent = 0;
  let decoded = 0;
  gzip.on('data', (chunk) => {
    sent += chunk.length;
    outgoing.write(chunk);
  });
  gzip.on('end', () => outgoing.end());
  let pending = Promise.resolve();
  response.on('data', (chunk) => {
    response.pause();
    pending = pending.then(async () => {
      decoded += chunk.length;
      gzip.write(chunk);
      // Cada fragmento sale apenas llega, alineado: ahí se puede rellenar.
      await new Promise((resolve) => gzip.flush(constants.Z_SYNC_FLUSH, resolve));
      await new Promise((resolve) => setImmediate(resolve));
      const missing = Math.ceil(decoded * RATIO) - sent;
      if (missing > 0) {
        const padding = Buffer.concat(Array.from({ length: Math.ceil(missing / EMPTY_STORED_BLOCK.length) }, () => EMPTY_STORED_BLOCK));
        sent += padding.length;
        outgoing.write(padding);
      }
      response.resume();
    });
  });
  response.on('end', () => void pending.then(() => gzip.end()));
}

createServer((incoming, outgoing) => {
  const upstream = forward({ ...target, method: incoming.method, path: incoming.url, headers: { ...incoming.headers, host: `${target.host}:${target.port}` } }, (response) => {
    const accepts = /\bgzip\b/.test(String(incoming.headers['accept-encoding']));
    const headers = { ...response.headers };
    if (!accepts || response.headers['content-encoding'] || incoming.method === 'OPTIONS') {
      outgoing.writeHead(response.statusCode ?? 502, headers);
      response.pipe(outgoing);
      return;
    }
    delete headers['content-length'];
    headers['content-encoding'] = 'gzip';
    headers['vary'] = 'Accept-Encoding';
    outgoing.writeHead(response.statusCode ?? 502, headers);
    compress(response, outgoing);
  });
  upstream.on('error', () => outgoing.destroy());
  outgoing.on('close', () => upstream.destroy());
  incoming.pipe(upstream);
}).listen(port, () => console.log(`Firestore con gzip en http://127.0.0.1:${port}`));

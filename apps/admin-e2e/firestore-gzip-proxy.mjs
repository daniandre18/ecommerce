// Firestore como lo recibe el navegador en producción: comprimido con gzip (research §14 de la 002,
// verificado contra un proyecto real). El emulador no comprime, y a la red emulada de la medición le
// llegaban unas 10 veces los bytes que viajan de verdad. Se pone delante del emulador solo para
// `admin-e2e:perf`. Comprime a medida que llegan los fragmentos: el canal de escucha de Firestore es
// un flujo largo, y esperar a que termine lo cortaría.
import { createServer, request as forward } from 'node:http';
import { constants, createGzip } from 'node:zlib';

const port = Number(process.argv[2]);
const target = { host: '127.0.0.1', port: Number(process.argv[3]) };

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
    // Cada fragmento sale apenas llega: Z_SYNC_FLUSH, como un servidor que comprime un flujo.
    const gzip = createGzip({ flush: constants.Z_SYNC_FLUSH });
    response.pipe(gzip).pipe(outgoing);
  });
  upstream.on('error', () => outgoing.destroy());
  outgoing.on('close', () => upstream.destroy());
  incoming.pipe(upstream);
}).listen(port, () => console.log(`Firestore con gzip en http://127.0.0.1:${port}`));

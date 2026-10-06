import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { categoryId, createCategory, emptyCategoryTree, MAX_CATEGORIES, type CategoryTree } from '@ecommerce/domain';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import type { Target } from './page';

// ¿Firestore comprime lo que manda? (research §14 de la 002). Escribe y lee, desde Chromium y con el
// SDK web, un documento con la forma del árbol de categorías en su tope, y registra por CDP el
// `content-encoding` y los bytes de cada respuesta de la lectura.
//
//   Proyecto real (con una colección `medicion-compresion` abierta en sus reglas mientras dura):
//     FIREBASE_PROJECT_ID=… FIREBASE_API_KEY=… FIREBASE_APP_ID=… npx tsx --tsconfig tools/tsconfig.json tools/firestore-compression/measure.ts
//   Emulador (con reglas que abran la misma colección):
//     firebase emulators:exec --only firestore --project demo-ecommerce "npx tsx --tsconfig tools/tsconfig.json tools/firestore-compression/measure.ts emulador"
//   A través del proxy que comprime (el puerto, después de `emulador`): … measure.ts emulador 8090

/** 1.000 categorías en tres niveles, con los campos de `categoryTreeToDoc`. */
function treeDoc(): Record<string, unknown> {
  let tree: CategoryTree = emptyCategoryTree();
  for (let root = 0; Object.keys(tree.nodes).length < MAX_CATEGORIES; root++) {
    const r = `raiz-${root}`;
    tree = createCategory(tree, { id: categoryId(r), parentId: null, name: `Raíz ${root}` });
    for (let child = 0; child < 4 && Object.keys(tree.nodes).length < MAX_CATEGORIES; child++) {
      const c = `${r}-${child}`;
      tree = createCategory(tree, { id: categoryId(c), parentId: categoryId(r), name: `Categoría ${root}.${child}` });
      for (let leaf = 0; leaf < 5 && Object.keys(tree.nodes).length < MAX_CATEGORIES; leaf++) {
        tree = createCategory(tree, { id: categoryId(`${c}-${leaf}`), parentId: categoryId(c), name: `Subcategoría ${root}.${child}.${leaf}` });
      }
    }
  }
  return {
    nodes: Object.fromEntries(Object.values(tree.nodes).map((n) => [n.id, { name: n.name, slug: n.slug, previousSlugs: [...n.previousSlugs], parentId: n.parentId, position: n.position, hidden: n.hidden }])),
    pendingPrune: [],
  };
}

const emulator = process.argv[2] === 'emulador';
const env = (name: string) => process.env[name] ?? (emulator ? 'demo' : (() => { throw new Error(`Falta ${name}`); })());
const target: Target = emulator
  ? { config: { projectId: 'demo-ecommerce', apiKey: 'demo-key' }, emulator: true, port: Number(process.argv[3] ?? 8080) }
  : { config: { projectId: env('FIREBASE_PROJECT_ID'), apiKey: env('FIREBASE_API_KEY'), appId: env('FIREBASE_APP_ID') }, emulator: false };

interface Seen { url: string; method: string; protocol?: string | undefined; issuer?: string | undefined; encoding?: string | undefined; decoded: number; wire: number }

/** Se corre desde la raíz del repositorio. */
async function main(): Promise<void> {
  const bundled = await build({ entryPoints: [resolve('tools/firestore-compression/page.ts')], bundle: true, format: 'esm', write: false, logLevel: 'warning' });
  const script = bundled.outputFiles[0]?.text ?? '';
  const server = createServer((req, res) => {
    res.setHeader('content-type', req.url === '/page.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/page.js' ? script : '<!doctype html><script type="module" src="/page.js"></script>');
  }).listen(4398);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const seen = new Map<string, Seen>();
  let counting = false;
  cdp.on('Network.requestWillBeSent', (e) => {
    if (counting && /firestore|127\.0\.0\.1:8080/.test(e.request.url)) seen.set(e.requestId, { url: e.request.url.replace(/\?.*/, ''), method: e.request.method, decoded: 0, wire: 0 });
  });
  cdp.on('Network.responseReceived', (e) => {
    const r = seen.get(e.requestId);
    if (!r) return;
    r.protocol = e.response.protocol;
    r.issuer = e.response.securityDetails?.issuer ?? 'sin TLS';
    r.encoding = Object.entries(e.response.headers).find(([k]) => k.toLowerCase() === 'content-encoding')?.[1] ?? 'ninguno';
  });
  cdp.on('Network.dataReceived', (e) => {
    const r = seen.get(e.requestId);
    if (r) {
      r.decoded += e.dataLength;
      r.wire += e.encodedDataLength;
    }
  });

  await page.goto('http://localhost:4398/');
  await page.waitForFunction(() => 'read' in window);
  await page.evaluate(({ t, d }) => (window as unknown as { write: (t: Target, d: unknown) => Promise<void> }).write(t, d), { t: target, d: treeDoc() });
  counting = true;
  const ms = await page.evaluate((t) => (window as unknown as { read: (t: Target) => Promise<number> }).read(t), target);
  await page.waitForTimeout(1000);
  counting = false;
  const rows = [...seen.values()].filter((r) => r.decoded > 0);
  for (const r of rows) console.log(`${r.method} ${r.url} | ${r.protocol} | certificado de: ${r.issuer} | content-encoding: ${r.encoding} | ${r.decoded} B decodificados, ${r.wire} B transferidos`);
  const sum = (pick: (r: Seen) => number) => Math.round(rows.reduce((s, r) => s + pick(r), 0) / 1024);
  console.log(`Lectura: ${sum((r) => r.decoded)} kB decodificados, ${sum((r) => r.wire)} kB transferidos, ${Math.round(ms)} ms`);
  await browser.close();
  server.close();
}

void main();

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkLanguage, filesIn, panelLanguageFiles, visibleTemplateText, type ReviewedWord, type UstedException } from './language';
import { LEXICON as PANEL_LEXICON, USTED_EXCEPTIONS } from './language-exceptions';

// T041 — FR-038, FR-039, SC-008: el panel en tuteo neutro, sin voseo ni imperativos de usted (research §7).
// Las reglas se prueban contra fixtures/language/; la compuerta sobre el panel está al final.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = 'apps/admin/design-system/fixtures/language';

const LEXICON: ReviewedWord[] = [
  { word: 'está', reason: 'presente de estar, igual en tú y en vos' },
  { word: 'será', reason: 'futuro de ser' },
];
const USTED: UstedException[] = [{ text: 'hasta que el servidor confirme', reason: 'subjuntivo en tercera persona' }];

/** Los hallazgos de unos archivos. Las excepciones muertas, solo si se piden: con un archivo suelto, toda
 * excepción de otro archivo parece muerta. */
function run(files: string[], options: { lexicon?: ReviewedWord[]; usted?: UstedException[]; server?: string[]; dead?: boolean } = {}): string[] {
  return checkLanguage({
    root: ROOT,
    files: files.map((file) => `${FIXTURES}/${file}`),
    serverFiles: (options.server ?? []).map((file) => `${FIXTURES}/${file}`),
    lexicon: options.lexicon ?? LEXICON,
    ustedExceptions: options.usted ?? USTED,
  })
    .filter((finding) => options.dead || finding.kind !== 'excepción muerta')
    .map((finding) => finding.message);
}

describe('la compuerta de lenguaje', () => {
  it('encuentra las formas conocidas de vos, con archivo, línea y texto', () => {
    const found = run(['voseo.ts']).filter((line) => line.includes(':2 '));
    const text = '«Tenés que guardar antes. Si querés, podés seguir; sabés que sos el dueño.»';
    expect(found).toEqual(['tenés', 'querés', 'podés', 'sabés', 'sos'].map((word) => `voseo  ${FIXTURES}/voseo.ts:2  ${text}  (${word})`));
  });

  it('marca para revisar los candidatos morfológicos que no están en el léxico', () => {
    const found = run(['voseo.ts']).filter((line) => line.includes(':3 '));
    const text = '«Revisá el SKU, elegí una opción y escribí el nombre.»';
    expect(found).toEqual(['revisá', 'elegí', 'escribí'].map((word) => `revisar  ${FIXTURES}/voseo.ts:3  ${text}  (${word}: palabra no clasificada: ¿voseo o léxico?)`));
  });

  it('encuentra el imperativo de vos con pronombre y sin tilde, y deja pasar el de tú, que lleva tilde', () => {
    const found = run(['voseo.ts']);
    const text = '«Revisalos antes de seguir, movelas a otra categoría y asegurate de que no falte nada.»';
    expect(found.filter((line) => line.includes(':4 '))).toEqual(['revisalos', 'movelas', 'asegurate'].map((word) => `voseo  ${FIXTURES}/voseo.ts:4  ${text}  (${word}: enclítico sin tilde)`));
    expect(found.filter((line) => line.includes(':5 '))).toEqual([]);
  });

  it('cuenta el hiato como dos sílabas ("creá"), y la u muda como ninguna ("qué" es de una)', () => {
    const text = '«Creá una cuenta nueva, o sé breve: qué querés.»';
    expect(run(['voseo.ts']).filter((line) => line.includes(':6 '))).toEqual([
      `revisar  ${FIXTURES}/voseo.ts:6  ${text}  (creá: palabra no clasificada: ¿voseo o léxico?)`,
      `voseo  ${FIXTURES}/voseo.ts:6  ${text}  (querés)`,
    ]);
  });

  it('encuentra el pronombre "vos", el enclítico tras un diptongo ("copialo") y el de dos pronombres con tilde ("pedíselo")', () => {
    const text = '«Vos dejás de ser dueño: copialo a mano y pedíselo al equipo, o pídeselo tú.»';
    expect(run(['voseo.ts']).filter((line) => line.includes(':7 '))).toEqual([
      `voseo  ${FIXTURES}/voseo.ts:7  ${text}  (vos)`,
      `revisar  ${FIXTURES}/voseo.ts:7  ${text}  (dejás: palabra no clasificada: ¿voseo o léxico?)`,
      `voseo  ${FIXTURES}/voseo.ts:7  ${text}  (copialo: enclítico sin tilde)`,
      `voseo  ${FIXTURES}/voseo.ts:7  ${text}  (pedíselo: dos pronombres tras la tilde de vos)`,
    ]);
  });

  it('deja pasar las palabras del léxico, y marca una candidata que no está como "revisar"', () => {
    expect(run(['lexicon.ts'])).toEqual([`revisar  ${FIXTURES}/lexicon.ts:3  «La tienda invitará a sus clientes.»  (invitará: palabra no clasificada: ¿voseo o léxico?)`]);
  });

  it('encuentra el usted de la lista cerrada como palabra completa, sin importar mayúsculas, salvo en su texto exceptuado', () => {
    expect(run(['usted.ts'])).toEqual([
      `usted  ${FIXTURES}/usted.ts:2  «Seleccione una opción y revise los datos.»  (seleccione)`,
      `usted  ${FIXTURES}/usted.ts:2  «Seleccione una opción y revise los datos.»  (revise)`,
      `usted  ${FIXTURES}/usted.ts:3  «GUARDE los cambios.»  (guarde)`,
    ]);
  });

  it('una excepción de usted vale solo para su texto: la misma palabra en otro texto falla', () => {
    const narrow: UstedException[] = [{ text: 'GUARDE los cambios', reason: 'prueba' }, ...USTED];
    expect(run(['usted.ts'], { usted: narrow })).toEqual([
      `usted  ${FIXTURES}/usted.ts:2  «Seleccione una opción y revise los datos.»  (seleccione)`,
      `usted  ${FIXTURES}/usted.ts:2  «Seleccione una opción y revise los datos.»  (revise)`,
    ]);
  });

  it('una entrada del léxico o una excepción que no aparece en ningún texto es una excepción muerta', () => {
    const lexicon: ReviewedWord[] = [...LEXICON, { word: 'jamás', reason: 'adverbio' }];
    const usted: UstedException[] = [...USTED, { text: 'cuando el cliente cancele', reason: 'subjuntivo' }];
    expect(run(['lexicon.ts', 'usted.ts'], { lexicon, usted, dead: true }).filter((line) => line.startsWith('excepción muerta'))).toEqual([
      'excepción muerta  language-exceptions.ts  «jamás»  (no aparece en ningún texto)',
      'excepción muerta  language-exceptions.ts  «cuando el cliente cancele»  (no aparece en ningún texto)',
    ]);
  });

  it('no recorre los comentarios de TypeScript ni los de las plantillas', () => {
    expect(run(['comments.ts'], { lexicon: [], usted: [] })).toEqual([]);
  });

  it('recorre el texto de un .html sin sus comentarios', () => {
    expect(run(['view.html'], { lexicon: [], usted: [] })).toEqual([`revisar  ${FIXTURES}/view.html:2  «Elegí una categoría.»  (elegí: palabra no clasificada: ¿voseo o léxico?)`]);
  });

  it('en el servidor recorre solo los mensajes de BusinessRuleError y HttpsError, también los que llegan por una constante', () => {
    expect(run([], { server: ['server.ts'], lexicon: [], usted: [] })).toEqual([
      `voseo  ${FIXTURES}/server.ts:13  «No tenés permiso para esto»  (tenés)`,
      `voseo  ${FIXTURES}/server.ts:16  «Ya sos miembro de este comercio»  (sos)`,
      `voseo  ${FIXTURES}/server.ts:20  «Ya sos parte de esto»  (sos)`,
    ]);
  });

  it('de una plantilla lee solo lo que se ve o se anuncia: texto, atributos visibles y cadenas de las expresiones', () => {
    const template = `<input matInput autocomplete="off" [formField]="form.name" placeholder="Escribí el SKU" />
@if (canWrite()) {
  <button [attr.aria-label]="'Quitá «' + name + '»'" (click)="remove()">{{ busy() ? 'Guardando…' : 'Guardar' }}</button>
}`;
    const visible = visibleTemplateText(template).split('\n').map((line) => line.trim().replace(/\s+/g, ' '));
    expect(visible).toEqual(['Escribí el SKU', '{', 'Quitá « » Guardando… Guardar', '}']);
  });

  it('no recorre los archivos de pruebas', () => {
    const files = filesIn(ROOT, FIXTURES);
    expect(files).toContain(`${FIXTURES}/voseo.ts`);
    expect(files).toContain(`${FIXTURES}/view.html`);
    expect(files).not.toContain(`${FIXTURES}/ignored.spec.ts`);
  });
});

describe('el panel', () => {
  it('está en tuteo neutro: sin voseo, sin usted de la lista cerrada y sin excepciones muertas (SC-008)', () => {
    const findings = checkLanguage({ root: ROOT, ...panelLanguageFiles(ROOT), lexicon: PANEL_LEXICON, ustedExceptions: USTED_EXCEPTIONS });
    expect(findings.map((finding) => finding.message)).toEqual([]);
  });
});

import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, EMULATORS, idTokenOf, OWNER, PASSWORD } from './support';

// T020 de la 003 — ayudas de design-system.spec.ts. Comparan lo que el navegador **computa**, no las
// clases: así se atrapa también un acento o un color destructivo puesto por otro camino (research §9).

/**
 * Dónde se busca: la vista; solo el diálogo abierto, que es su propia pantalla (edge case de la spec); o
 * solo una parte de la vista, como un estado compartido, por su selector.
 */
export type Scope = 'view' | 'dialog' | { readonly selector: string };

/** El color que el navegador computa para un token, en el esquema activo: el de una sonda con ese fondo. */
async function tokenBackground(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.body.appendChild(document.createElement('div'));
    probe.style.background = `var(${name})`;
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, token);
}

/** Los nombres (aria-label o texto) de los elementos visibles cuyo fondo computado es el del token. */
async function namesWithBackground(page: Page, token: string, scope: Scope): Promise<string[]> {
  const color = await tokenBackground(page, token);
  return page.evaluate(
    ({ color, scope }) => {
      const root =
        scope === 'view' ? document.body : document.querySelector(scope === 'dialog' ? '.cdk-overlay-container [role="dialog"]' : scope.selector);
      if (!root) throw new Error(scope === 'dialog' ? 'No hay un diálogo abierto' : `No hay ningún ${JSON.stringify(scope)}`);
      return [root, ...root.querySelectorAll<HTMLElement>('*')]
        .filter((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.backgroundColor === color;
        })
        .map((element) => (element.getAttribute('aria-label') ?? element.textContent ?? '').trim());
    },
    { color, scope },
  );
}

/** El fondo computado del primer elemento que coincide con el selector es el del token. */
export async function expectBackground(page: Page, selector: string, token: string): Promise<void> {
  const found = await page.locator(selector).first().evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(found, `${selector} no tiene el fondo de ${token}`).toBe(await tokenBackground(page, token));
}

/** SC-004: como máximo un elemento con el acento, y es la acción principal declarada; ninguno si es `null`. */
export async function expectAccent(page: Page, action: string | null, scope: Scope = 'view'): Promise<void> {
  expect(await namesWithBackground(page, '--ds-action-accent', scope)).toEqual(action === null ? [] : [action]);
}

/** FR-009a: el color destructivo está exactamente en los botones declarados, ni uno más ni uno menos. */
export async function expectDestructive(page: Page, names: readonly string[], scope: Scope = 'view'): Promise<void> {
  expect((await namesWithBackground(page, '--ds-action-destructive', scope)).sort()).toEqual([...names].sort());
}

/**
 * SC-005 y FR-010: los planos de la pantalla son distintos entre sí, y la tarjeta se separa del fondo por
 * borde o por sombra. Fuera del marco del comercio no hay barra, y no puede aparecer una.
 */
export async function expectPlanes(page: Page, planes: 'page-card-bar' | 'page-card'): Promise<void> {
  const found = await page.evaluate(() => {
    const background = (selector: string) => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element).backgroundColor : null;
    };
    const card = document.querySelector('.ds-card');
    const style = card ? getComputedStyle(card) : null;
    return {
      page: getComputedStyle(document.body).backgroundColor,
      card: background('.ds-card'),
      bar: background('.ds-bar'),
      cardSeparated: style ? (style.borderTopStyle !== 'none' && Number.parseFloat(style.borderTopWidth) > 0) || style.boxShadow !== 'none' : false,
    };
  });
  expect(found.card, 'la vista no tiene ninguna .ds-card').not.toBeNull();
  expect(found.card).not.toBe(found.page);
  expect(found.cardSeparated, 'la tarjeta no tiene borde ni sombra').toBe(true);
  if (planes === 'page-card-bar') {
    expect(found.bar, 'la vista del comercio no tiene .ds-bar').not.toBeNull();
    expect(new Set([found.page, found.card, found.bar]).size).toBe(3);
  } else {
    expect(found.bar, 'una vista fuera del marco del comercio no tiene barra (FR-010)').toBeNull();
  }
}

/**
 * FR-015 y FR-016: un único `<h1>`, y cada nivel —h1, h2, h3, texto corriente— difiere del siguiente en
 * al menos dos de tamaño, peso, color y espaciado (entre letras o interlineado relativo).
 */
export async function expectTypeHierarchy(page: Page): Promise<void> {
  const levels = await page.evaluate(() => {
    const measure = (element: Element | null) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const size = Number.parseFloat(style.fontSize);
      return {
        tag: element.tagName.toLowerCase(),
        size,
        weight: style.fontWeight,
        color: style.color,
        tracking: style.letterSpacing,
        lineRatio: Math.round((Number.parseFloat(style.lineHeight) / size) * 20) / 20,
      };
    };
    const visible = [...document.querySelectorAll('main h1')].filter((element) => element.getBoundingClientRect().height > 0);
    return { h1Count: visible.length, chain: [measure(visible[0] ?? null), measure(document.querySelector('main h2')), measure(document.querySelector('main h3')), measure(document.body)].filter((level) => level !== null) };
  });
  expect(levels.h1Count, 'cada vista tiene un único título de página (FR-016)').toBe(1);
  for (let i = 0; i + 1 < levels.chain.length; i++) {
    const [upper, lower] = [levels.chain[i], levels.chain[i + 1]];
    if (!upper || !lower) continue;
    const differs = [upper.size !== lower.size, upper.weight !== lower.weight, upper.color !== lower.color, upper.tracking !== lower.tracking || upper.lineRatio !== lower.lineRatio].filter(Boolean).length;
    expect(differs, `${upper.tag} → ${lower.tag} difieren en ${differs} atributos; FR-015 pide al menos dos`).toBeGreaterThanOrEqual(2);
  }
}

/**
 * Una cuenta nueva con un rol que solo lee el catálogo. La usan las categorías (Historia 2 de la 002) y
 * el caso "catálogo sin acento" de la 003. El rol de Catálogo sembrado sí edita el catálogo, así que no
 * sirve para esto.
 */
export async function readOnlyCollaborator(run: string): Promise<string> {
  const owner = await idTokenOf(OWNER);
  const created = await call(owner, 'createRole', { tenantId: 't1', name: `Solo lectura ${run}` });
  const { roleId } = (created.body.result as { data: { roleId: string } }).data;
  await call(owner, 'updateRole', { tenantId: 't1', roleId, permissions: ['catalog.read'] });
  const email = `lector-${run}@t1.test`;
  const invited = await call(owner, 'inviteCollaborator', { tenantId: 't1', email, roleId });
  const { token } = (invited.body.result as { data: { token: string } }).data;
  await fetch(`${EMULATORS.auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const accepted = await call(await idTokenOf(email), 'acceptInvitation', { invitationToken: token });
  expect(accepted.body.result).toEqual(expect.objectContaining({ ok: true }));
  return email;
}

/**
 * T058: con `button` presionado y la onda de Material en su pico, corre `measure`. Sin carrera: se parte de
 * cero ondas, se presiona y se mantiene (mientras el puntero sigue abajo la onda no se apaga) y se espera a
 * que termine de entrar. Se suelta fuera del botón: un clic es bajar y subir sobre el mismo elemento, así
 * que medir no dispara la acción.
 */
export async function whilePressed<T>(page: Page, button: Locator, measure: () => Promise<T>): Promise<T> {
  // Sin ondas en el botón medido (las de los radios de Material son permanentes y están en otro lado), y
  // a la vista: si no, el puntero baja sobre otra cosa.
  await expect(button.locator('.mat-ripple-element')).toHaveCount(0);
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (!box) throw new Error('El botón no está a la vista');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await expect(button.locator('.mat-ripple-element')).toHaveCount(1);
    await button.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined))));
    return await measure();
  } finally {
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }
}

/**
 * El contraste del texto de un botón presionado (`whilePressed`). El fondo es el compuesto que ve la
 * persona: el plano opaco de abajo, los fondos translúcidos, el del botón, su velo de estado y la onda.
 */
export async function pressedContrast(page: Page, button: Locator): Promise<number> {
  return whilePressed(page, button, () =>
    button.evaluate((element) => {
      const parse = (value: string): [number, number, number, number] => {
        const [r = 0, g = 0, b = 0, a = 1] = (value.match(/-?[\d.]+/g) ?? []).map(Number);
        const scale = value.startsWith('color(srgb') ? 255 : 1;
        return [r * scale, g * scale, b * scale, a];
      };
      const over = (bottom: [number, number, number], top: [number, number, number, number], opacity = 1): [number, number, number] => {
        const a = top[3] * opacity;
        return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a)];
      };
      // De abajo hacia arriba: el primer antepasado opaco, y sobre él cada fondo translúcido hasta el botón.
      const chain: Element[] = [];
      let node: Element | null = element;
      while (node) {
        chain.unshift(node);
        if (parse(getComputedStyle(node).backgroundColor)[3] === 1) break;
        node = node.parentElement;
      }
      const opaque = parse(getComputedStyle(chain[0] ?? element).backgroundColor);
      let background: [number, number, number] = [opaque[0], opaque[1], opaque[2]];
      for (const layer of chain.slice(1)) background = over(background, parse(getComputedStyle(layer).backgroundColor));
      const state = element.querySelector('.mat-mdc-button-persistent-ripple');
      if (state) {
        const before = getComputedStyle(state, '::before');
        background = over(background, parse(before.backgroundColor), Number(before.opacity));
      }
      for (const ripple of element.querySelectorAll<HTMLElement>('.mat-ripple-element')) {
        background = over(background, parse(getComputedStyle(ripple).backgroundColor), Number(getComputedStyle(ripple).opacity));
      }
      const luminance = ([r, g, b]: [number, number, number]) => {
        const channel = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const label = element.querySelector('.mdc-button__label') ?? element;
      const text = over(background, parse(getComputedStyle(label).color));
      const [light, dark] = [luminance(text), luminance(background)].sort((x, y) => y - x) as [number, number];
      return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
    }),
  );
}

/**
 * El inventario de pares, leído de apps/admin/design-system/contrast-pairs.ts como texto: la e2e no puede
 * importar otro proyecto (frontera de Nx). Si el formato cambia y se leen menos pares que `id:` hay en el
 * archivo, falla en vez de verificar contra un inventario a medias.
 */
function inventory(): { foreground: string; background: string; layered: boolean }[] {
  const source = readFileSync(join(__dirname, '../../admin/design-system/contrast-pairs.ts'), 'utf8');
  const pairs = [...source.matchAll(/foreground: '(--ds-[\w-]+)',\s*(?:alternate: '--ds-[\w-]+',\s*)?background: '(--ds-[\w-]+)',\s*(layers: \[)?/g)].map((match) => ({
    foreground: match[1] as string,
    background: match[2] as string,
    layered: match[3] !== undefined,
  }));
  const declared = (source.match(/^\s+id: '/gm) ?? []).length;
  if (pairs.length !== declared) throw new Error(`Se leyeron ${pairs.length} pares de contrast-pairs.ts y hay ${declared}: el formato cambió`);
  return pairs;
}
const PAIRS = inventory();
/** Los tokens de color que puede tener un texto o un fondo: los de los pares, de los dos lados. */
const PAIR_TOKENS = [...new Set(PAIRS.flatMap((pair) => [pair.foreground, pair.background]))];
/** Los pares en reposo del inventario, como "primer plano|fondo". Los de estado (`layers`) no se ven quietos. */
const DECLARED = PAIRS.filter((pair) => !pair.layered).map((pair) => `${pair.foreground}|${pair.background}`);

/**
 * T059: el inventario de usos está completo. Todo texto visible y en reposo de la pantalla tiene que ser
 * un par declarado en contrast-pairs.ts: su color y su fondo efectivo (el plano opaco de abajo, con lo
 * translúcido encima) se traducen a tokens con sondas, y la combinación tiene que estar en el inventario.
 * Si una vista estrena un emparejamiento, esto falla y obliga a declararlo, y con eso a re-derivar la
 * paleta contra él. Un color que no es de ningún token también falla. Los deshabilitados se excluyen
 * (WCAG los exime, y tienen sus propios pares de `kind: 'ui'`).
 */
export async function expectDeclaredPairs(page: Page, scope: Scope = 'view'): Promise<void> {
  // En reposo: sin el puntero encima de nada, y con las transiciones de hover (`--ds-motion-short`) ya
  // terminadas. Medir a mitad de una da un fondo intermedio, que no es de ningún token.
  await page.mouse.move(0, 0);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const problems = await page.evaluate(
    ({ tokens, declared, scope }) => {
      const probe = document.body.appendChild(document.createElement('div'));
      const byValue = new Map<string, string[]>();
      for (const token of tokens) {
        probe.style.color = `var(${token})`;
        const value = getComputedStyle(probe).color;
        byValue.set(value, [...(byValue.get(value) ?? []), token]);
      }
      probe.remove();
      const parse = (value: string): [number, number, number, number] => {
        const [r = 0, g = 0, b = 0, a = 1] = (value.match(/-?[\d.]+/g) ?? []).map(Number);
        const scale = value.startsWith('color(srgb') ? 255 : 1;
        return [r * scale, g * scale, b * scale, a];
      };
      const rgb = ([r, g, b]: [number, number, number, ...number[]]) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
      const effectiveBackground = (element: Element) => {
        const chain: Element[] = [];
        let node: Element | null = element;
        while (node) {
          chain.unshift(node);
          if (parse(getComputedStyle(node).backgroundColor)[3] === 1) break;
          node = node.parentElement;
        }
        let [r, g, b] = parse(getComputedStyle(chain[0] ?? element).backgroundColor);
        for (const layer of chain.slice(1)) {
          const [lr, lg, lb, a] = parse(getComputedStyle(layer).backgroundColor);
          [r, g, b] = [lr * a + r * (1 - a), lg * a + g * (1 - a), lb * a + b * (1 - a)];
        }
        return rgb([r, g, b]);
      };
      const root = scope === 'view' ? document.body : document.querySelector(scope === 'dialog' ? '.cdk-overlay-container [role="dialog"]' : scope.selector);
      if (!root) throw new Error('No hay dónde buscar');
      const found = new Set<string>();
      for (const element of root.querySelectorAll<HTMLElement>('*')) {
        const ownText = [...element.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim());
        if (!ownText) continue;
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (box.width === 0 || box.height === 0 || style.visibility === 'hidden' || element.closest('[aria-hidden="true"], .cdk-visually-hidden, [disabled], [aria-disabled="true"], .mat-mdc-button-disabled')) continue;
        const foreground = rgb(parse(style.color));
        const background = effectiveBackground(element);
        const where = `${element.tagName.toLowerCase()}${element.classList.length ? '.' + [...element.classList].slice(0, 2).join('.') : ''} «${element.textContent?.trim().slice(0, 30)}»`;
        const fg = byValue.get(foreground);
        const bg = byValue.get(background);
        if (!fg) found.add(`texto ${foreground} fuera del catálogo: ${where}`);
        else if (!bg) found.add(`fondo ${background} fuera del catálogo: ${where}`);
        else if (!fg.some((f) => bg.some((b) => declared.includes(`${f}|${b}`)))) found.add(`${fg.join(' o ')} sobre ${bg.join(' o ')} no está en el inventario: ${where}`);
      }
      return [...found].sort();
    },
    { tokens: PAIR_TOKENS, declared: DECLARED, scope },
  );
  expect(problems, 'emparejamientos color–superficie sin declarar en contrast-pairs.ts').toEqual([]);
  await expectScale(page);
}

/**
 * T055: la escala en la pantalla, en los mismos puntos de medición que el inventario. Entre dos tarjetas
 * apiladas, `--ds-space-8` (FR-019); un grupo con borde dentro de una tarjeta o de un diálogo, con
 * `--ds-radius-md` (FR-012); el título de un diálogo, en `section-title`, y un `<select>` nativo con los
 * tokens de un control (FR-022). Los valores esperados
 * salen de sondas, no de números escritos aquí.
 */
async function expectScale(page: Page): Promise<void> {
  expect([...(await page.evaluate(cardGaps)), ...(await page.evaluate(groupRadii)), ...(await page.evaluate(dialogTitles)), ...(await page.evaluate(nativeSelects))], 'la escala de espacio, de radio y de tipo').toEqual([]);
}

/**
 * Un `<select>` nativo fuera de un campo de Material (las listas largas de categorías, la barra de
 * selección): texto `text-primary`, contorno `border-control`, radio `radius-md` y el plano de la tarjeta,
 * no los del navegador. Su texto vive en `<option>`, que no tiene caja, así que el inventario de contraste
 * no lo veía. Corre en la página.
 */
function nativeSelects(): string[] {
  const probe = document.body.appendChild(document.createElement('div'));
  const token = (property: 'color' | 'borderTopColor' | 'backgroundColor' | 'borderTopLeftRadius', value: string) => {
    probe.style[property] = value;
    return getComputedStyle(probe)[property];
  };
  const expected = {
    color: token('color', 'var(--ds-text-primary)'),
    borderTopColor: token('borderTopColor', 'var(--ds-border-control)'),
    backgroundColor: token('backgroundColor', 'var(--ds-surface-card)'),
    borderTopLeftRadius: token('borderTopLeftRadius', 'var(--ds-radius-md)'),
  };
  probe.remove();
  const found: string[] = [];
  for (const select of document.querySelectorAll<HTMLSelectElement>('select:not(.mat-mdc-input-element)')) {
    if (select.disabled || select.getBoundingClientRect().height === 0) continue;
    const style = getComputedStyle(select);
    for (const [property, value] of Object.entries(expected) as [keyof typeof expected, string][]) {
      if (style[property] !== value) found.push(`select#${select.id || '?'}: ${property} ${style[property]}, no ${value}`);
    }
  }
  return found;
}

/** El título de un diálogo, en `section-title` (FR-022): Material le da su `headline-small`. Corre en la página. */
function dialogTitles(): string[] {
  const probe = document.body.appendChild(document.createElement('h2'));
  probe.style.font = 'var(--ds-type-section-title)';
  probe.style.letterSpacing = 'var(--ds-type-section-title-tracking)';
  const read = (element: Element) => {
    const style = getComputedStyle(element);
    return `${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.letterSpacing} ${style.fontFamily}`;
  };
  const expected = read(probe);
  probe.remove();
  return [...document.querySelectorAll('.mat-mdc-dialog-title')]
    .filter((title) => title.getBoundingClientRect().height > 0 && read(title) !== expected)
    .map((title) => `título de diálogo «${title.textContent?.trim().slice(0, 30)}»: ${read(title)}, no ${expected} (section-title)`);
}

/** Entre dos tarjetas seguidas, apiladas y sin otro contenido en medio: `--ds-space-8`. Corre en la página. */
function cardGaps(): string[] {
  const probe = document.body.appendChild(document.createElement('div'));
  probe.style.marginTop = 'var(--ds-space-8)';
  const expected = Number.parseFloat(getComputedStyle(probe).marginTop);
  probe.remove();
  const visible = (element: Element) => element.getBoundingClientRect().height > 0 && getComputedStyle(element).visibility !== 'hidden';
  const name = (element: Element) => `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 2).join('.')}`;
  const cards = [...document.querySelectorAll('.ds-card')]
    .filter((card) => visible(card) && !card.parentElement?.closest('.ds-card'))
    .map((card) => ({ card, box: card.getBoundingClientRect() }))
    .sort((a, b) => a.box.top - b.box.top);
  const found: string[] = [];
  for (const [index, upper] of cards.entries()) {
    const lower = cards[index + 1];
    if (!lower || lower.box.left >= upper.box.right || lower.box.right <= upper.box.left) continue;
    const related = (element: Element) => element.contains(upper.card) || element.contains(lower.card) || upper.card.contains(element) || lower.card.contains(element);
    const inBetween = [...document.querySelectorAll('main *')].some((element) => {
      const box = element.getBoundingClientRect();
      return !related(element) && visible(element) && box.top >= upper.box.bottom - 1 && box.bottom <= lower.box.top + 1;
    });
    const gap = Math.round(lower.box.top - upper.box.bottom);
    if (!inBetween && gap !== expected) found.push(`entre ${name(upper.card)} y ${name(lower.card)}: ${gap} px, no ${expected} (space-8)`);
  }
  return found;
}

/**
 * Un grupo con borde dentro de una tarjeta o de un diálogo: `--ds-radius-md`. Un grupo es marcado propio con
 * borde en los cuatro lados; lo que es de Material, o está dentro de un componente de Material, tiene su
 * tratamiento aparte. El contenido y las acciones de un diálogo son marco, no componente. Corre en la página.
 */
function groupRadii(): string[] {
  const probe = document.body.appendChild(document.createElement('div'));
  probe.style.borderTopLeftRadius = 'var(--ds-radius-md)';
  const expected = getComputedStyle(probe).borderTopLeftRadius;
  probe.remove();
  const frame = /^(mat-mdc-dialog-(content|actions|title|surface|container)|mdc-dialog__\w+)$/;
  const material = (element: Element) => element.tagName.startsWith('MAT-') || [...element.classList].some((name) => /^(mat|mdc)-/.test(name) && !frame.test(name));
  const insideMaterial = (element: Element, container: Element) => {
    for (let node: Element | null = element; node && node !== container; node = node.parentElement) if (material(node)) return true;
    return false;
  };
  const bordered = (style: CSSStyleDeclaration) =>
    ['top', 'right', 'bottom', 'left'].every((side) => style.getPropertyValue(`border-${side}-style`) !== 'none' && Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0);
  const name = (element: Element) => `${element.tagName.toLowerCase()}${element.classList.length ? '.' + [...element.classList].slice(0, 2).join('.') : ''}`;
  const found: string[] = [];
  for (const container of document.querySelectorAll('.ds-card, .mat-mdc-dialog-surface')) {
    for (const element of container.querySelectorAll('*')) {
      const style = getComputedStyle(element);
      if (element.getBoundingClientRect().height === 0 || insideMaterial(element, container) || !bordered(style)) continue;
      if (style.borderTopLeftRadius !== '0px' && style.borderTopLeftRadius !== expected) found.push(`${name(element)} dentro de ${name(container)}: radio ${style.borderTopLeftRadius}, no ${expected} (radius-md)`);
    }
  }
  return found;
}

/**
 * T037 (FR-024): el error no depende solo del color. `::before` dibuja un ícono con `mask` sobre un SVG en
 * línea, en el color del texto: tiene que tener máscara, tamaño y el mismo color que el mensaje.
 */
export async function expectErrorIcon(target: Locator): Promise<void> {
  const icon = await target.evaluate((element) => {
    const before = getComputedStyle(element, '::before');
    return {
      mask: before.maskImage || before.getPropertyValue('-webkit-mask-image'),
      width: Number.parseFloat(before.width),
      height: Number.parseFloat(before.height),
      background: before.backgroundColor,
      text: getComputedStyle(element).color,
    };
  });
  expect(icon.mask, 'el ícono de error tiene máscara').toMatch(/^url\(/);
  expect(icon.width, 'el ícono tiene ancho').toBeGreaterThan(0);
  expect(icon.height, 'el ícono tiene alto').toBeGreaterThan(0);
  expect(icon.background, 'el ícono va en el color del mensaje').toBe(icon.text);
}

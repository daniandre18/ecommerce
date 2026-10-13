import { expect, type Page } from '@playwright/test';
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

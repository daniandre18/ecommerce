# Contrato: reglas de seguridad de Firestore

**Feature**: 002-storefront-catalog · **Fase**: 1

Las reglas de la 001 ([firestore-rules](../../001-catalog-rbac/contracts/firestore-rules.md)) rigen
sin cambios: cada colección legible se declara de forma explícita, **sin comodín bajo el
inquilino**, y ninguna regla concede escritura.

## Lo que se suma

```text
match /tenants/{tenantId} {
  // … todo lo de la 001 …

  // Árbol de categorías, secciones destacadas y vocabulario: lo que el panel necesita para
  // operar el catálogo. Cualquier miembro activo los lee (FR-002).
  match /storefront/{docId} {
    allow read: if isActiveMember(tenantId)
      && docId in ['categoryTree', 'sections', 'vocabulary'];
  }

  // Las URL amigables son públicas por naturaleza: el panel las lee para mostrar la URL libre
  // antes de guardar (FR-007). Lectura de a un documento; no se listan.
  match /slugIndex/{slug} {
    allow get: if isActiveMember(tenantId);
  }

  // `gtinIndex` no se declara: lo consulta solo el servidor, como `skuIndex`.
}
```

**Por qué `docId in [...]`**: `storefront` es una colección nueva bajo el inquilino. Declarar sus
tres documentos por nombre impide que un documento futuro de esa colección —por ejemplo,
configuración de la tienda reservada al Propietario— quede legible para cualquier miembro por
heredar esta regla. Es la misma lección que llevó a la 001 a no usar comodines.

**Lo que no cambia**: los campos nuevos del producto y de la variante quedan bajo las reglas de
lectura que ya tenían. Ninguno es sensible: el costo sigue en su documento aparte. Visibilidad del
precio y envío gratis son legibles por todo miembro, en solo lectura para quien no tiene permiso de
precios (FR-003); lo que se protege es su **escritura**, que solo ocurre en la callable.

## Suite de pruebas de reglas: casos nuevos

Continúan la numeración de la 001 (casos 1 a 34). Van en `tests/rules/storefront.spec.ts`, salvo
que se indique otro archivo.

### Aislamiento (FR-001, SC-004)

| # | Caso | Esperado |
|---|---|---|
| 35 | Miembro activo de `t1` lee `t1/storefront/categoryTree`, `sections` y `vocabulary` | permitido |
| 35a | Miembro activo de `t1` cuyo rol **no** tiene `catalog.read` lee `t1/storefront/*` | permitido. **Fija el comportamiento actual a la espera de la decisión pendiente sobre `catalog.read` en la 001** (T102 de la 001): no significa que el modelo esté cerrado |
| 36 | Miembro activo de `t1` lee `t2/storefront/categoryTree` | **denegado** |
| 37 | Miembro activo de `t1` lee `t2/storefront/sections` | **denegado** |
| 38 | Miembro activo de `t1` hace `get` de `t2/slugIndex/{slug}` | **denegado** |
| 39 | Cuenta con membresía `disabled` en `t1` lee `t1/storefront/categoryTree` | **denegado** |
| 40 | Cuenta en `t1` y `t2` lee el árbol de los dos | permitido en cada uno, por su membresía |

### Solo lo declarado (lección de la 001)

| # | Caso | Esperado |
|---|---|---|
| 41 | Miembro activo lee `t1/storefront/otroDocumento` | **denegado** |
| 42 | Miembro activo **lista** `t1/slugIndex` | **denegado** (solo `get`) |
| 43 | Miembro activo lee `t1/gtinIndex/{gtin}` | **denegado** |
| 44 | `member-cannot-read-owner-paths.spec.ts`: la regla de `storefront` no abre `config`, `auditLog`, `invitations` ni `securityEvents` | **denegado**, igual que antes |

### Ninguna escritura desde el cliente (`no-client-writes.spec.ts`)

| # | Caso | Esperado |
|---|---|---|
| 45 | El Propietario escribe `storefront/sections` (agregar el producto 41) | **denegado** |
| 46 | El Propietario escribe `storefront/categoryTree` | **denegado** |
| 47 | El Propietario crea `slugIndex/{slug}` o `gtinIndex/{gtin}` | **denegado** |
| 48 | Un rol de Catálogo actualiza `priceVisible` o `freeShipping` de un producto | **denegado** |

El caso 48 es la segunda barrera de FR-003 y SC-002: la primera es la guarda de la callable, que
además registra el evento de seguridad.

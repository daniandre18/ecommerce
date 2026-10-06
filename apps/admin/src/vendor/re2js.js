// Sustituto de `re2js` en el build del panel (`fileReplacements` de project.json). Firestore lo
// importa solo para evaluar LIKE, regexContains y regexMatch en pipelines, que el panel no usa, y
// pesa 50 KB comprimidos en la carga inicial: ~250 ms en una conexión móvil (SC-009). Si algún día
// se usan esas funciones, esto falla en voz alta en vez de devolver un resultado equivocado.
export class RE2JS {
  static compile() {
    throw new Error('re2js no está incluido en el panel: ver apps/admin/src/vendor/re2js.js');
  }
}

import type { ReviewedWord, UstedException } from './language';

/**
 * El léxico revisado (FR-038, research §7): palabras que coinciden con una forma de voseo y son correctas
 * en tuteo neutro, cada una con su razón. Una palabra nueva que coincide con un candidato y no está aquí
 * hace fallar la compuerta: clasificarla es una decisión de una persona, no de la regla.
 */
export const LEXICON: readonly ReviewedWord[] = [
  // Terminan en vocal tildada o en -ás/-és, como un imperativo o un presente de vos, y no lo son.
  { word: 'más', reason: 'adverbio de cantidad' },
  { word: 'está', reason: 'presente de estar, igual en tú y en vos' },
  { word: 'esté', reason: 'subjuntivo de estar' },
  { word: 'después', reason: 'adverbio de tiempo' },
  { word: 'así', reason: 'adverbio de modo' },
  { word: 'aquí', reason: 'adverbio de lugar; reemplaza al "acá" de la primera versión, que no es neutro' },
  { word: 'será', reason: 'futuro de ser' },
  { word: 'tendrá', reason: 'futuro de tener' },
  { word: 'quedará', reason: 'futuro de quedar' },
  { word: 'dejará', reason: 'futuro de dejar' },
  { word: 'pasará', reason: 'futuro de pasar' },
  { word: 'llevará', reason: 'futuro de llevar' },
  { word: 'generará', reason: 'futuro de generar' },
  // Coinciden con un imperativo de vos con pronombre y sin tilde (`revisalos`), y no lo son.
  { word: 'admite', reason: 'presente de admitir, tercera persona ("un producto admite hasta…")' },
  { word: 'repite', reason: 'presente de repetir, tercera persona' },
  { word: 'necesite', reason: 'subjuntivo de necesitar, tercera persona' },
  { word: 'invite', reason: 'subjuntivo de invitar, tercera persona ("que te invite")' },
  { word: 'digitales', reason: 'adjetivo en plural' },
  { word: 'decimales', reason: 'sustantivo en plural' },
  { word: 'actuales', reason: 'adjetivo en plural' },
];

/**
 * Textos exactos que contienen un imperativo de la lista cerrada de FR-039 y no son usted. Valen solo
 * para su texto: la misma palabra en otro texto falla.
 */
export const USTED_EXCEPTIONS: readonly UstedException[] = [];

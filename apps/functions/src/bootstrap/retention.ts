/**
 * Retención de la bitácora (T087, FR-035): **7 años como mínimo, sin purga automática**.
 *
 * Esta aplicación no borra entradas de bitácora, ni ahora ni al vencer el plazo:
 * - no existe ningún trabajo programado de borrado, y `retention.spec.ts` falla si se agrega una
 *   función programada;
 * - el repositorio del servidor solo sabe anexar (`AuditLogRepository.append`), y las reglas
 *   de Firestore niegan toda escritura desde el cliente, también al Propietario (FR-032);
 * - pasado el plazo, depurar es una decisión de cumplimiento, manual y fuera de esta aplicación,
 *   no un efecto lateral del código.
 *
 * El plazo vive acá para que haya un solo lugar que lo diga; nada lo usa para borrar.
 */
export const AUDIT_RETENTION_YEARS = 7;

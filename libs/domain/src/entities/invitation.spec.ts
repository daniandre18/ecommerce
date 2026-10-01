import { describe, expect, it } from 'vitest';
import { invitationId, roleId, tenantId, uid } from '../value-objects/ids';
import {
  acceptInvitation,
  createInvitation,
  InvalidInvitationError,
  INVITATION_TTL_DAYS,
  isExpired,
  normalizeEmail,
  renewInvitation,
  revokeInvitation,
} from './invitation';

const AT = new Date('2026-09-30T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const later = (days: number) => new Date(AT.getTime() + days * DAY);

const invitation = () =>
  createInvitation({ id: invitationId('i1'), tenantId: tenantId('t1'), email: ' Ana@Correo.Test ', roleId: roleId('catalog'), createdBy: uid('owner'), at: AT });

// T067 — una invitación da acceso solo al aceptarse (FR-007) y caduca a los 14 días.
describe('Invitation', () => {
  it('nace pendiente, con el correo normalizado y caducidad a los 14 días', () => {
    expect(invitation()).toEqual(
      expect.objectContaining({ status: 'pending', email: 'ana@correo.test', expiresAt: later(INVITATION_TTL_DAYS), acceptedAt: null }),
    );
    expect(INVITATION_TTL_DAYS).toBe(14);
  });

  it('rechaza un correo que no lo parece', () => {
    expect(() => createInvitation({ id: invitationId('i1'), tenantId: tenantId('t1'), email: 'ana', roleId: roleId('catalog'), createdBy: uid('o'), at: AT })).toThrow(
      InvalidInvitationError,
    );
  });

  it('caduca exactamente a los 14 días', () => {
    expect(isExpired(invitation(), later(14 - 1 / 24))).toBe(false);
    expect(isExpired(invitation(), later(14))).toBe(true);
  });

  it('se acepta pendiente y vigente', () => {
    expect(acceptInvitation(invitation(), later(1))).toEqual(expect.objectContaining({ status: 'accepted', acceptedAt: later(1) }));
  });

  it.each([
    ['caducada', (i: ReturnType<typeof invitation>) => i, later(15), 'expired'],
    ['revocada', (i: ReturnType<typeof invitation>) => revokeInvitation(i), later(1), 'revoked'],
    ['ya aceptada', (i: ReturnType<typeof invitation>) => acceptInvitation(i, later(1)), later(2), 'accepted'],
  ])('no se acepta %s, y dice por qué', (_label, prepare, at, reason) => {
    expect(() => acceptInvitation(prepare(invitation()), at)).toThrow(expect.objectContaining({ reason }));
  });

  // Reenviar no crea otra: renueva la caducidad, y puede cambiar el rol propuesto.
  it('reenviar renueva la caducidad desde ahora y puede cambiar el rol', () => {
    const renewed = renewInvitation(invitation(), roleId('precios'), later(10));
    expect(renewed).toEqual(expect.objectContaining({ status: 'pending', roleId: 'precios', expiresAt: later(10 + INVITATION_TTL_DAYS) }));
  });

  it('una invitación caducada también se reenvía, y vuelve a estar pendiente', () => {
    expect(renewInvitation(invitation(), roleId('catalog'), later(20)).status).toBe('pending');
  });

  it('no se revoca una ya aceptada', () => {
    expect(() => revokeInvitation(acceptInvitation(invitation(), later(1)))).toThrow(InvalidInvitationError);
  });

  it('el correo se compara sin mayúsculas ni espacios', () => {
    expect(normalizeEmail('  ANA@correo.test')).toBe('ana@correo.test');
  });
});

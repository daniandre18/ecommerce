import { describe, expect, it } from 'vitest';
import { roleId, tenantId, uid } from '../value-objects/ids';
import {
  activateMembership,
  disableMembership,
  InvalidMembershipTransitionError,
  inviteMembership,
  isActive,
  reactivateMembership,
} from './membership';

const AT = new Date('2026-09-30T12:00:00Z');
const invited = () =>
  inviteMembership({
    uid: uid('u1'),
    tenantId: tenantId('t1'),
    roleId: roleId('catalog'),
    displayName: 'Ana',
    email: 'ana@t1.test',
    at: AT,
  });

describe('Membership', () => {
  it('una invitación aún no aceptada no da acceso (FR-007)', () => {
    const m = invited();
    expect(m.status).toBe('invited');
    expect(isActive(m)).toBe(false);
  });

  it('nace sin ser Propietaria', () => {
    expect(invited().isOwner).toBe(false);
  });

  it('se activa al aceptar la invitación', () => {
    const m = activateMembership(invited(), AT);
    expect(isActive(m)).toBe(true);
    expect(m.activatedAt).toEqual(AT);
  });

  it('la baja es lógica y conserva el registro (FR-008a)', () => {
    const active = activateMembership(invited(), AT);
    const disabled = disableMembership(active, AT);
    expect(disabled.status).toBe('disabled');
    expect(isActive(disabled)).toBe(false);
    expect(disabled.displayName).toBe('Ana');
    expect(disabled.disabledAt).toEqual(AT);
  });

  it('se reactiva conservando su identidad', () => {
    const back = reactivateMembership(disableMembership(activateMembership(invited(), AT), AT), AT);
    expect(isActive(back)).toBe(true);
    expect(back.uid).toBe('u1');
    expect(back.disabledAt).toBeNull();
  });

  it('no se puede activar dos veces', () => {
    const active = activateMembership(invited(), AT);
    expect(() => activateMembership(active, AT)).toThrow(InvalidMembershipTransitionError);
  });

  it('no se puede dar de baja una invitación pendiente: se revoca la invitación', () => {
    expect(() => disableMembership(invited(), AT)).toThrow(InvalidMembershipTransitionError);
  });

  it('las transiciones no mutan el original', () => {
    const m = invited();
    activateMembership(m, AT);
    expect(m.status).toBe('invited');
  });
});

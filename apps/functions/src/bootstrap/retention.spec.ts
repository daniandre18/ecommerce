import { describe, expect, it } from 'vitest';
import * as deployed from '../index';
import { AUDIT_RETENTION_YEARS } from './retention';

interface Endpoint {
  readonly callableTrigger?: object;
  readonly scheduleTrigger?: object;
}

// T087 — FR-035: nada de lo que se despliega borra la bitácora con el paso del tiempo.
describe('retención de la bitácora', () => {
  it('es de 7 años como mínimo', () => {
    expect(AUDIT_RETENTION_YEARS).toBeGreaterThanOrEqual(7);
  });

  it('no se despliega ninguna función programada: todas son callable', () => {
    const endpoints = Object.entries(deployed).map(([name, fn]) => [name, (fn as { __endpoint?: Endpoint }).__endpoint] as const);
    expect(endpoints.length).toBeGreaterThan(0);
    for (const [name, endpoint] of endpoints) {
      expect({ name, scheduled: endpoint?.scheduleTrigger !== undefined, callable: endpoint?.callableTrigger !== undefined }).toEqual({
        name,
        scheduled: false,
        callable: true,
      });
    }
  });
});

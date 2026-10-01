import { TestBed } from '@angular/core/testing';

/**
 * Aplica los cambios pendientes y deja correr las promesas. No usa `whenStable()`: un `resource`
 * que espera su primer valor es una tarea pendiente, y la vista de carga nunca se estabilizaría.
 */
export async function settle(): Promise<void> {
  TestBed.tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  TestBed.tick();
}

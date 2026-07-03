/**
 * Setup smoke test (Task 0).
 * Confirms the Jest + ts-jest TypeScript pipeline, the "@/..." path alias,
 * and fast-check are all wired up correctly. Safe to remove once real
 * test suites exist.
 */
import fc from 'fast-check';

describe('test environment setup', () => {
  it('runs TypeScript tests via ts-jest', () => {
    const value: number = 1 + 1;
    expect(value).toBe(2);
  });

  it('supports property-based testing with fast-check', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
    );
  });
});

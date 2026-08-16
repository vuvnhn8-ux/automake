import { describe, expect, it } from 'vitest';
import { buildState, verifyState } from '../src/lib/facebook-state.js';

describe('facebook OAuth state', () => {
  const secret = 'unit-test-jwt-secret-for-facebook-state';

  it('binds a state to the user id', () => {
    const state = buildState('user-123', secret);
    expect(verifyState(state, secret)).toBe('user-123');
  });

  it('rejects a state signed with a different secret', () => {
    const state = buildState('user-123', secret);
    expect(verifyState(state, 'another-secret')).toBeNull();
  });

  it('rejects a tampered user id', () => {
    const state = buildState('user-123', secret);
    const parts = state.split('.');
    parts[1] = 'user-456';
    expect(verifyState(parts.join('.'), secret)).toBeNull();
  });

  it('rejects malformed state', () => {
    expect(verifyState('nope', secret)).toBeNull();
    expect(verifyState('a.b.c.d', secret)).toBeNull();
    expect(verifyState('', secret)).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { isAuthorized } from '../src/auth';

describe('isAuthorized', () => {
  it('returns true when the provided password matches', () => {
    expect(isAuthorized('correct-horse', 'correct-horse')).toBe(true);
  });

  it('returns false when the password does not match', () => {
    expect(isAuthorized('wrong', 'correct-horse')).toBe(false);
  });

  it('returns false when no password was provided', () => {
    expect(isAuthorized(null, 'correct-horse')).toBe(false);
  });

  it('returns false for an empty string password', () => {
    expect(isAuthorized('', 'correct-horse')).toBe(false);
  });
});

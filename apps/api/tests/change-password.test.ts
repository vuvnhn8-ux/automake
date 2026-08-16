import { describe, expect, it } from 'vitest';
import { ChangePasswordSchema } from '../src/routes/auth.js';

describe('ChangePasswordSchema', () => {
  it('accepts a valid change request', () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: 'old-password',
      newPassword: 'new-password-123',
      newPasswordConfirm: 'new-password-123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a short new password', () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: 'old-password',
      newPassword: 'short',
      newPasswordConfirm: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('rejects mismatched confirmation', () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: 'old-password',
      newPassword: 'new-password-123',
      newPasswordConfirm: 'different-password',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty current password', () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: '',
      newPassword: 'new-password-123',
      newPasswordConfirm: 'new-password-123',
    });
    expect(result.success).toBe(false);
  });
});

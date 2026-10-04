import { isRlsEnabled } from './rls-extension';

describe('isRlsEnabled', () => {
  const original = process.env.DB_RLS;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.DB_RLS;
    } else {
      process.env.DB_RLS = original;
    }
  });

  it('is true only when DB_RLS is exactly "1"', () => {
    process.env.DB_RLS = '1';
    expect(isRlsEnabled()).toBe(true);
  });

  it('is false when DB_RLS is unset', () => {
    delete process.env.DB_RLS;
    expect(isRlsEnabled()).toBe(false);
  });

  it('is false for other truthy-looking values (opt-in must be explicit)', () => {
    for (const v of ['0', 'true', 'yes', '', 'on']) {
      process.env.DB_RLS = v;
      expect(isRlsEnabled()).toBe(false);
    }
  });
});

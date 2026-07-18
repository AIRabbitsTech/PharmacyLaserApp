import { test, expect } from '@playwright/test';
import { normalizeWhatsAppNumber, buildWhatsAppLink } from '../../src/utils/whatsapp';

test.describe('normalizeWhatsAppNumber()', () => {
  test('prepends the default country code (91) to a bare 10-digit number', () => {
    expect(normalizeWhatsAppNumber('9958107779')).toBe('919958107779');
  });

  test('strips a leading trunk 0 then adds the country code', () => {
    expect(normalizeWhatsAppNumber('09958107779')).toBe('919958107779');
  });

  test('keeps a number that already includes the country code', () => {
    expect(normalizeWhatsAppNumber('919958107779')).toBe('919958107779');
  });

  test('ignores spaces, dashes and a + prefix', () => {
    expect(normalizeWhatsAppNumber('+91 99581-07779')).toBe('919958107779');
  });

  test('returns null for empty / missing input', () => {
    expect(normalizeWhatsAppNumber('')).toBeNull();
    expect(normalizeWhatsAppNumber(null)).toBeNull();
    expect(normalizeWhatsAppNumber(undefined)).toBeNull();
  });

  test('returns null for an implausibly short number', () => {
    expect(normalizeWhatsAppNumber('12345')).toBeNull();
  });
});

test.describe('buildWhatsAppLink()', () => {
  test('builds a wa.me URL with URL-encoded message text', () => {
    const link = buildWhatsAppLink('9958107779', 'Invoice INV-0415 ₹204');
    expect(link).toBe('https://wa.me/919958107779?text=Invoice%20INV-0415%20%E2%82%B9204');
  });

  test('returns null when the number is invalid (button should be hidden)', () => {
    expect(buildWhatsAppLink('', 'hi')).toBeNull();
    expect(buildWhatsAppLink(null, 'hi')).toBeNull();
  });
});

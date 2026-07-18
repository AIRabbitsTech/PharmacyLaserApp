// Free WhatsApp "click-to-chat" links (wa.me) — no API, no cost, no ban risk.
// The pharmacist taps the link; WhatsApp opens with the message pre-filled to
// the customer and they press send. (Automated/PDF sending needs the paid
// WhatsApp Cloud API — tracked as a commercial feature in the roadmap.)

const DEFAULT_COUNTRY_CODE = '91'; // India

// Normalize a stored mobile number to the bare international form wa.me wants
// (digits only, no +). Handles 10-digit local numbers, a leading trunk 0, and
// numbers that already include the country code. Returns null if implausible.
export function normalizeWhatsAppNumber(
  raw?: string | null,
  countryCode = DEFAULT_COUNTRY_CODE,
): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1); // drop trunk 0
  if (d.length === 10) d = countryCode + d;                 // bare local → add CC
  if (d.length < 11 || d.length > 13) return null;          // implausible length
  return d;
}

// Build the wa.me URL, or null when the number is missing/invalid.
export function buildWhatsAppLink(rawMobile: string | null | undefined, message: string): string | null {
  const number = normalizeWhatsAppNumber(rawMobile);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

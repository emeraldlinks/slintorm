// mask.ts — zero-dependency output masking for @mask annotation
// Masks are applied on read paths only; DB always stores the real value.

const MASK_CHAR = "*";

function maskPresetCreditcard(val: string): string {
  const digits = val.replace(/\D/g, "");
  if (digits.length <= 4) return val;
  const last4 = digits.slice(-4);
  return `****-****-****-${last4}`;
}

function maskPresetSsn(val: string): string {
  const digits = val.replace(/\D/g, "");
  if (digits.length <= 4) return val;
  const last4 = digits.slice(-4);
  return `***-**-${last4}`;
}

function maskPresetEmail(val: string): string {
  const atIdx = val.indexOf("@");
  if (atIdx <= 0) return val;
  const name = val.slice(0, atIdx);
  const domain = val.slice(atIdx);
  const first = name[0];
  return `${first}${MASK_CHAR.repeat(Math.max(3, name.length - 1))}${domain}`;
}

function maskPresetPhone(val: string): string {
  const digits = val.replace(/\D/g, "");
  if (digits.length <= 4) return val;
  const last4 = digits.slice(-4);
  const masked = MASK_CHAR.repeat(Math.max(3, digits.length - 4));
  return `${masked}-${last4}`;
}

function maskShowFirst(val: string, n: number, char: string): string {
  if (val.length <= n) return val;
  return val.slice(0, n) + char.repeat(val.length - n);
}

function maskShowLast(val: string, n: number, char: string): string {
  if (val.length <= n) return val;
  return char.repeat(val.length - n) + val.slice(-n);
}

function maskShowBoth(val: string, first: number, last: number, char: string): string {
  if (val.length <= first + last) return val;
  return val.slice(0, first) + char.repeat(val.length - first - last) + val.slice(-last);
}

function applyPattern(val: string, pattern: string): string {
  return pattern.replace(/\{\{last:(\d+)\}\}/g, (_, n) => {
    const len = parseInt(n, 10);
    return val.slice(-len);
  }).replace(/\{\{first:(\d+)\}\}/g, (_, n) => {
    const len = parseInt(n, 10);
    return val.slice(0, len);
  });
}

export type MaskDirective =
  | "creditcard"
  | "ssn"
  | "email"
  | "phone"
  | { kind: "showFirst"; n: number; char?: string }
  | { kind: "showLast"; n: number; char?: string }
  | { kind: "showBoth"; first: number; last: number; char?: string }
  | { kind: "pattern"; pattern: string };

export function parseMaskAnnotation(val: string | boolean): MaskDirective {
  if (val === true || val === "") return "creditcard";
  const str = String(val);
  if (str === "creditcard") return "creditcard";
  if (str === "ssn") return "ssn";
  if (str === "email") return "email";
  if (str === "phone") return "phone";

  const showFirst = str.match(/^showFirst[:\s](\d+)/i);
  if (showFirst) return { kind: "showFirst", n: parseInt(showFirst[1], 10) };

  const showLast = str.match(/^showLast[:\s](\d+)/i);
  if (showLast) return { kind: "showLast", n: parseInt(showLast[1], 10) };

  const showBoth = str.match(/^showBoth[:\s](\d+)[,\s](\d+)/i);
  if (showBoth) return { kind: "showBoth", first: parseInt(showBoth[1], 10), last: parseInt(showBoth[2], 10) };

  const pattern = str.match(/^pattern[:\s](.+)/i);
  if (pattern) return { kind: "pattern", pattern: pattern[1] };

  const charMatch = str.match(/^char[:\s](.)/i);
  if (charMatch) return { kind: "showLast", n: 4, char: charMatch[1] };

  return "creditcard";
}

export function applyMask(raw: any, directive: MaskDirective): any {
  if (raw === null || raw === undefined) return raw;
  const val = String(raw);
  const char = "_maskChar" in arguments ? MASK_CHAR : MASK_CHAR;
  switch (directive) {
    case "creditcard":
      return maskPresetCreditcard(val);
    case "ssn":
      return maskPresetSsn(val);
    case "email":
      return maskPresetEmail(val);
    case "phone":
      return maskPresetPhone(val);
    default: {
      const d = directive as any;
      const ch = d.char || MASK_CHAR;
      if (d.kind === "showFirst") return maskShowFirst(val, d.n, ch);
      if (d.kind === "showLast") return maskShowLast(val, d.n, ch);
      if (d.kind === "showBoth") return maskShowBoth(val, d.first, d.last, ch);
      if (d.kind === "pattern") return applyPattern(val, d.pattern);
      return val;
    }
  }
}

export function isMasked(meta: Record<string, any> | undefined | null): boolean {
  if (!meta) return false;
  const m = meta.mask ?? meta["@mask"];
  return m !== undefined && m !== false;
}

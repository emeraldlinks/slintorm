export interface RandomConfig {
  charset: string;
  length: number;
  prefix?: string;
  suffix?: string;
}

export const CHARSETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  letters: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  hex: "0123456789abcdef",
  HEX: "0123456789ABCDEF",
  alnum: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  alnum_upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  alnum_lower: "abcdefghijklmnopqrstuvwxyz0123456789",
};

const DIGITS_NO_ZERO = "123456789";

export function getRandomMeta(meta: any): string | boolean | undefined {
  return meta?.random || meta?.["@random"];
}

function buildCharset(type: string, caseOpt?: string, customCharset?: string): string {
  if (type === "custom" && customCharset) return customCharset;

  const base =
    type === "alnum" ? "alnum"
    : type === "alpha" || type === "string" ? "letters"
    : type === "lower" ? "lower"
    : type === "upper" ? "upper"
    : type === "hex" ? "hex"
    : type === "number" ? "digits"
    : "";

  if (!base) return CHARSETS.hex;

  if (type === "alnum") {
    if (caseOpt === "upper") return CHARSETS.alnum_upper;
    if (caseOpt === "lower") return CHARSETS.alnum_lower;
    return CHARSETS.alnum;
  }

  if (type === "hex") {
    if (caseOpt === "upper") return CHARSETS.HEX;
    return CHARSETS.hex;
  }

  if (type === "alpha" || type === "string") {
    if (caseOpt === "upper") return CHARSETS.upper;
    if (caseOpt === "lower") return CHARSETS.lower;
    return CHARSETS.letters;
  }

  return (CHARSETS as Record<string, string>)[base] || CHARSETS.hex;
}

function parseParenSyntax(type: string, inner: string): RandomConfig | null {
  const args = inner.split(",").map(a => a.trim()).filter(Boolean);

  let length = 0;
  let caseOpt = "";
  let prefix = "";
  let suffix = "";
  let customCharset = "";

  for (const arg of args) {
    if (/^\d+$/.test(arg)) {
      length = parseInt(arg, 10);
    } else if (arg === "upper" || arg === "lower" || arg === "mixed") {
      caseOpt = arg === "mixed" ? "" : arg;
    } else if (arg.startsWith("pfx=")) {
      prefix = arg.slice(4);
    } else if (arg.startsWith("sfx=")) {
      suffix = arg.slice(4);
    } else if (type === "custom") {
      customCharset = arg;
    }
  }

  if (length <= 0) length = type === "number" ? 8 : 32;

  const charset = buildCharset(type, caseOpt, customCharset);
  return { charset, length, prefix, suffix };
}

function parseColonSyntax(raw: string): RandomConfig | null {
  const parts = raw.split(/[:()]+/).filter(Boolean);
  const type = parts[0];

  const known = ["string", "number", "alnum", "alpha", "lower", "upper", "hex", "custom"];
  if (!known.includes(type)) return null;

  const len = Math.max(1, parseInt(parts[1] || "32", 10));
  const caseOpt = parts[2] || "";

  if (type === "number") {
    return { charset: CHARSETS.digits, length: len };
  }

  const charset = buildCharset(type, caseOpt);
  return { charset, length: len };
}

export function parseRandomAnnotation(annotation: string | boolean): RandomConfig | null {
  if (!annotation) return null;

  if (annotation === true) {
    return { charset: CHARSETS.hex, length: 32 };
  }

  const raw = typeof annotation === "string" ? annotation : "";
  if (!raw) return { charset: CHARSETS.hex, length: 32 };

  const parenMatch = raw.match(/^(\w+)\(([^)]*)\)$/);
  if (parenMatch) {
    return parseParenSyntax(parenMatch[1], parenMatch[2]);
  }

  return parseColonSyntax(raw);
}

export function generateRandomValue(config: RandomConfig): string | number {
  const body = pickN(config.length, config.charset, config.charset === CHARSETS.digits);
  const out = (config.prefix || "") + body + (config.suffix || "");

  if (config.charset === CHARSETS.digits && !config.prefix && !config.suffix) {
    return parseInt(out, 10);
  }

  return out;
}

function pickN(n: number, charset: string, noLeadingZero: boolean): string {
  let result = "";
  for (let i = 0; i < n; i++) {
    const cs = i === 0 && noLeadingZero ? DIGITS_NO_ZERO : charset;
    result += cs[Math.floor(Math.random() * cs.length)];
  }
  return result;
}

export function generateRandomFromAnnotation(annotation: string | boolean): string | number {
  const config = parseRandomAnnotation(annotation);
  if (!config) {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  return generateRandomValue(config);
}

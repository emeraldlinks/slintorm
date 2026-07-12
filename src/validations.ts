import { ValidationError } from "./extensions.js";

type Validator = (value: unknown, param: string | undefined) => string | null;

const validators: Record<string, Validator> = {
  email(value) {
    if (typeof value !== "string") return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "must be a valid email address";
    return null;
  },

  url(value) {
    if (typeof value !== "string") return null;
    if (!/^https?:\/\/.+/.test(value)) return "must be a valid URL (http/https)";
    return null;
  },

  uuid(value) {
    if (typeof value !== "string") return null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return "must be a valid UUID v4";
    return null;
  },

  phone(value) {
    if (typeof value !== "string") return null;
    const digits = value.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return "must be a valid phone number (7-15 digits)";
    return null;
  },

  min(value, param) {
    if (value == null) return null;
    const min = Number(param);
    if (isNaN(min)) return null;
    const num = Number(value);
    if (isNaN(num)) return `must be at least ${min}`;
    if (num < min) return `must be at least ${min}`;
    return null;
  },

  max(value, param) {
    if (value == null) return null;
    const max = Number(param);
    if (isNaN(max)) return null;
    const num = Number(value);
    if (isNaN(num)) return `must be at most ${max}`;
    if (num > max) return `must be at most ${max}`;
    return null;
  },

  minLength(value, param) {
    if (value == null) return null;
    const min = Number(param);
    if (isNaN(min)) return null;
    if (typeof value !== "string") return "minLength requires a string value";
    if (value.length < min) return `must be at least ${min} characters`;
    return null;
  },

  maxLength(value, param) {
    if (value == null) return null;
    const max = Number(param);
    if (isNaN(max)) return null;
    if (typeof value !== "string") return "maxLength requires a string value";
    if (value.length > max) return `must be at most ${max} characters`;
    return null;
  },

  pattern(value, param) {
    if (value == null) return null;
    if (typeof value !== "string") return null;
    if (!param) return null;
    try {
      const re = new RegExp(param);
      if (!re.test(value)) return `must match pattern ${param}`;
    } catch {
      return null;
    }
    return null;
  },
};

const annotationToValidatorKey: Record<string, string> = {
  "@email": "email",
  "@url": "url",
  "@uuid": "uuid",
  "@phone": "phone",
  "@min": "min",
  "@max": "max",
  "@minLength": "minLength",
  "@maxLength": "maxLength",
  "@pattern": "pattern",
};

export function getValidationMeta(meta: any): Record<string, string> | null {
  if (!meta) return null;
  const result: Record<string, string> = {};
  for (const [anno, key] of Object.entries(annotationToValidatorKey)) {
    const val = meta[anno] ?? meta[anno.slice(1)];
    if (val !== undefined) {
      result[key] = String(val);
    }
  }
  return Object.keys(result).length ? result : null;
}

export function validateFieldValue(
  value: unknown,
  fieldName: string,
  meta: any,
): string | null {
  if (value != null && typeof value === "object") return null;
  const validationMeta = getValidationMeta(meta);
  if (!validationMeta) return null;
  for (const [key, param] of Object.entries(validationMeta)) {
    const fn = validators[key];
    if (fn) {
      const err = fn(value, param);
      if (err) return err;
    }
  }
  return null;
}

export function validateItem<T extends Record<string, any>>(
  item: T,
  schemaFields: Record<string, any>,
): void {
  const errors: Record<string, string> = {};
  for (const [fieldName, fieldDef] of Object.entries(schemaFields || {})) {
    const meta = (fieldDef as any)?.meta;
    if (!meta) continue;
    const err = validateFieldValue(item[fieldName], fieldName, meta);
    if (err) errors[fieldName] = err;
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

import { AdvancedQueryBuilder } from "./extra_clauses.js";
import type { ExecFn } from "./types.ts";

// ============================================================
// SOFT DELETE
// ============================================================

export class SoftDeleteQueryBuilder<T extends Record<string, any>> extends AdvancedQueryBuilder<T> {
  protected _withTrashed = false;
  protected _onlyTrashed = false;

  private get hasSoftDelete(): boolean {
    return "deletedAt" in (this.schema?.[this.modelName]?.fields ?? {});
  }

  /**
   * Include soft-deleted rows in results.
   * @example Users.query().withTrashed().get()
   */
  withTrashed() {
    this._withTrashed = true;
    this._onlyTrashed = false;
    return this;
  }

  /**
   * Return only soft-deleted rows.
   * @example Users.query().onlyTrashed().get()
   */
  onlyTrashed() {
    this._onlyTrashed = true;
    this._withTrashed = false;
    return this;
  }

  public buildSql() {
    if (this.hasSoftDelete) {
      if (this._onlyTrashed) {
        this._where.push({ column: "deletedAt", kind: "notnull" });
      } else if (!this._withTrashed) {
        this._where.push({ column: "deletedAt", kind: "null" });
      }
    }
    const result = super.buildSql();
    this._where = this._where.filter(
      (w) => !(w.column === "deletedAt" && (w.kind === "null" || w.kind === "notnull"))
    );
    return result;
  }
}

// ============================================================
// SCOPES
// ============================================================

type ScopeDefinition<T extends Record<string, any>> = (
  builder: ExtendedQueryBuilder<T>
) => ExtendedQueryBuilder<T>;

// ============================================================
// EXTENDED QUERY BUILDER — top of chain, used by model.query()
// ============================================================

export class ExtendedQueryBuilder<T extends Record<string, any>> extends SoftDeleteQueryBuilder<T> {
  private _scopes: ScopeDefinition<T>[] = [];
  private _appliedScopes = false;

  /**
   * Apply a reusable query fragment.
   * @example Users.query().scope(qb => qb.where("status","=","active")).get()
   */
  scope(fn: ScopeDefinition<T>) {
    this._scopes.push(fn);
    return this;
  }

  private applyScopes() {
    if (this._appliedScopes) return;
    this._appliedScopes = true;
    for (const s of this._scopes) s(this);
  }

  public buildSql() {
    this.applyScopes();
    return super.buildSql();
  }

  async get() {
    this.applyScopes();
    return super.get();
  }

  async first(condition?: any) {
    this.applyScopes();
    return super.first(condition);
  }
}

// ============================================================
// VALIDATION
// ============================================================

type ValidatorFn<T> = (value: any, row: Partial<T>) => string | null | undefined;

export type FieldRules<T> = {
  [K in keyof T]?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    email?: boolean;
    match?: RegExp;
    custom?: ValidatorFn<T>;
  };
};

export class ValidationError extends Error {
  constructor(public errors: Record<string, string>) {
    super("Validation failed: " + Object.values(errors).join("; "));
    this.name = "ValidationError";
  }
}

export class Validator<T extends Record<string, any>> {
  constructor(private rules: FieldRules<T>) {}

  validate(data: Partial<T>): void {
    const errors: Record<string, string> = {};
    for (const [field, rules] of Object.entries(this.rules) as [string, FieldRules<T>[keyof T]][]) {
      if (!rules) continue;
      const value = (data as any)[field];
      if (rules.required && (value === undefined || value === null || value === "")) {
        errors[field] = `${field} is required`;
        continue;
      }
      if (value === undefined || value === null) continue;
      if (rules.minLength !== undefined && typeof value === "string" && value.length < rules.minLength)
        errors[field] = `${field} must be at least ${rules.minLength} characters`;
      if (rules.maxLength !== undefined && typeof value === "string" && value.length > rules.maxLength)
        errors[field] = `${field} must be at most ${rules.maxLength} characters`;
      if (rules.min !== undefined && typeof value === "number" && value < rules.min)
        errors[field] = `${field} must be at least ${rules.min}`;
      if (rules.max !== undefined && typeof value === "number" && value > rules.max)
        errors[field] = `${field} must be at most ${rules.max}`;
      if (rules.email && typeof value === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        errors[field] = `${field} must be a valid email`;
      if (rules.match && typeof value === "string" && !rules.match.test(value))
        errors[field] = `${field} format is invalid`;
      if (rules.custom) {
        const msg = rules.custom(value, data);
        if (msg) errors[field] = msg;
      }
    }
    if (Object.keys(errors).length) throw new ValidationError(errors);
  }

  check(data: Partial<T>): Record<string, string> | null {
    try {
      this.validate(data);
      return null;
    } catch (err) {
      if (err instanceof ValidationError) return err.errors;
      throw err;
    }
  }
}
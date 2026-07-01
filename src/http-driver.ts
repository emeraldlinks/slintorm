import type { ExecFn, SQLExecResult } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HttpDriverConfig {
  endpoint: string;
  headers?: Record<string, string>;
}

type ResultParser = (json: any, sql: string) => SQLExecResult;

// ─── Generic HTTP SQL exec ────────────────────────────────────────────────────

function createExec(config: HttpDriverConfig & { parser: ResultParser }): ExecFn {
  return async (sql, params = []) => {
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...config.headers },
      body: JSON.stringify({ query: sql, params }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${config.endpoint} returned HTTP ${res.status}: ${text}`);
    }
    const json = await res.json();
    return config.parser(json, sql);
  };
}

// ─── Neon (Postgres over HTTP) ────────────────────────────────────────────────
// Docs: https://neon.tech/docs/reference/http-api

function neonParse(json: any, _sql: string): SQLExecResult {
  if (json.error) throw new Error(json.error);
  const result = json.data?.[0];
  if (!result) return { rows: [] };
  const fields: string[] = (result.fields || []).map((f: any) => f.name);
  const rows = (result.rows || []).map((row: any[]) => {
    const obj: any = {};
    fields.forEach((name, i) => { obj[name] = row[i]; });
    return obj;
  });
  const isSelect = /^\s*(SELECT|WITH|PRAGMA)/i.test(_sql.trim());
  if (isSelect) return { rows };
  return { rows: [], changes: result.rowsAffected ?? 0, lastID: result.lastInsertId };
}

export function neonExec(config: HttpDriverConfig): ExecFn {
  // If endpoint doesn't end with /sql, append it
  const endpoint = config.endpoint.endsWith("/sql") ? config.endpoint : `${config.endpoint}/sql`;
  return createExec({ ...config, endpoint, parser: neonParse });
}

// ─── Turso / libsql (SQLite over HTTP) ────────────────────────────────────────
// Docs: https://docs.turso.tech/reference/http-json-api

export function tursoExec(config: HttpDriverConfig): ExecFn {
  const endpoint = config.endpoint;

  async function tursoExecFn(sql: string, params: any[] = []): Promise<SQLExecResult> {
    const body = {
      requests: [
        {
          type: "execute",
          stmt: { sql, args: params.map(p => ({ type: typeof p === "number" ? "integer" : "text", value: String(p) })) },
        },
      ],
    };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...config.headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${endpoint} returned HTTP ${res.status}: ${text}`);
    }
    const json = await res.json();
    const result = json.results?.[0]?.response?.result;
    if (json.error) throw new Error(json.error);
    if (result?.error) throw new Error(result.error.message || String(result.error));
    if (!result) return { rows: [] };

    const isSelect = /^\s*(SELECT|WITH|PRAGMA)/i.test(sql.trim());
    if (isSelect && result.cols) {
      const colNames: string[] = result.cols.map((c: any) => c.name);
      const rows = (result.rows || []).map((row: any) => {
        if (row.type === "json" && Array.isArray(row.value)) {
          const obj: any = {};
          colNames.forEach((name, i) => { obj[name] = row.value[i]; });
          return obj;
        }
        return row;
      });
      return { rows };
    }
    return { rows: [], changes: result.affected_row_count ?? 0, lastID: result.last_insert_rowid ?? undefined };
  }

  return tursoExecFn;
}

// ─── PlanetScale (MySQL over HTTP) ────────────────────────────────────────────
// Docs: https://planetscale.com/docs/api/overview

export function planetscaleExec(config: HttpDriverConfig & { organization: string; database: string; branch?: string }): ExecFn {
  const branch = config.branch || "main";
  const endpoint = `https://api.planetscale.com/v1/organizations/${config.organization}/databases/${config.database}/branches/${branch}/execute`;

  async function psExecFn(sql: string, params: any[] = []): Promise<SQLExecResult> {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...config.headers },
      body: JSON.stringify({ statement: sql, params }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PlanetScale returned HTTP ${res.status}: ${text}`);
    }
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    const rows = json.rows || [];
    const isSelect = /^\s*(SELECT|WITH|PRAGMA)/i.test(sql.trim());
    if (isSelect) return { rows };
    return { rows: [], changes: json.rows_affected ?? 0, lastID: json.insert_id ?? undefined };
  }

  return psExecFn;
}

// ─── Re-usable helpers ────────────────────────────────────────────────────────

export const http = { neon: neonExec, turso: tursoExec, planetscale: planetscaleExec };

import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS = ['0001_schema.sql', '0002_auth_rls.sql', '0003_functions.sql', '0005_portfolio_passport.sql']

// Minimal stand-in for the parts of Supabase the migrations depend on.
const SUPABASE_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb,
    instance_id uuid, aud text, role text, encrypted_password text, email_confirmed_at timestamptz,
    raw_app_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
    confirmation_token text, email_change text, email_change_token_new text, recovery_token text
  );
  create table auth.identities (
    id uuid primary key, user_id uuid references auth.users(id) on delete cascade, provider_id text,
    provider text, identity_data jsonb, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`

export type Db = PGlite

export async function createDb(): Promise<Db> {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } })
  await db.exec(SUPABASE_SHIM)
  for (const file of MIGRATIONS) {
    const sql = readFileSync(join(__dirname, '../../supabase/migrations', file), 'utf8')
    await db.exec(sql)
  }
  return db
}

export function seedSql(): string {
  return readFileSync(join(__dirname, '../../supabase/seed.sql'), 'utf8')
}

/** Run `fn` as a signed-in user (RLS + grants apply, like the Supabase API). */
export async function asUser<T>(db: Db, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}

export async function asAnon<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role;`)
  }
}

export async function signUp(
  db: Db,
  email: string,
  meta: Record<string, unknown>,
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`,
    [email, JSON.stringify(meta)],
  )
  return r.rows[0].id
}

/** Returns the error message of a failing query, or null if it succeeded. */
export async function errorOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (e) {
    return (e as Error).message
  }
}

export function isoDate(offsetDays: number): string {
  // Matches app_today() (Asia/Kolkata)
  const d = new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86400_000)
  return d.toISOString().slice(0, 10)
}

export function dowOf(isoDay: string): number {
  return new Date(isoDay + 'T00:00:00Z').getUTCDay()
}

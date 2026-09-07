#!/usr/bin/env node
/**
 * Applies a .sql file to whichever database the app itself talks to.
 *
 * Reads next/.env.local for DB_HOST/PORT/NAME/USER/PASSWORD — the same five the running app uses
 * — so a migration can never land in a different Supabase project than the one serving requests.
 * That is not hypothetical: this repo has more than one GeoFold project, and applying schema to
 * the wrong one leaves the app throwing "relation does not exist" against a table that visibly
 * exists in a dashboard.
 *
 *   node scripts/apply-sql.js docs/migration-004-contact.sql
 *
 * The whole file is sent as one statement batch, so wrap anything that must be atomic in
 * BEGIN/COMMIT yourself.
 */
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..', '..')
const envPath = path.resolve(__dirname, '..', '.env.local')

if (!fs.existsSync(envPath)) {
  console.error(`No ${envPath}. Copy the server env there first.`)
  process.exit(1)
}

// Minimal .env parser: KEY=value, ignoring blanks and # comments. Values are used verbatim, so a
// password containing '=' or '#' survives (which is why this does not reuse a generic splitter).
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
}

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/apply-sql.js <path-to.sql>')
  process.exit(1)
}
const sqlPath = path.isAbsolute(file) ? file : path.resolve(repoRoot, file)
const script = fs.readFileSync(sqlPath, 'utf8')

const postgres = require('postgres')

const sql = postgres({
  host: env.DB_HOST,
  port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: 'require',
  prepare: false,
  max: 1,
})

;(async () => {
  // The project ref is embedded in the pooler username (postgres.<ref>) — print it so the target
  // is visible in the output rather than assumed.
  const ref = (env.DB_USER ?? '').split('.')[1] ?? '(unknown)'
  console.log(`Target: ${env.DB_HOST} db=${env.DB_NAME} project=${ref}`)
  console.log(`Applying: ${path.relative(repoRoot, sqlPath)}`)

  try {
    await sql.unsafe(script)
    console.log('OK — applied.')
  } catch (err) {
    console.error('FAILED:', err.message)
    process.exitCode = 1
  } finally {
    await sql.end({ timeout: 5 })
  }
})()

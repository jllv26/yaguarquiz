#!/bin/bash
# Corre todas las pruebas automáticas de YaguarQuiz.
# Requiere: PostgreSQL 16 local en /tmp:5544 (usuario postgres), Node 22, Python 3 con playwright y psycopg.
# Cada prueba de servidor usa una base nueva con todas las migraciones (no dependen entre sí).
set -u
cd "$(dirname "$0")/.."
P="psql -h /tmp -p 5544 -U postgres -q"
reset_db() {
  $P -c "drop database if exists t with (force)" && $P -c "create database t encoding 'UTF8' lc_collate 'C.utf8' lc_ctype 'C.utf8' template template0"
  $P -d t -f tests/sql/00_supabase_stub.sql >/dev/null 2>&1
  for f in supabase/migrations/*.sql; do $P -d t -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "FALLA migración $f"; exit 1; }; done
  $P -d t -f tests/sql/10_rls_test.sql >/dev/null 2>&1; $P -d t -c "update public.teachers set approved = true" >/dev/null
}
ok=0; fail=0
run() { echo "▶ $1"; if "${@:2}"; then ok=$((ok+1)); else fail=$((fail+1)); echo "  ✖ $1"; fi; }
run "Unitarias (Vitest)" npx vitest run
for t in live-load-test exam-load-test reports-test activities-test; do reset_db; run "Servidor: $t" node tests/load/$t.mjs; done
reset_db
echo "RLS activo en todas las tablas:"; $P -d t -Atc "select coalesce(string_agg(tablename, ', '), 'todas ✓') from pg_tables where schemaname='public' and not rowsecurity"
echo "Listo: $ok bloques OK, $fail con fallas"
[ $fail -eq 0 ]

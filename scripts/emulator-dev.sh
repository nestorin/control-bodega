#!/usr/bin/env bash
# scripts/emulator-dev.sh
# Levanta TODOS los emuladores, seed data, y corre tests en un solo comando.
# Uso: ./scripts/emulator-dev.sh [test|seed|up|down|clean]

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[emulator-dev]${NC} $*"; }
ok() { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERR]${NC} $*"; }

# ──────────────────────────────────────────────────────────────────────────────
# Verificar dependencias
# ──────────────────────────────────────────────────────────────────────────────

check_deps() {
  log "Verificando dependencias..."
  command -v firebase >/dev/null 2>&1 || { err "firebase CLI no instalado"; exit 1; }
  command -v pnpm >/dev/null 2>&1 || { err "pnpm no instalado"; exit 1; }
  command -v python3 >/dev/null 2>&1 || { err "python3 no instalado"; exit 1; }

  # Java para Firebase Emulators (openjdk@21 via Homebrew)
  export PATH="/opt/homebrew/Cellar/openjdk@21/21.0.12/bin:$PATH"
  command -v java >/dev/null 2>&1 || { err "Java no encontrado en PATH"; exit 1; }

  # Verificar login Firebase
  if ! firebase projects:list >/dev/null 2>&1; then
    warn "No hay login de Firebase. Ejecuta: firebase login"
  fi
  ok "Dependencias OK"
}

# ──────────────────────────────────────────────────────────────────────────────
# Levantar emuladores
# ──────────────────────────────────────────────────────────────────────────────

EMULATOR_PIDS=()

start_emulators() {
  log "Iniciando Firebase Emulators (firestore, functions, auth, storage, hosting)..."

  # Matar procesos previos en puertos de emuladores
  for port in 4000 5000 5001 8080 9099 9199; do
    lsof -ti:$port | xargs kill -9 2>/dev/null || true
  done

  # Iniciar emuladores en background
  firebase emulators:start --only firestore,functions,auth,storage,hosting --project demo-exepa-dev &
  EMULATOR_PID=$!
  EMULATOR_PIDS+=($EMULATOR_PID)

  # Esperar a que estén listos (health checks)
  log "Esperando emuladores..."
  local max_wait=60
  local waited=0
  while [ $waited -lt $max_wait ]; do
    if curl -s http://localhost:4000 >/dev/null 2>&1 && \
       curl -s http://localhost:5001 >/dev/null 2>&1 && \
       curl -s http://localhost:5002 >/dev/null 2>&1 && \
       curl -s http://localhost:8080 >/dev/null 2>&1 && \
       curl -s http://localhost:9099 >/dev/null 2>&1 && \
       curl -s http://localhost:9199 >/dev/null 2>&1; then
      ok "Todos los emuladores listos"
      echo ""
      echo "╔════════════════════════════════════════════════════════════════╗"
      echo "║  EMULADORES ACTIVOS                                          ║"
      echo "╠════════════════════════════════════════════════════════════════╣"
      echo "║  🌐 Emulator UI:     http://localhost:4000                   ║"
      echo "║  🔥 Firestore:       http://localhost:8080                   ║"
      echo "║  ⚡ Functions:       http://localhost:5001                   ║"
      echo "║  🔐 Auth:            http://localhost:9099                   ║"
      echo "║  📦 Storage:         http://localhost:9199                   ║"
      echo "║  🌍 Hosting (preview): http://localhost:5002                 ║"
      echo "╚════════════════════════════════════════════════════════════════╝"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  err "Timeout esperando emuladores"
  stop_emulators
  exit 1
}

stop_emulators() {
  log "Deteniendo emuladores..."
  for pid in "${EMULATOR_PIDS[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  # Forzar limpieza puertos
  for port in 4000 5000 5001 8080 9099 9199; do
    lsof -ti:$port | xargs kill -9 2>/dev/null || true
  done
  ok "Emuladores detenidos"
}

# ──────────────────────────────────────────────────────────────────────────────
# Seed data para desarrollo/testing
# ──────────────────────────────────────────────────────────────────────────────

seed_emulator() {
  log "Sembrando datos de prueba en emulador..."

  export FIRESTORE_EMULATOR_HOST="localhost:8080"
  export FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
  export STORAGE_EMULATOR_HOST="localhost:9199"

  # Seed warehouses, suppliers, conversions, expiries
  log "→ Seed warehouses..."
  pnpm seed:warehouses

  log "→ Seed suppliers..."
  pnpm seed:suppliers

  log "→ Seed conversions..."
  pnpm seed:conversions

  log "→ Seed expiries (lotes/caducidades)..."
  pnpm seed:expiries

  ok "Seed completado"
}

# ──────────────────────────────────────────────────────────────────────────────
# Correr tests
# ──────────────────────────────────────────────────────────────────────────────

run_tests() {
  log "Corriendo suite de tests contra emuladores..."

  export FIRESTORE_EMULATOR_HOST="localhost:8080"
  export FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
  export STORAGE_EMULATOR_HOST="localhost:9199"

  # 1. Unit tests (vitest)
  log "→ Unit tests (vitest)..."
  pnpm test:run

  # 2. Firestore rules tests (emulador)
  log "→ Firestore rules tests..."
  FIRESTORE_EMULATOR_HOST="localhost:8080" pnpm test:rules

  # 3. Python Functions tests
  log "→ Python Functions tests..."
  cd functions
  source venv/bin/activate 2>/dev/null || python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
  python -m pytest test_receptions.py -v
  python -m pytest test_security.py -v
  cd ..

  ok "Todos los tests pasaron"
}

# ──────────────────────────────────────────────────────────────────────────────
# Build + Preview (simula hosting en emulador)
# ──────────────────────────────────────────────────────────────────────────────

build_and_preview() {
  log "Building app y sirviendo en hosting emulator..."
  pnpm build
  ok "Build completado - disponible en http://localhost:5000"
}

# ──────────────────────────────────────────────────────────────────────────────
# Cleanup completo
# ──────────────────────────────────────────────────────────────────────────────

clean_all() {
  log "Limpiando todo..."
  stop_emulators
  rm -rf dist coverage .vitest node_modules/.cache functions/__pycache__ functions/venv
  ok "Limpieza completa"
}

# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

main() {
  local cmd="${1:-up}"

  case "$cmd" in
    up)
      check_deps
      start_emulators
      seed_emulator
      build_and_preview
      # Mantener corriendo
      log "Emuladores corriendo. Ctrl+C para detener."
      wait "${EMULATOR_PIDS[0]}"
      ;;
    test)
      check_deps
      start_emulators
      seed_emulator
      run_tests
      stop_emulators
      ;;
    seed)
      check_deps
      start_emulators
      seed_emulator
      stop_emulators
      ;;
    down)
      stop_emulators
      ;;
    clean)
      clean_all
      ;;
    *)
      echo "Uso: $0 {up|test|seed|down|clean}"
      echo ""
      echo "  up      - Levanta emuladores, seed, build, y mantiene corriendo (default)"
      echo "  test    - Levanta, seed, corre TODOS los tests, y baja"
      echo "  seed    - Solo seed data en emulador corriendo"
      echo "  down    - Detiene emuladores"
      echo "  clean   - Limpia build, cache, venv, y detiene emuladores"
      exit 1
      ;;
  esac
}

# Trap para cleanup al salir
trap 'stop_emulators' EXIT INT TERM

main "$@"
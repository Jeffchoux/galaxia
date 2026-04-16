#!/bin/bash
# GALAXIA Installer — Your AI Company in a Box
# Usage: curl -fsSL https://galaxia.sh/install | bash

set -e

# ── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ── Helpers ─────────────────────────────────────────────────────────────────

info()  { echo -e "  ${CYAN}[info]${RESET}  $1"; }
ok()    { echo -e "  ${GREEN}[ok]${RESET}    $1"; }
warn()  { echo -e "  ${YELLOW}[warn]${RESET}  $1"; }
fail()  { echo -e "  ${RED}[fail]${RESET}  $1"; exit 1; }

# ── Banner ──────────────────────────────────────────────────────────────────

echo ""
echo -e "  ${BOLD}${CYAN}GALAXIA Installer${RESET}"
echo -e "  ${DIM}Your AI Company in a Box${RESET}"
echo -e "  ${DIM}$(printf '%0.s─' {1..40})${RESET}"
echo ""

# ── Detect OS ───────────────────────────────────────────────────────────────

OS="unknown"
ARCH="$(uname -m)"

case "$(uname -s)" in
  Linux*)  OS="linux" ;;
  Darwin*) OS="macos" ;;
  *)       fail "Unsupported operating system: $(uname -s)" ;;
esac

info "Detected: ${BOLD}${OS}${RESET} (${ARCH})"

# ── Prerequisites ───────────────────────────────────────────────────────────

echo ""
info "Checking prerequisites..."

# Node.js >= 20
if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -ge 20 ] 2>/dev/null; then
    ok "Node.js $(node -v)"
  else
    fail "Node.js >= 20 required (found $(node -v)). Install from https://nodejs.org"
  fi
else
  fail "Node.js not found. Install Node.js >= 20 from https://nodejs.org"
fi

# Git
if command -v git &>/dev/null; then
  ok "git $(git --version | awk '{print $3}')"
else
  fail "git not found. Install git first."
fi

# pnpm (install if missing)
if command -v pnpm &>/dev/null; then
  ok "pnpm $(pnpm --version)"
else
  info "Installing pnpm..."
  if command -v corepack &>/dev/null; then
    corepack enable
    corepack prepare pnpm@latest --activate
    ok "pnpm installed via corepack"
  else
    npm install -g pnpm
    ok "pnpm installed via npm"
  fi
fi

# Docker (optional)
if command -v docker &>/dev/null; then
  ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
else
  warn "Docker not found (optional — needed for docker-compose deployment)"
fi

# ── Clone ───────────────────────────────────────────────────────────────────

echo ""
INSTALL_DIR="${GALAXIA_INSTALL_DIR:-$HOME/.galaxia/repo}"

if [ -d "$INSTALL_DIR" ]; then
  info "Updating existing installation at ${INSTALL_DIR}..."
  cd "$INSTALL_DIR"
  git pull --ff-only 2>/dev/null || warn "Could not pull latest — using existing version"
else
  info "Cloning GALAXIA to ${INSTALL_DIR}..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone https://github.com/Jeffchoux/galaxia.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

ok "Repository ready"

# ── Install & Build ─────────────────────────────────────────────────────────

echo ""
info "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "Dependencies installed"

info "Building packages..."
pnpm build
ok "Build complete"

# ── Link CLI ────────────────────────────────────────────────────────────────

echo ""
info "Linking CLI globally..."

# Create global bin link
CLI_BIN="$INSTALL_DIR/packages/cli/dist/cli.js"

if [ -f "$CLI_BIN" ]; then
  chmod +x "$CLI_BIN"

  # Determine link target
  if [ -w "/usr/local/bin" ]; then
    ln -sf "$CLI_BIN" /usr/local/bin/galaxia
    ok "CLI linked to /usr/local/bin/galaxia"
  elif [ -d "$HOME/.local/bin" ]; then
    mkdir -p "$HOME/.local/bin"
    ln -sf "$CLI_BIN" "$HOME/.local/bin/galaxia"
    ok "CLI linked to ~/.local/bin/galaxia"
    if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
      warn "Add ~/.local/bin to your PATH:"
      echo -e "    ${DIM}export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}"
    fi
  else
    mkdir -p "$HOME/.local/bin"
    ln -sf "$CLI_BIN" "$HOME/.local/bin/galaxia"
    ok "CLI linked to ~/.local/bin/galaxia"
    warn "Add ~/.local/bin to your PATH:"
    echo -e "    ${DIM}export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}"
  fi
else
  warn "CLI binary not found at $CLI_BIN — build may have failed"
fi

# ── Create data dirs ───────────────────────────────────────────────────────

mkdir -p "$HOME/.galaxia/data/knowledge"
mkdir -p "$HOME/.galaxia/data/logs"
mkdir -p "$HOME/.galaxia/data/backups"
ok "Data directories created"

# ── Done ────────────────────────────────────────────────────────────────────

echo ""
echo -e "  ${BOLD}${CYAN}$(printf '%0.s─' {1..44})${RESET}"
echo -e "  ${BOLD}${CYAN}  GALAXIA installed successfully!${RESET}"
echo -e "  ${BOLD}${CYAN}$(printf '%0.s─' {1..44})${RESET}"
echo ""
echo -e "  ${BOLD}Get started:${RESET}"
echo -e "    ${DIM}1.${RESET} galaxia init        ${DIM}# interactive setup${RESET}"
echo -e "    ${DIM}2.${RESET} galaxia status       ${DIM}# check system${RESET}"
echo -e "    ${DIM}3.${RESET} galaxia help         ${DIM}# see all commands${RESET}"
echo ""
echo -e "  ${DIM}Documentation: https://github.com/Jeffchoux/galaxia${RESET}"
echo ""

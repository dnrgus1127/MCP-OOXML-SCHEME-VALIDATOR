# CLAUDE.md

## Project Overview

OOXML document editor — a monorepo toolkit for opening OOXML (XLSX, DOCX, PPTX) packages, editing their internal XML, and validating it against XSD schemas using a streaming event-based engine surfaced through an LSP server. The product is the Electron desktop editor; the core validation engine and the LSP server power its diagnostics.

## Monorepo Structure

### Primary Development Focus

- `packages/core` — Validation engine, schema registry, compositor state management (zero runtime deps) **[ACTIVE]**
- `packages/desktop` — Electron + React desktop application with Monaco editor **[ACTIVE]**

### Supporting Packages

- `packages/parser` — OOXML document parsing, ZIP handling, XML streaming/conversion
- `packages/ooxml-lsp` — Git submodule providing the LSP server (`@ooxml-tools/lsp-server`) and its engines/validator; the desktop app runs it as a child process for diagnostics
- `tools/xsd-converter` — Build tool that converts XSD files to JSON schemas
- `tools/validate-xml` — Developer CLI for validating XML against the schemas without the editor
- `schemas/` — OOXML XSD source files (sml, wml, pml, dml, shared)
- `agent/` — AI agent playbooks and mandatory task guides

## Mandatory Read For Desktop UI/UX Work

- Required doc: `agent/desktop-ui-ux-agent-guide.md`
- Any AI agent working on `packages/desktop` UI/UX must read this document before making design, layout, interaction, accessibility, or styling changes.
- Treat it as the default implementation and review checklist for desktop UX tasks.

## Common Commands

```bash
pnpm run build        # Build all packages (turbo, includes schema generation)
pnpm run test         # Run all tests (vitest)
pnpm run typecheck    # Type-check all packages (tsc --noEmit)
pnpm run lint         # Lint all packages
pnpm run format       # Format with Prettier
pnpm run dev          # Watch mode for all packages
pnpm run clean        # Remove dist/ and node_modules/
```

Per-package commands work from within each package directory (`build`, `dev`, `test`, `test:watch`, `typecheck`, `clean`).

Schema generation runs automatically as a prebuild step in `packages/core`:

```bash
pnpm run generate:schemas   # Convert XSD → JSON schemas
```

## Tech Stack

- **TypeScript 5.3** (strict mode, ES2022 target)
- **pnpm 9** workspaces + **Turbo 2** for build orchestration
- **tsup** for bundling all packages
- **Vitest** for testing (`--passWithNoTests`)
- **Prettier** for formatting
- **React 18** + **Electron 28** for desktop app
- **Vite 5** / **electron-vite** for desktop bundling

## Code Style

- Single quotes, no semicolons, 2-space indentation, 100-char line width, ES5 trailing commas
- Configured in `.prettierrc`; enforced by `pnpm run format`

## TypeScript Conventions

- Strict mode with `noUncheckedIndexedAccess` enabled
- Base config in `tsconfig.base.json`; each package extends it
- Public APIs exported via `src/index.ts` in each package

## Package Names

- `@ooxml/core`
- `@ooxml/parser`
- `@ooxml/desktop`
- `@ooxml-tools/lsp-server` (from the `packages/ooxml-lsp` submodule)

## CI

GitHub Actions (`.github/workflows/ci.yml`): typecheck → lint → build → test, across Ubuntu/Windows/macOS × Node 18/20/22.

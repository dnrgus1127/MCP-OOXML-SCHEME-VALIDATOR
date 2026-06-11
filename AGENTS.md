# Repository Guidelines

## Project Structure & Module Organization

This repository is a `pnpm` + Turborepo monorepo for an OOXML document editor.

- `packages/core`: schema registry and validation engine (`src/`, tests in `src/__tests__/`).
- `packages/parser`: ZIP/XML parsing utilities used by validation flows.
- `packages/desktop`: Electron + React desktop app (`src/main`, `src/preload`, `src/renderer`).
- `packages/ooxml-lsp`: Git submodule with the LSP server and validation engines the desktop app runs as a child process.
- `tools/xsd-converter`: converts XSD files to runtime schema data.
- `tools/validate-xml`: developer CLI for validating XML against the schemas.
- `schemas/`: OOXML XSD sources; `docs/`: design and integration docs.
- `agent/`: AI agent playbooks and mandatory working guides.

## Mandatory Read For Desktop UI/UX Work

- Required doc: `agent/desktop-ui-ux-agent-guide.md`
- If a task touches `@ooxml/desktop` UI/UX (layout, components, styles, accessibility, interaction flow, visual design), agents must read this file before planning or implementing changes.
- Apply the guide as the default quality gate for desktop design decisions.

## Build, Test, and Development Commands

Run from repository root unless noted.

- `pnpm install`: install workspace dependencies.
- `pnpm run build`: builds all packages via Turbo.
- `pnpm run dev`: starts package dev/watch tasks.
- `pnpm run test`: runs workspace tests (`vitest`).
- `pnpm run lint`: runs lint pipeline across packages.
- `pnpm run typecheck`: strict TypeScript checks.
- `pnpm run format`: Prettier on `ts/tsx/js/jsx/json/md`.

Useful package-scoped examples:

- `pnpm --filter @ooxml/core test`
- `pnpm --filter @ooxml/desktop dev`
- `pnpm --filter @ooxml/desktop package:mac`

## Coding Style & Naming Conventions

- TypeScript-first, ESM modules, strict compiler options (`tsconfig.base.json`).
- Prettier rules: 2 spaces, single quotes, no semicolons, trailing commas (`es5`), print width 100.
- Use `camelCase` for variables/functions, `PascalCase` for types/components, and kebab-case for file names where already established.
- Keep modules focused; place package-specific logic inside its package boundary.

## Testing Guidelines

- Framework: `vitest` across packages.
- Test files: `*.test.ts` (example: `packages/core/src/__tests__/chart-validation.test.ts`).
- Add tests for parser/validation edge cases and editor/LSP behavior when changing logic.
- Run targeted tests while iterating, then `pnpm run test` before opening a PR.

## Commit & Pull Request Guidelines

- Follow the repository’s history style: short imperative subject lines (e.g., `Fix nested validation ordering`) with optional prefixes like `chore:`.
- Keep commits scoped to one logical change.
- PRs should include:
  - clear summary and affected packages,
  - linked issue/context,
  - test evidence (command + result),
  - screenshots/GIFs for `packages/desktop` UI changes.

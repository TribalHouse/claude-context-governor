# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-05-16

### Added
- MCP aggregator (`index.mjs`) with `gov.*` intent tools and optional backend passthrough.
- Three backend lifecycle modes: `always_on`, on-demand stdio with idle timeout, and `disabled`.
- Env-var placeholder expansion (`${VAR_NAME}`) in registry headers.
- Log redactor for Bearer tokens, JWTs, and common secret patterns. 2 MB rotation.
- Installer (`install.mjs`) with `--dry-run` and `--no-settings` flags. Idempotent.
- Skill governor CLIs: `skill-status`, `skill-enable`, `skill-disable`, `skill-use`.
- Routing hook (`hooks/route-prompt.mjs`) emitting `[ROUTING ADVICE]` lines.
- macOS launchd integration via `mcpd/` scripts.
- CI matrix: Node 18/20/22 on Ubuntu and macOS.
- Documentation: README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY.
- Issue and PR templates.

[Unreleased]: https://github.com/TribalHouse/claude-context-governor/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/TribalHouse/claude-context-governor/releases/tag/v1.0.0

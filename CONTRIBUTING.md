# Contributing

Thanks for contributing to localmd.

## Development setup

```bash
npm install
npm start
```

## Before opening a PR

1. Keep changes focused and small.
2. Run a local packaging smoke test:

```bash
npm run dist:mac -- --dir
```

3. Update docs when behavior or UI changes.
4. Use clear commit messages.

## Pull request checklist

1. Describe what changed and why.
2. Include screenshots for UI changes.
3. Note any known limitations or follow-ups.

## Code style

- Prefer readable, straightforward code.
- Keep UI interactions keyboard-accessible.
- Preserve cross-platform behavior (macOS first, Linux/Windows compatible).

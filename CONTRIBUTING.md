# Contributing to Nysera CLI

Thanks for helping! Nysera is small on purpose, so a short, focused change is the easiest to review.

## Reporting a bug

Open an [issue](https://github.com/nysera-dev/nysera/issues/new/choose) with:

- what you ran or clicked, and what you expected
- what happened instead (error text or a screenshot)
- Output of `nysera --version` and `node --version`

**Never paste your OpenRouter API key** into an issue, a log or a screenshot.

## Suggesting a feature

Open a feature request and describe the problem first, then the change you have in mind.

## Working on the code

```bash
git clone https://github.com/nysera-dev/nysera
cd nysera
npm link
NYSERA_MOCK=1 nysera run "hello world in python with a test" --no-tui
```

- No new runtime dependencies without a good reason — the project uses plain Node.js.
- Keep the honesty rules: a lane is only `verified` when a test or review actually passed.
- Run a full flow in mock mode (`NYSERA_MOCK=1`) before opening a PR, and `node --check` any file you touched.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Make your change and describe *why* in the PR.
3. Link the issue it fixes, if there is one.

By contributing you agree your work is released under the [MIT License](LICENSE).

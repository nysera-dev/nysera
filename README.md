# Nysera

**An AI agent crew in your terminal.** Give Nysera a task. It plans the work as a graph of lanes, runs the lanes in parallel on the right model for each kind of work, and only calls a lane **verified** when a real check passed.

```
planned → running → reported (agent says done) → verified (a test or review passed)
```

## Install

Requires Node.js 18+. Website: [nysera.app](https://nysera.app)

```bash
npm i -g github:nysera-dev/nysera
```

Or from a clone:

```bash
git clone https://github.com/nysera-dev/nysera && cd nysera && npm link
```

Prefer a window? [Nysera Desktop](https://github.com/nysera-dev/nysera-desktop/releases/latest) for macOS (Apple silicon) and Windows runs the same engine.

## Set up

Nysera calls models through [OpenRouter](https://openrouter.ai), so one API key covers OpenAI, Claude, Gemini, DeepSeek, Qwen, Kimi, Mistral and more.

```bash
nysera setup     # paste your OpenRouter key (stored in ~/.nysera/config.json)
nysera doctor    # checks the key and that every model in your chains exists
```

You can also set `OPENROUTER_API_KEY` instead of running setup.

## Run a task

```bash
nysera run "add a /health endpoint to the express app and test it" --write --test "npm test"
```

What happens:

1. **Plan** — the `plan` model splits the task into 2–7 lanes with dependencies.
2. **Run** — lanes with no dependencies start together; later layers get the earlier lanes' output.
3. **Route** — each lane has a category (`code`, `test`, `docs`, `deep`, `quick`, `research`). The category picks an ordered model chain. If a model fails, the next one takes over, and the log says which model actually answered (no silent downgrade).
4. **Verify** — with `--test "<cmd>"`, lanes become `verified` only if the command passes. A failed test keeps them `reported`. Without `--test`, a separate reviewer model checks each lane.
5. **Log** — everything is saved in `.nysera/runs/<id>/`: `summary.md`, each lane's full output, generated files, and test output.

### Options

| Option | What it does |
|---|---|
| `--write` | Write generated files into the project. Existing files are backed up into the run folder first. Without it, files only go to `.nysera/runs/<id>/files/`. |
| `--test "<cmd>"` | Run a command after the lanes. Pass → lanes are verified. |
| `--no-review` | Skip the reviewer model. |
| `--concurrency <n>` | Max lanes at once (default 4). |
| `--dir <path>` | Project folder (default: current folder). |
| `--no-tui` | Plain log lines instead of the live board. |

## Model chains

```bash
nysera model                                   # show chains per category
nysera model set code anthropic/claude-sonnet-4,deepseek/deepseek-chat
nysera model effort review high
nysera model reset
```

Chains live in `~/.nysera/routing/model-chains.json`. Model IDs are OpenRouter IDs; they change over time, so run `nysera doctor` after editing.

## Try it without a key

```bash
NYSERA_MOCK=1 nysera run "hello world in python with a test" --write --test "python3 -m unittest"
```

Mock mode uses canned replies so you can see the whole flow offline.

## Safety

- Files are only written inside the project folder; absolute paths and `..` are refused.
- Without `--write`, Nysera never touches your project files.
- `--test` runs the command you give it in your shell — only pass commands you trust.

## License

MIT

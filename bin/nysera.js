#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { loadConfig, saveConfig, loadChains, saveChains, DEFAULT_CHAINS, CONFIG_PATH, CHAINS_PATH, isMock } from '../src/config.js';
import { checkKey, listModels } from '../src/models.js';
import { run } from '../src/run.js';
import { c, banner, log, pad } from '../src/ui.js';

const VERSION = '0.1.0';
const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name) { return argv.includes(`--${name}`); }
function opt(name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}
function positional() {
  const out = [];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { if (['test', 'dir', 'concurrency', 'key', 'fix'].includes(argv[i].slice(2))) i++; continue; }
    out.push(argv[i]);
  }
  return out;
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); else rl.output.write('*'); };
    rl.question(question, (a) => { rl.close(); process.stdout.write('\n'); resolve(a.trim()); });
  });
}

function help() {
  console.log(`
${banner()}  ${c.gray('v' + VERSION)}
${c.gray('An AI agent crew in your terminal.')}

${c.bold('Usage')}
  ${c.pink('nysera setup')}                       save your OpenRouter API key
  ${c.pink('nysera doctor')}                      check key, models and config
  ${c.pink('nysera run')} "<task>" [options]      plan → parallel lanes → verify
  ${c.pink('nysera model')}                       show model chains per category
  ${c.pink('nysera model set')} <cat> <id,id,…>   change a category's chain
  ${c.pink('nysera model effort')} <cat> <low|medium|high>
  ${c.pink('nysera model reset')}                 back to default chains
  ${c.pink('nysera runs')}                        list past runs in this folder

${c.bold('Run options')}
  --write              apply generated files to the project (originals backed up)
  --test "<cmd>"       run a command after the lanes; pass → lanes are ${c.green('verified')}
  --no-review          skip the reviewer model
  --concurrency <n>    max lanes at once (default 4)
  --fix <n>            if --test fails, let the fixer repair and retry n times (default 2, 0 = off)
  --dir <path>         project folder (default: current folder)
  --no-tui             plain log output

${c.bold('Statuses')}
  ${c.gray('planned')} → ${c.blue('running')} → ${c.yellow('reported')} (agent says done) → ${c.green('verified')} (a test or review passed)

${c.gray('Try it without a key:')} NYSERA_MOCK=1 nysera run "hello world in python with a test"
`);
}

async function setup() {
  console.log(`\n${banner()}  ${c.gray('setup')}\n`);
  const cfg = loadConfig();
  let key = opt('key');
  if (!key && !isMock()) {
    console.log(c.gray('Nysera calls models through OpenRouter, so one key covers many providers.'));
    console.log(c.gray('Get a key at https://openrouter.ai/keys\n'));
    key = await askHidden(`OpenRouter API key${cfg.apiKey ? ' (enter to keep current)' : ''}: `);
  }
  if (key) cfg.apiKey = key;
  if (!cfg.apiKey && !isMock()) { log.err('no key given.'); process.exit(1); }
  if (!isMock()) {
    const r = await checkKey(cfg.apiKey).catch((e) => ({ ok: false, status: e.message }));
    if (!r.ok) { log.err(`OpenRouter did not accept that key (${r.status}).`); process.exit(1); }
  }
  saveConfig(cfg);
  if (!fs.existsSync(CHAINS_PATH)) saveChains(DEFAULT_CHAINS);
  log.ok(`key saved to ${CONFIG_PATH}`);
  log.ok(`model chains at ${CHAINS_PATH}`);
  console.log(`\nNext: ${c.pink('nysera doctor')}, then ${c.pink('nysera run "your task"')}\n`);
}

async function doctor() {
  console.log(`\n${banner()}  ${c.gray('doctor')}\n`);
  let problems = 0;
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 18) log.ok(`node ${process.versions.node}`); else { log.err(`node ${process.versions.node} — need 18+`); problems++; }
  const cfg = loadConfig();
  if (isMock()) log.warn('mock mode (NYSERA_MOCK=1) — no real API calls');
  else if (!cfg.apiKey) { log.err('no API key — run `nysera setup` or set OPENROUTER_API_KEY'); problems++; }
  else {
    const r = await checkKey(cfg.apiKey).catch((e) => ({ ok: false, status: e.message }));
    if (r.ok) log.ok(`OpenRouter key works${r.info && r.info.label ? ` (${r.info.label})` : ''}`);
    else { log.err(`OpenRouter key rejected (${r.status})`); problems++; }
  }
  const chains = loadChains();
  let ids = null;
  try { ids = await listModels(cfg.apiKey); } catch (e) { log.warn(`could not fetch model list: ${e.message}`); }
  for (const [cat, v] of Object.entries(chains)) {
    if (!ids) { log.info(`${pad(cat, 9)} ${v.chain.join(' → ')}`); continue; }
    const missing = v.chain.filter((m) => !m.startsWith('~') && !ids.has(m)); // ~ = OpenRouter "latest" alias, not in the list
    if (missing.length === v.chain.length) { log.err(`${pad(cat, 9)} none of its models exist: ${missing.join(', ')}`); problems++; }
    else if (missing.length) log.warn(`${pad(cat, 9)} unknown model(s) will be skipped: ${missing.join(', ')}`);
    else log.ok(`${pad(cat, 9)} ${v.chain.join(' → ')}`);
  }
  console.log('');
  if (problems) { log.err(`${problems} problem(s). Fix them with \`nysera setup\` or \`nysera model set\`.`); process.exit(1); }
  log.ok('ready.');
}

function model() {
  const sub = argv[1];
  const chains = loadChains();
  if (sub === 'set') {
    const [cat, list] = [argv[2], argv[3]];
    if (!cat || !list) { log.err('usage: nysera model set <category> <model,model,...>'); process.exit(1); }
    chains[cat] = { ...(chains[cat] || { effort: 'medium', about: 'custom' }), chain: list.split(',').map((s) => s.trim()).filter(Boolean) };
    saveChains(chains); log.ok(`${cat} → ${chains[cat].chain.join(' → ')}`); return;
  }
  if (sub === 'effort') {
    const [cat, eff] = [argv[2], argv[3]];
    if (!chains[cat] || !['low', 'medium', 'high'].includes(eff)) { log.err('usage: nysera model effort <category> <low|medium|high>'); process.exit(1); }
    chains[cat].effort = eff; saveChains(chains); log.ok(`${cat} effort → ${eff}`); return;
  }
  if (sub === 'reset') { saveChains(DEFAULT_CHAINS); log.ok('chains reset to defaults'); return; }
  console.log(`\n${banner()}  ${c.gray('model chains')}  ${c.gray(CHAINS_PATH)}\n`);
  for (const [cat, v] of Object.entries(chains)) {
    console.log(`  ${c.pink(pad(cat, 10))}${c.gray(pad(v.effort, 8))}${v.chain.join(c.gray(' → '))}`);
    if (v.about) console.log(`  ${' '.repeat(18)}${c.gray(v.about)}`);
  }
  console.log(`\n  ${c.gray('No silent downgrade: if a model fails, the next one in the chain takes over and the log says which answered.')}\n`);
}

function runs() {
  const dir = path.resolve(opt('dir') || '.', '.nysera', 'runs');
  if (!fs.existsSync(dir)) { log.info('no runs in this folder yet.'); return; }
  const ids = fs.readdirSync(dir).sort().reverse().slice(0, 15);
  for (const id of ids) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dir, id, 'run.json'), 'utf8'));
      const v = r.lanes.filter((l) => l.status === 'verified').length;
      console.log(`  ${c.gray(id)}  ${c.green(`${v}/${r.lanes.length} verified`)}  ${r.task.slice(0, 60)}`);
    } catch { console.log(`  ${c.gray(id)}  ${c.red('incomplete')}`); }
  }
}

async function runCmd() {
  const task = positional().join(' ').trim();
  if (!task) { log.err('usage: nysera run "<task>"'); process.exit(1); }
  const cfg = loadConfig();
  if (!cfg.apiKey && !isMock()) { log.err('no API key — run `nysera setup` first (or try NYSERA_MOCK=1).'); process.exit(1); }
  const cwd = path.resolve(opt('dir') || '.');
  const ctrl = new AbortController();
  process.on('SIGINT', () => { console.log(''); log.warn('stopped.'); process.exit(130); });
  try {
    await run({
      apiKey: cfg.apiKey, chains: loadChains(), task, cwd,
      write: flag('write'), testCmd: opt('test'), review: !flag('no-review'),
      concurrency: Math.max(1, Number(opt('concurrency')) || 4),
      fixAttempts: opt('fix') !== undefined && opt('fix') !== null ? Math.max(0, Number(opt('fix')) || 0) : 2,
      tui: process.stdout.isTTY && !flag('no-tui'), signal: ctrl.signal
    });
  } catch (e) {
    console.log('');
    log.err(e.message);
    process.exit(1);
  }
}

const commands = { setup, doctor, model, run: runCmd, runs, help, '--help': help, '-h': help };
if (cmd === '--version' || cmd === '-v') console.log(VERSION);
else if (!cmd) help();
else if (commands[cmd]) await commands[cmd]();
else { log.err(`unknown command: ${cmd}`); help(); process.exit(1); }

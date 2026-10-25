import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DELIMITER = /^\s*={2,}\s*$/m;
const COMMAND = /^[A-Z]+(\s[A-Z]+){0,2}$/;
const SEPARATOR = `\n\n${'='.repeat(32)}\n\n`;

const [checkout] = process.argv.slice(2);
if (!checkout) {
  console.error('usage: node tools/sync-darkreader-data.mjs <darkreader-checkout>');
  process.exit(1);
}

const target = path.join(import.meta.dirname, '..', 'modules', 'dark');
const readUpstream = (name) => readFile(path.join(checkout, 'src', 'config', name), 'utf8');
const lines = (text) => text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);

const allowlist = lines(await readFile(path.join(target, 'fixes-allowlist.txt'), 'utf8'))
  .filter((line) => !line.startsWith('#'))
  .map((domain) => domain.toLowerCase().split('.').reverse());

const hostLabels = (pattern) => pattern
  .replace(/^\^/, '')
  .replace(/^[a-z]+:\/\//, '')
  .split('/')[0]
  .replace(/:[\d*]+$/, '')
  .toLowerCase()
  .split('.')
  .reverse();

const isAllowed = (pattern) => {
  const labels = hostLabels(pattern);
  const anyTLD = labels[0] === '*';
  const host = anyTLD ? labels.slice(labels.findIndex((label) => label !== '*')) : labels;
  return allowlist
    .map((domain) => (anyTLD ? domain.slice(1) : domain))
    .some((domain) => domain.length && domain.length <= host.length && domain.every((label, i) => label === host[i]));
};

const blocksOf = (text) => text.replace(/\r/g, '').split(DELIMITER).flatMap((block) => {
  const body = block.split('\n');
  const first = body.findIndex((line) => COMMAND.test(line));
  return first < 0 ? [] : [{ urls: lines(body.slice(0, first).join('\n')), text: block.trim() }];
});

const subset = (text) => {
  const blocks = blocksOf(text);
  const kept = blocks.filter(({ urls }) => urls.includes('*') || urls.some(isAllowed));
  return { text: `${kept.map((block) => block.text).join(SEPARATOR)}\n`, kept: kept.length, total: blocks.length };
};

const write = async (name, text, summary) => {
  await writeFile(path.join(target, name), text);
  console.log(`${name}: ${summary}`);
};

const hints = await readUpstream('detector-hints.config');
await write('detector-hints.config', hints, `${blocksOf(hints).length} blocks`);

for (const [source, name] of [['dynamic-theme-fixes.config', 'fixes.config'], ['inversion-fixes.config', 'inversion-fixes.config']]) {
  const { text, kept, total } = subset(await readUpstream(source));
  await write(name, text, `${kept} of ${total} blocks`);
}

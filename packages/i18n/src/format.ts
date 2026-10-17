/**
 * A small ICU-style message formatter (no dependency; same behaviour in Node, browsers and Hermes):
 * - `{name}`                                       the value, numbers formatted for the language
 * - `{count, plural, =0 {…} one {…} other {…}}`   Intl.PluralRules; `#` = the number
 * - `{kind, select, ebay {…} other {…}}`          pick by value
 * Branches may nest. Apostrophes are plain text (no ICU quoting). A missing value is left as
 * `{name}` so a mistake is visible instead of silently empty.
 */
export type MessageValues = Readonly<Record<string, string | number | null | undefined>>;

type Node = string | { arg: string } | { arg: string; kind: 'plural' | 'select'; branches: Record<string, Node[]> } | { hash: true };

const cache = new Map<string, Node[]>();

export function formatMessage(pattern: string, values: MessageValues = {}, language = 'en'): string {
  let nodes = cache.get(pattern);
  if (!nodes) {
    nodes = parse(pattern);
    cache.set(pattern, nodes);
  }
  return render(nodes, values, language, null);
}

function render(nodes: Node[], values: MessageValues, language: string, hash: number | null): string {
  let out = '';
  for (const node of nodes) {
    if (typeof node === 'string') out += node;
    else if ('hash' in node) out += hash === null ? '#' : number(hash, language);
    else if (!('kind' in node)) {
      const v = values[node.arg];
      out += v === undefined || v === null ? `{${node.arg}}` : typeof v === 'number' ? number(v, language) : v;
    } else {
      const raw = values[node.arg];
      if (node.kind === 'plural') {
        const n = typeof raw === 'number' ? raw : Number(raw);
        const branch = node.branches[`=${n}`] ?? node.branches[pluralCategory(n, language)] ?? node.branches.other ?? [];
        out += render(branch, values, language, n);
      } else {
        out += render(node.branches[String(raw)] ?? node.branches.other ?? [], values, language, hash);
      }
    }
  }
  return out;
}

const pluralRules = new Map<string, Intl.PluralRules>();
/** Hermes (React Native's engine) has no Intl.PluralRules - `new Intl.PluralRules` crashes the app there. */
const hasPluralRules = typeof Intl !== 'undefined' && typeof Intl.PluralRules === 'function';

export function pluralCategory(n: number, language: string, useIntl = hasPluralRules): string {
  if (!useIntl) {
    // English and German (the supported languages) share one cardinal rule: "one" for exactly 1
    // with no fraction, otherwise "other". A new language with other rules needs its own branch here.
    return Math.abs(n) === 1 ? 'one' : 'other';
  }
  let rules = pluralRules.get(language);
  if (!rules) {
    rules = new Intl.PluralRules(language);
    pluralRules.set(language, rules);
  }
  return rules.select(n);
}

function number(n: number, language: string): string {
  return Number.isInteger(n) && Math.abs(n) < 10_000 ? String(n) : new Intl.NumberFormat(language).format(n);
}

function parse(pattern: string): Node[] {
  let i = 0;
  const fail = (why: string) => new Error(`Bad message "${pattern}": ${why} at ${i}`);

  function nodesUntil(close: boolean, inPlural: boolean): Node[] {
    const nodes: Node[] = [];
    let text = '';
    const flush = () => {
      if (text) nodes.push(text);
      text = '';
    };
    while (i < pattern.length) {
      const c = pattern[i]!;
      if (c === '}') {
        if (!close) throw fail('unexpected }');
        flush();
        return nodes;
      }
      if (c === '{') {
        flush();
        nodes.push(argument(inPlural));
        continue;
      }
      if (c === '#' && inPlural) {
        flush();
        nodes.push({ hash: true });
        i++;
        continue;
      }
      text += c;
      i++;
    }
    if (close) throw fail('missing }');
    flush();
    return nodes;
  }

  function word(): string {
    const m = /^\s*([^\s,{}]+)\s*/.exec(pattern.slice(i));
    if (!m) throw fail('expected a name');
    i += m[0].length;
    return m[1]!;
  }

  function argument(inPlural: boolean): Node {
    i++; // {
    const arg = word();
    if (pattern[i] === '}') {
      i++;
      return { arg };
    }
    if (pattern[i] !== ',') throw fail('expected , or }');
    i++;
    const kind = word();
    if (kind !== 'plural' && kind !== 'select') throw fail(`unknown type ${kind}`);
    if (pattern[i] !== ',') throw fail('expected ,');
    i++;
    const branches: Record<string, Node[]> = {};
    for (;;) {
      while (/\s/.test(pattern[i] ?? '')) i++;
      if (pattern[i] === '}') {
        i++;
        break;
      }
      const key = word();
      if (pattern[i] !== '{') throw fail('expected {');
      i++;
      branches[key] = nodesUntil(true, kind === 'plural' || inPlural);
      i++; // }
    }
    if (!branches.other) throw fail(`${kind} needs an "other" branch`);
    return { arg, kind, branches };
  }

  return nodesUntil(false, false);
}

/** Argument names used by a message (for checking translations keep the same placeholders). */
export function messageArguments(pattern: string): string[] {
  const names = new Set<string>();
  const walk = (nodes: Node[]) =>
    nodes.forEach((n) => {
      if (typeof n === 'string' || 'hash' in n) return;
      names.add(n.arg);
      if ('kind' in n) Object.values(n.branches).forEach(walk);
    });
  walk(parse(pattern));
  return [...names].sort();
}

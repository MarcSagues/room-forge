#!/usr/bin/env node
// RoomForge — validador, generador de backlog e importador de issues a GitHub.
// Sin dependencias (Node >= 20). Por defecto NUNCA escribe en GitHub.
//
//   node tools/planning/github-import.mjs validate
//   node tools/planning/github-import.mjs backlog
//   node tools/planning/github-import.mjs import --repo OWNER/REPO [--phases 0-8] [--branch develop]            (dry-run)
//   node tools/planning/github-import.mjs import --repo OWNER/REPO --apply [--phases 0-8] [--delay 1500]      (escribe)
//   node tools/planning/github-import.mjs import --repo OWNER/REPO --apply --refresh                          (reescribe el cuerpo de las ya importadas; añade --only P0-03,P1-04 para limitarlo)
//   node tools/planning/github-import.mjs show P1-01 [--repo OWNER/REPO]                                      (cuerpo renderizado)

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ISSUES_DIR = path.join(ROOT, 'docs', 'issues');
// ROOMFORGE_IMPORT_STATE y GH_BIN existen solo para probar el importador con un `gh` simulado (ver tools/planning/README.md).
const STATE_FILE = process.env.ROOMFORGE_IMPORT_STATE || path.join(ISSUES_DIR, '.import-state.json');
const BACKLOG_FILE = path.join(ROOT, 'docs', 'BACKLOG.md');

const TYPES = ['epic', 'feature', 'task', 'spike', 'bug'];
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const PRIORITY_LABEL = { P0: 'P0-critical', P1: 'P1-important', P2: 'P2-improvement', P3: 'P3-future' };
const SIZE_DAYS = { XS: 0.25, S: 0.5, M: 1, L: 2, XL: 4 };
const REQUIRED_SECTIONS = ['Descripción', 'Contexto', 'Requisitos', 'Criterios de aceptación', 'Tests esperados'];
const ID_RE = /\b(E\d+|P\d{1,2}-\d{2})\b/g;
const HEADING_RE = /^## ISSUE ((?:E\d+)|(?:P\d{1,2}-\d{2})) [—–-] (.+)$/;
const META_RE = /^- \*\*(.+?):\*\*\s*(.*)$/;

// ───────────────────────────── parseo ─────────────────────────────
function loadJson(file) {
  return JSON.parse(readFileSync(path.join(HERE, file), 'utf8'));
}

function parseFile(file) {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const issues = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (m) {
      current = { id: m[1], title: m[2].trim(), file: path.relative(ROOT, file).replace(/\\/g, '/'), line: i + 1, raw: [] };
      issues.push(current);
    } else if (current) {
      current.raw.push(lines[i]);
    }
  }
  return issues.map(finishIssue);
}

function finishIssue(issue) {
  const lines = issue.raw;
  let idx = 0;
  while (idx < lines.length && lines[idx].trim() === '') idx++;
  const meta = {};
  while (idx < lines.length && META_RE.test(lines[idx])) {
    const [, k, v] = META_RE.exec(lines[idx]);
    meta[k.trim()] = v.trim();
    idx++;
  }
  const body = lines.slice(idx).join('\n').trim();
  // secciones (### Nombre)
  const sections = [];
  let cur = null;
  for (const l of body.split('\n')) {
    const h = /^### (.+)$/.exec(l);
    if (h) {
      cur = { name: h[1].trim(), text: [] };
      sections.push(cur);
    } else if (cur) cur.text.push(l);
  }
  const list = (v) => (!v || /^—/.test(v) ? [] : v.split(',').map((s) => s.trim()).filter(Boolean));
  const est = meta['Estimación'] ?? '';
  return {
    id: issue.id,
    title: issue.title,
    file: issue.file,
    line: issue.line,
    type: meta['Tipo'],
    priority: meta['Prioridad'],
    epic: /^—/.test(meta['Épica'] ?? '—') ? null : meta['Épica'],
    milestone: meta['Hito'],
    size: /^(XS|S|M|L|XL)\b/.exec(est)?.[1] ?? null,
    estimateRaw: est,
    labels: list(meta['Etiquetas']),
    depends: list(meta['Depende de']),
    metaKeys: Object.keys(meta),
    sections: sections.map((s) => ({ name: s.name, text: s.text.join('\n').trim() })),
  };
}

function loadAll() {
  const files = readdirSync(ISSUES_DIR)
    .filter((f) => /^\d\d-.*\.md$/.test(f))
    .sort()
    .map((f) => path.join(ISSUES_DIR, f));
  return files.flatMap(parseFile);
}

// ───────────────────────────── validación ─────────────────────────────
function validate(issues) {
  const errors = [];
  const warnings = [];
  const labels = new Set(loadJson('labels.json').map((l) => l.name));
  const milestones = new Set(loadJson('milestones.json').map((m) => m.id));
  const byId = new Map();
  const err = (i, msg) => errors.push(`${i.id} (${i.file}:${i.line}): ${msg}`);
  const warn = (i, msg) => warnings.push(`${i.id}: ${msg}`);

  for (const i of issues) {
    if (byId.has(i.id)) err(i, 'ID duplicado');
    byId.set(i.id, i);
  }

  for (const i of issues) {
    for (const k of ['Tipo', 'Prioridad', 'Épica', 'Hito', 'Estimación', 'Etiquetas', 'Depende de']) {
      if (!i.metaKeys.includes(k)) err(i, `falta el campo «${k}»`);
    }
    if (!TYPES.includes(i.type)) err(i, `tipo inválido «${i.type}»`);
    if (!PRIORITIES.includes(i.priority)) err(i, `prioridad inválida «${i.priority}»`);
    if (!milestones.has(i.milestone)) err(i, `hito inexistente «${i.milestone}»`);
    if (i.title.length > 100) err(i, 'título > 100 caracteres');

    const expectedMs = i.id.startsWith('E') ? `M${i.id.slice(1)}` : `M${i.id.slice(1, i.id.indexOf('-'))}`;
    if (i.milestone !== expectedMs) err(i, `el hito ${i.milestone} no coincide con el prefijo del ID (esperado ${expectedMs})`);

    if (i.type === 'epic') {
      if (i.size) warn(i, 'las épicas no llevan estimación propia');
      if (i.epic) err(i, 'una épica no puede tener épica');
    } else {
      if (!i.size) err(i, `estimación inválida «${i.estimateRaw}» (XS|S|M|L|XL)`);
      if (i.size === 'XL' && !i.labels.includes('post-mvp')) warn(i, 'XL en el MVP: dividir antes de empezar');
      if (i.epic) {
        const e = byId.get(i.epic);
        if (!e) err(i, `épica inexistente «${i.epic}»`);
        else if (e.type !== 'epic') err(i, `«${i.epic}» no es una épica`);
        else if (e.milestone !== i.milestone) err(i, `la épica ${i.epic} es de otro hito`);
      } else if (!i.id.startsWith('P0-')) {
        warn(i, 'sin épica');
      }
    }

    for (const l of i.labels) if (!labels.has(l)) err(i, `etiqueta no definida «${l}» (tools/planning/labels.json)`);

    for (const d of i.depends) {
      const dep = byId.get(d);
      if (!dep) err(i, `depende de una issue inexistente «${d}»`);
      else {
        if (d === i.id) err(i, 'depende de sí misma');
        if (dep.type === 'epic') err(i, `depende de una épica «${d}» (usa issues concretas)`);
        if (Number(dep.milestone.slice(1)) > Number(i.milestone.slice(1))) err(i, `depende de ${d}, de un hito posterior (${dep.milestone})`);
        if (PRIORITIES.indexOf(dep.priority) > PRIORITIES.indexOf(i.priority) && i.priority !== 'P3')
          warn(i, `${i.priority} depende de ${d} (${dep.priority}, menos prioritaria)`);
      }
    }

    const names = i.sections.map((s) => s.name);
    for (const r of REQUIRED_SECTIONS) {
      const s = i.sections.find((x) => x.name === r);
      if (!s) err(i, `falta la sección «${r}»`);
      else if (s.text.length < 8) err(i, `la sección «${r}» está vacía`);
    }
    const ac = i.sections.find((x) => x.name === 'Criterios de aceptación');
    if (ac) {
      const n = (ac.text.match(/^- \[[ xX]\] /gm) ?? []).length;
      if (n < 2) err(i, `«Criterios de aceptación» debe tener ≥2 casillas «- [ ]» / «- [x]» (tiene ${n})`);
    }
    if (names.length !== new Set(names).size) err(i, 'secciones duplicadas');
  }

  // ciclos
  const state = new Map();
  const stack = [];
  const visit = (id) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      errors.push(`ciclo de dependencias: ${[...stack.slice(stack.indexOf(id)), id].join(' → ')}`);
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const d of byId.get(id)?.depends ?? []) if (byId.has(d)) visit(d);
    stack.pop();
    state.set(id, 2);
  };
  for (const i of issues) visit(i.id);

  // referencias a issues en la documentación
  for (const f of walkMd(path.join(ROOT, 'docs')).concat(['README.md', 'AGENTS.md', 'CLAUDE.md'].map((x) => path.join(ROOT, x)).filter(existsSync))) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const txt = readFileSync(f, 'utf8');
    for (const m of txt.matchAll(/\bP\d-\d{2}\b/g)) {
      if (!byId.has(m[0])) errors.push(`${rel}: referencia a issue inexistente ${m[0]}`);
    }
  }

  return { errors, warnings, byId };
}

function walkMd(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMd(p));
    else if (e.name.endsWith('.md') && !p.includes(`${path.sep}issues${path.sep}`)) out.push(p);
  }
  return out;
}

// ───────────────────────────── análisis ─────────────────────────────
function topo(issues) {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const done = new Set();
  const out = [];
  // Los spikes del MVP se adelantan en cuanto sus dependencias lo permiten (reducir riesgo pronto).
  const rank = (i) => [
    i.type === 'spike' && Number(i.milestone.slice(1)) <= 8 ? 0 : 1,
    Number(i.milestone.slice(1)),
    PRIORITIES.indexOf(i.priority),
    SIZE_DAYS[i.size] ?? 0,
    i.id,
  ];
  const cmp = (a, b) => {
    const ra = rank(a), rb = rank(b);
    for (let k = 0; k < 4; k++) if (ra[k] !== rb[k]) return ra[k] - rb[k];
    return ra[4].localeCompare(rb[4]);
  };
  const pending = issues.filter((i) => i.type !== 'epic').sort(cmp);
  while (pending.length) {
    // Las dependencias fuera de la lista (p. ej. al importar solo algunas fases) se consideran satisfechas.
    const idx = pending.findIndex((i) => i.depends.every((d) => done.has(d) || !byId.has(d) || byId.get(d).type === 'epic'));
    if (idx < 0) throw new Error('ciclo o dependencia no resuelta');
    const [n] = pending.splice(idx, 1);
    done.add(n.id);
    out.push(n);
  }
  return out;
}

function stats(issues) {
  const work = issues.filter((i) => i.type !== 'epic');
  const days = (list) => list.reduce((a, i) => a + (SIZE_DAYS[i.size] ?? 0), 0);
  const byMs = {};
  for (const i of work) {
    (byMs[i.milestone] ??= []).push(i);
  }
  const order = topo(issues);
  const best = new Map();
  const prev = new Map();
  for (const i of order) {
    let b = 0, p = null;
    for (const d of i.depends) {
      if ((best.get(d) ?? 0) > b) { b = best.get(d); p = d; }
    }
    best.set(i.id, b + (SIZE_DAYS[i.size] ?? 0));
    prev.set(i.id, p);
  }
  // ruta crítica del MVP (hasta M8)
  const mvp = order.filter((i) => Number(i.milestone.slice(1)) <= 8);
  let end = null;
  for (const i of mvp) if (!end || best.get(i.id) > best.get(end)) end = i.id;
  const critical = [];
  for (let c = end; c; c = prev.get(c)) critical.unshift(c);
  return { work, byMs, days, order, best, critical, criticalDays: end ? best.get(end) : 0 };
}

function fmt(n) {
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}

// ───────────────────────────── backlog ─────────────────────────────
function backlogMarkdown(issues) {
  const s = stats(issues);
  const byId = new Map(issues.map((i) => [i.id, i]));
  const ms = loadJson('milestones.json');
  const lines = [];
  lines.push('# RoomForge — Backlog priorizado');
  lines.push('');
  lines.push('> **Generado automáticamente** por `node tools/planning/github-import.mjs backlog` desde `docs/issues/*.md`. No editar a mano.');
  lines.push('> Estimaciones: días ideales de desarrollo asistido por IA (XS 0,25 · S 0,5 · M 1 · L 2 · XL 4). Ver [ROADMAP](ROADMAP.md).');
  lines.push('');
  lines.push('## 1. Resumen por hito');
  lines.push('');
  lines.push('| Hito | Fase | Issues | P0 | P1 | P2 | P3 | Esfuerzo (días) |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|');
  let total = 0, totalMvp = 0, count = 0;
  for (const m of ms) {
    const list = s.byMs[m.id] ?? [];
    const c = (p) => list.filter((i) => i.priority === p).length;
    const d = s.days(list);
    total += d;
    count += list.length;
    if (Number(m.id.slice(1)) <= 8) totalMvp += d;
    lines.push(`| ${m.id} | ${m.title.replace(/^M\d+ · /, '')} | ${list.length} | ${c('P0')} | ${c('P1')} | ${c('P2')} | ${c('P3')} | ${fmt(d)} |`);
  }
  lines.push(`| **Total** | | **${count}** | | | | | **${fmt(total)}** |`);
  lines.push('');
  lines.push(`- **MVP + beta (M0–M8):** ${fmt(totalMvp)} días ideales. **Fase 9 (post-MVP):** ${fmt(total - totalMvp)} días ideales (muy incierto).`);
  lines.push(`- **Ruta crítica del MVP:** ${s.critical.join(' → ')} (${fmt(s.criticalDays)} días si no hay paralelismo humano; las issues fuera de la ruta se pueden intercalar).`);
  lines.push('');
  // sprints secuenciales de 5 días ideales (una persona), sin partir issues
  const CAP = 5;
  const sprintOf = new Map();
  const sprints = [];
  let cur = { n: 1, days: 0, ids: [] };
  for (const i of s.order) {
    const d = SIZE_DAYS[i.size] ?? 0;
    if (cur.days > 0 && cur.days + d > CAP + 1e-9) {
      sprints.push(cur);
      cur = { n: cur.n + 1, days: 0, ids: [] };
    }
    cur.days += d;
    cur.ids.push(i.id);
    sprintOf.set(i.id, cur.n);
  }
  sprints.push(cur);

  lines.push('## 2. Orden de implementación sugerido');
  lines.push('');
  lines.push('Orden topológico respetando dependencias; desempata por hito → prioridad → tamaño. Los **spikes del MVP se adelantan** en cuanto sus dependencias lo permiten (reducir riesgo pronto). Es una **guía**, no un contrato.');
  lines.push(`La columna «Sprint» agrupa secuencialmente en bloques de ${CAP} días ideales (≈ una semana a dedicación completa, una sola persona).`);
  lines.push('');
  lines.push('| # | Sprint | ID | Título | Tipo | Prio | Est. | Depende de |');
  lines.push('|---:|---:|---|---|---|---|---|---|');
  s.order.forEach((i, n) => {
    lines.push(`| ${n + 1} | S${sprintOf.get(i.id)} | ${i.id} | ${i.title.replace(/\|/g, '\\|')} | ${i.type} | ${i.priority} | ${i.size} | ${i.depends.join(', ') || '—'} |`);
  });
  lines.push('');
  lines.push('### Resumen por sprint');
  lines.push('');
  lines.push('| Sprint | Días | Issues |');
  lines.push('|---:|---:|---|');
  for (const sp of sprints) lines.push(`| S${sp.n} | ${fmt(sp.days)} | ${sp.ids.join(', ')} |`);
  lines.push('');
  lines.push('## 3. Por prioridad');
  for (const p of PRIORITIES) {
    const list = s.work.filter((i) => i.priority === p).sort((a, b) => a.id.localeCompare(b.id));
    lines.push('');
    lines.push(`### ${p} (${list.length} issues, ${fmt(s.days(list))} días)`);
    lines.push('');
    for (const i of list) lines.push(`- **${i.id}** ${i.title} — _${i.milestone}, ${i.size}_`);
  }
  lines.push('');
  lines.push('## 4. Épicas');
  lines.push('');
  for (const e of issues.filter((i) => i.type === 'epic')) {
    const kids = issues.filter((i) => i.epic === e.id);
    lines.push(`- **${e.id}** ${e.title} — ${kids.length} issues, ${fmt(s.days(kids))} días`);
  }
  lines.push('');
  lines.push('## 5. Issues que requieren acción humana');
  lines.push('');
  for (const i of s.work.filter((x) => x.labels.includes('human-required'))) lines.push(`- **${i.id}** ${i.title} (${i.milestone})`);
  lines.push('');
  void byId;
  return lines.join('\n');
}

// ───────────────────────────── render a GitHub ─────────────────────────────
function repoBlob(repo, branch, relFromIssuesDir) {
  const p = path.posix.normalize(path.posix.join('docs/issues', relFromIssuesDir));
  return `https://github.com/${repo}/blob/${branch}/${p}`;
}

function rewriteLinks(text, repo, branch) {
  return text.replace(/\]\(((?:\.\.?\/)[^)\s#]*)(#[^)]*)?\)/g, (_m, rel, hash = '') => `](${repoBlob(repo, branch, rel)}${hash})`);
}

function replaceRefs(text, map) {
  return text.replace(ID_RE, (id) => (map[id] ? `#${map[id]}` : id));
}

function renderBody(issue, ctx) {
  const { map, repo, branch, byId, children } = ctx;
  const ref = (id) => (map[id] ? `#${map[id]}` : id);
  const head = [
    `**ID:** \`${issue.id}\` · **Tipo:** ${issue.type} · **Prioridad:** ${issue.priority} · **Hito:** ${issue.milestone}` +
      (issue.size ? ` · **Estimación:** ${issue.size} (≈${fmt(SIZE_DAYS[issue.size])} d)` : ''),
  ];
  if (issue.epic) head.push(`**Épica:** ${ref(issue.epic)}`);
  const parts = [head.join('\n'), ''];
  for (const s of issue.sections) {
    parts.push(`### ${s.name}`, rewriteLinks(replaceRefs(s.text, map), repo, branch), '');
  }
  parts.push('### Dependencias');
  parts.push(issue.depends.length ? issue.depends.map((d) => `- ${ref(d)} — ${byId.get(d)?.title ?? ''}`).join('\n') : 'Ninguna.');
  parts.push('');
  if (issue.type === 'epic') {
    parts.push('### Issues hijas');
    parts.push(children.length ? children.map((c) => `- [ ] ${ref(c.id)} ${c.title}`).join('\n') : '_Sin hijas importadas._');
    parts.push('');
  } else {
    parts.push('### Estimación', `${issue.size} (≈${fmt(SIZE_DAYS[issue.size])} días ideales de desarrollo asistido por IA, incluyendo tests, PR y ronda de revisión).`, '');
  }
  parts.push('---', `_Fuente: \`${issue.file}\` · generado por \`tools/planning/github-import.mjs\`_`);
  return parts.join('\n');
}

function issueLabels(i) {
  return [`type:${i.type}`, PRIORITY_LABEL[i.priority], ...(i.size ? [`size:${i.size}`] : []), ...i.labels];
}

// ───────────────────────────── gh ─────────────────────────────
function gh(args, opts = {}) {
  const [cmd, argv] = process.env.GH_BIN ? [process.execPath, [process.env.GH_BIN, ...args]] : ['gh', args];
  return execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function importIssues(issues, opts) {
  const { repo, apply, branch, phases, delay, refresh, only } = opts;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) fail('Falta --repo OWNER/REPO');
  const [lo, hi] = phases;
  const selected = issues.filter((i) => {
    const n = Number(i.milestone.slice(1));
    return n >= lo && n <= hi;
  });
  const byId = new Map(issues.map((i) => [i.id, i]));
  const order = [...selected.filter((i) => i.type === 'epic'), ...topo(selected)];
  const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { repo, issues: {}, milestones: {} };
  if (state.repo && state.repo !== repo) fail(`El estado de importación pertenece a ${state.repo}, no a ${repo}. Borra ${path.relative(ROOT, STATE_FILE)} si es intencionado.`);
  state.repo = repo;
  const map = state.issues;

  console.log(`Repositorio: ${repo} · rama para enlaces: ${branch} · fases ${lo}-${hi} · ${selected.length} issues · modo: ${apply ? 'APLICAR (escribe en GitHub)' : 'dry-run (no escribe)'}`);

  if (apply) {
    gh(['auth', 'status']);
    gh(['repo', 'view', repo, '--json', 'name']);
  }

  // labels
  const labels = loadJson('labels.json');
  console.log(`\n[labels] ${labels.length} definidas`);
  for (const l of labels) {
    if (apply) {
      gh(['label', 'create', l.name, '--repo', repo, '--color', l.color, '--description', l.description, '--force']);
    }
  }

  // milestones
  const milestones = loadJson('milestones.json').filter((m) => {
    const n = Number(m.id.slice(1));
    return n >= lo && n <= hi;
  });
  console.log(`[milestones] ${milestones.length}`);
  if (apply) {
    const existing = JSON.parse(gh(['api', `repos/${repo}/milestones?state=all&per_page=100`]));
    for (const m of milestones) {
      const found = existing.find((e) => e.title === m.title);
      if (found) state.milestones[m.id] = found.number;
      else {
        const created = JSON.parse(gh(['api', `repos/${repo}/milestones`, '-f', `title=${m.title}`, '-f', `description=${m.description}`]));
        state.milestones[m.id] = created.number;
      }
    }
  }
  const msTitle = Object.fromEntries(loadJson('milestones.json').map((m) => [m.id, m.title]));

  // issues
  const tmp = apply ? mkdtempSync(path.join(tmpdir(), 'roomforge-issues-')) : null;
  const childrenOf = (id) => selected.filter((i) => i.epic === id);
  let created = 0, skipped = 0;
  for (const i of order) {
    const title = `[${i.id}] ${i.type === 'epic' ? 'Épica: ' : ''}${i.title.replace(/^Épica: /, '')}`;
    if (map[i.id]) {
      skipped++;
      continue;
    }
    const body = renderBody(i, { map, repo, branch, byId, children: childrenOf(i.id) });
    const lbl = issueLabels(i);
    if (!apply) {
      console.log(`  + ${i.id.padEnd(6)} ${title}  [${lbl.join(', ')}]  ${msTitle[i.milestone].split(' · ')[0]}`);
      created++;
      continue;
    }
    const file = path.join(tmp, `${i.id}.md`);
    writeFileSync(file, body, 'utf8');
    const url = gh(['issue', 'create', '--repo', repo, '--title', title, '--body-file', file, '--label', lbl.join(','), '--milestone', msTitle[i.milestone]]);
    map[i.id] = Number(url.split('/').pop());
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`  + ${i.id} → #${map[i.id]}`);
    created++;
    await sleep(delay);
  }

  // pasada 2: resolver referencias #N y listas de hijas
  if (apply) {
    state.finalized ??= {};
    const todo = order.filter((i) => map[i.id] && (!only || only.includes(i.id)) && (refresh || !state.finalized[i.id] || (i.type === 'epic' && created > 0)));
    console.log(`\n[pasada 2] actualizando referencias cruzadas en ${todo.length} issues…`);
    for (const i of todo) {
      const body = renderBody(i, { map, repo, branch, byId, children: childrenOf(i.id) });
      const file = path.join(tmp, `${i.id}.final.md`);
      writeFileSync(file, body, 'utf8');
      gh(['issue', 'edit', String(map[i.id]), '--repo', repo, '--body-file', file]);
      state.finalized[i.id] = true;
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      await sleep(Math.max(300, delay / 3));
    }
  }

  console.log(`\nResumen: ${created} ${apply ? 'creadas' : 'se crearían'}, ${skipped} ya importadas.`);
  if (!apply) console.log('Dry-run: no se ha escrito nada. Añade --apply (con autorización) para ejecutar.');
}

// ───────────────────────────── CLI ─────────────────────────────
function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const o = { _: [], apply: false, branch: 'develop', phases: [0, 10], delay: 1500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--refresh') o.refresh = true;
    else if (a === '--only') o.only = argv[++i].split(',').map((x) => x.trim());
    else if (a === '--repo') o.repo = argv[++i];
    else if (a === '--branch') o.branch = argv[++i];
    else if (a === '--delay') o.delay = Number(argv[++i]);
    else if (a === '--phases') {
      const [lo, hi] = argv[++i].split('-').map(Number);
      o.phases = [lo, Number.isNaN(hi) ? lo : hi];
    } else o._.push(a);
  }
  return o;
}

function printValidation(issues) {
  const { errors, warnings } = validate(issues);
  const s = stats(issues);
  const count = (k) => issues.reduce((a, i) => ((a[i[k]] = (a[i[k]] ?? 0) + 1), a), {});
  console.log(`Issues: ${issues.length} (${s.work.length} trabajo + ${issues.length - s.work.length} épicas)`);
  console.log('  por tipo     :', JSON.stringify(count('type')));
  console.log('  por prioridad:', JSON.stringify(count('priority')));
  console.log('  por hito     :', Object.entries(s.byMs).map(([m, l]) => `${m}=${l.length}(${fmt(s.days(l))}d)`).join('  '));
  const mvpDays = Object.entries(s.byMs).filter(([m]) => Number(m.slice(1)) <= 8).reduce((a, [, l]) => a + s.days(l), 0);
  console.log(`  esfuerzo MVP+beta (M0–M8): ${fmt(mvpDays)} días ideales · ruta crítica ${fmt(s.criticalDays)} d: ${s.critical.join(' → ')}`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  for (const e of errors) console.error(`  ✖ ${e}`);
  console.log(errors.length ? `\n✖ ${errors.length} error(es), ${warnings.length} aviso(s)` : `\n✔ Válido (${warnings.length} aviso(s))`);
  return errors.length === 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] ?? 'validate';
  const issues = loadAll();
  if (issues.length === 0) fail(`No se encontraron issues en ${ISSUES_DIR}`);

  if (cmd === 'validate') {
    process.exit(printValidation(issues) ? 0 : 1);
  } else if (cmd === 'backlog') {
    if (!printValidation(issues)) process.exit(1);
    writeFileSync(BACKLOG_FILE, backlogMarkdown(issues), 'utf8');
    console.log(`Escrito ${path.relative(ROOT, BACKLOG_FILE)}`);
  } else if (cmd === 'show') {
    const id = args._[1];
    const i = issues.find((x) => x.id === id);
    if (!i) fail(`No existe ${id}`);
    const byId = new Map(issues.map((x) => [x.id, x]));
    console.log(renderBody(i, { map: {}, repo: args.repo ?? 'OWNER/REPO', branch: args.branch, byId, children: issues.filter((x) => x.epic === i.id) }));
  } else if (cmd === 'import') {
    if (!printValidation(issues)) fail('La validación falló; no se importa.');
    await importIssues(issues, args);
  } else {
    fail(`Comando desconocido «${cmd}». Usa: validate | backlog | show <ID> | import`);
  }
}

main().catch((e) => fail(e.stderr?.toString() || e.message));

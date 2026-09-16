#!/usr/bin/env node
/**
 * render-atlas.mjs — parse the assay plugin itself and emit
 * reports/drafts/platform-atlas.html: an interactive radial map of the agent system.
 *
 * Parses: agents/*.md frontmatter (name/description/tools/model via simple regex on the
 * --- block), skills/<name>/SKILL.md (name + description), references/*.md,
 * context/*.memory.md, schemas/*.schema.json (filenames), and MCP tool names via
 * registerTool('<name>') in mcp-servers/kestrel-foundry-data/src/server.mjs. Any missing
 * directory degrades to an empty set — the atlas still renders with what exists.
 *
 * Graph: quality-lead at the center; the subagents on ring 1; around each subagent on
 * ring 2 the skills named in its body plus its memory file; ring 3 holds the shared
 * references, MCP tools and schemas. Edges: lead -> subagent (delegates), agent -> skill
 * (applies, by body mention), agent -> memory (reads), skill -> reference (cites, by
 * references/ mention in SKILL.md), agent -> MCP tool (calls, from the frontmatter tools
 * line). Skills not named in any agent body attach to quality-lead.
 *
 * The layout is a fixed-angle radial computation — no simulation, fully deterministic.
 * Pan/zoom is a tiny vanilla-JS viewBox controller (drag + wheel); clicking a node fills
 * the details panel; hovering a node highlights its connected edges. Zero external
 * requests; every interpolated string is HTML-escaped; light/dark via
 * prefers-color-scheme; print media rules included.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRAFTS_DIR = path.join(REPO_ROOT, 'reports', 'drafts');
const PLUGIN_NAME = 'assay';
const MCP_PREFIX = 'mcp__kestrel-foundry-data__';

// Every interpolated string passes through esc() before entering the markup.
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const r2 = (x) => Math.round(x * 100) / 100;

const readDirSafe = (...segs) => {
  try {
    return readdirSync(path.join(REPO_ROOT, ...segs), { withFileTypes: true });
  } catch {
    return [];
  }
};
const readSafe = (...segs) => {
  try {
    return readFileSync(path.join(REPO_ROOT, ...segs), 'utf8');
  } catch {
    return null;
  }
};

// Frontmatter: the --- block at the top of an agent/skill markdown file.
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim();
  }
  return { data, body: text.slice(m[0].length) };
}

const firstH1 = (text) => {
  const m = text.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : '';
};

// ---------- collect nodes from the plugin on disk ----------
const nodes = [];
const nodeById = new Map();
const edges = [];
const edgeSet = new Set();

function addNode(node) {
  if (nodeById.has(node.id)) return nodeById.get(node.id);
  nodes.push(node);
  nodeById.set(node.id, node);
  return node;
}
function addEdge(a, b, kind) {
  if (a === b || !nodeById.has(a) || !nodeById.has(b)) return;
  const key = `${a}|${b}`;
  if (edgeSet.has(key)) return;
  edgeSet.add(key);
  edges.push({ a, b, kind });
}

// agents/*.md — frontmatter name/description/tools/model + body for skill mentions.
const agents = [];
const agentBodies = new Map();
for (const d of readDirSafe('agents')) {
  if (!d.isFile() || !d.name.endsWith('.md')) continue;
  const text = readSafe('agents', d.name);
  if (text == null) continue;
  const { data, body } = frontmatter(text);
  const name = data.name || d.name.replace(/\.md$/, '');
  agents.push(
    addNode({
      id: `agent:${name}`,
      kind: 'agent',
      name,
      description: data.description || '',
      model: data.model || '',
      tools: data.tools ? data.tools.split(',').map((t) => t.trim()).filter(Boolean) : [],
      file: `agents/${d.name}`,
    }),
  );
  agentBodies.set(name, body);
}
agents.sort((a, b) => a.name.localeCompare(b.name));

// skills/<name>/SKILL.md — name + description; the full text is scanned for references/ mentions.
const skills = [];
const skillRefs = new Map();
for (const d of readDirSafe('skills')) {
  if (!d.isDirectory()) continue;
  const text = readSafe('skills', d.name, 'SKILL.md');
  if (text == null) continue;
  const { data } = frontmatter(text);
  const name = data.name || d.name;
  skills.push(
    addNode({ id: `skill:${name}`, kind: 'skill', name, description: data.description || '', file: `skills/${d.name}/SKILL.md` }),
  );
  skillRefs.set(`skill:${name}`, [...new Set([...text.matchAll(/references\/([\w.-]+\.md)/g)].map((m) => m[1]))].sort());
}
skills.sort((a, b) => a.name.localeCompare(b.name));

// references/*.md
for (const d of readDirSafe('references')) {
  if (!d.isFile() || !d.name.endsWith('.md')) continue;
  const text = readSafe('references', d.name) ?? '';
  addNode({ id: `ref:${d.name}`, kind: 'reference', name: d.name, description: firstH1(text), file: `references/${d.name}` });
}

// context/*.memory.md — one memory file per agent, matched by file name.
const memories = [];
for (const d of readDirSafe('context')) {
  if (!d.isFile() || !d.name.endsWith('.memory.md')) continue;
  const agentName = d.name.replace(/\.memory\.md$/, '');
  memories.push(
    addNode({
      id: `mem:${agentName}`,
      kind: 'memory',
      name: d.name,
      description: `Session memory read at the start of every ${agentName} session`,
      file: `context/${d.name}`,
      agent: agentName,
    }),
  );
}

// schemas/*.schema.json (filenames — the output contracts).
for (const d of readDirSafe('schemas')) {
  if (!d.isFile() || !d.name.endsWith('.schema.json')) continue;
  addNode({ id: `schema:${d.name}`, kind: 'schema', name: d.name, description: 'JSON Schema contract (draft 2020-12)', file: `schemas/${d.name}` });
}

// MCP tools — registerTool('<name>') in the read-only data-boundary server.
const serverSrc = readSafe('mcp-servers', 'kestrel-foundry-data', 'src', 'server.mjs') ?? '';
const mcpTools = [...new Set([...serverSrc.matchAll(/registerTool\('([a-z_]+)'/g)].map((m) => m[1]))].sort();
for (const t of mcpTools) {
  addNode({
    id: `mcp:${t}`,
    kind: 'mcp',
    name: t,
    description: `Read-only MCP tool, exposed to agents as ${MCP_PREFIX}${t}`,
    file: 'mcp-servers/kestrel-foundry-data/src/server.mjs',
  });
}

// ---------- wire the graph ----------
const center = nodeById.get('agent:quality-lead') ?? agents[0] ?? null;
if (center) center.kind = 'lead';
const subs = center ? agents.filter((a) => a !== center) : agents.slice();
if (center) for (const s of subs) addEdge(center.id, s.id, 'delegates');

// agent -> skill, by skill-name mention in the agent body. Unclaimed skills attach to the lead.
const claimed = new Set();
for (const a of agents) {
  const body = agentBodies.get(a.name) ?? '';
  a.children = [];
  for (const s of skills) {
    if (body.includes(s.name)) {
      addEdge(a.id, s.id, 'applies');
      claimed.add(s.id);
      a.children.push(s);
    }
  }
}
if (center) {
  for (const s of skills.filter((s2) => !claimed.has(s2.id))) {
    addEdge(center.id, s.id, 'applies');
    center.children.push(s);
  }
}

// agent -> memory, matched by file name; orphaned memories attach to the lead.
for (const m of memories) {
  const owner = nodeById.get(`agent:${m.agent}`) ?? center;
  if (owner) {
    addEdge(owner.id, m.id, 'reads');
    owner.children.push(m);
  }
}

// skill -> reference, by references/ mention inside SKILL.md.
for (const s of skills) {
  for (const r of skillRefs.get(s.id) ?? []) {
    if (nodeById.has(`ref:${r}`)) addEdge(s.id, `ref:${r}`, 'cites');
  }
}

// agent -> MCP tool, from the frontmatter tools line.
for (const a of agents) {
  for (const t of a.tools) {
    if (t.startsWith(MCP_PREFIX)) {
      const tool = t.slice(MCP_PREFIX.length);
      if (nodeById.has(`mcp:${tool}`)) addEdge(a.id, `mcp:${tool}`, 'calls');
    }
  }
}

// ---------- deterministic radial layout (fixed angles, no simulation) ----------
const rad = (deg) => (deg * Math.PI) / 180;
function place(node, angleDeg, radius) {
  node.x = r2(Math.cos(rad(angleDeg)) * radius);
  node.y = r2(Math.sin(rad(angleDeg)) * radius);
}
const R1 = 280; // subagents
const R2 = 560; // skills + memory around each subagent
const RC = 400; // items attached to the lead itself
const RING3 = { reference: 730, mcp: 825, schema: 920 }; // shared resources
if (center) place(center, 0, 0);
subs.forEach((s, i) => place(s, -90 + (i * 360) / Math.max(1, subs.length), R1));
for (const a of agents) {
  const items = a.children ?? [];
  if (a === center) {
    items.forEach((n, k) => place(n, 30 + k * 26, RC));
  } else {
    const base = -90 + (subs.indexOf(a) * 360) / Math.max(1, subs.length);
    const step = 22;
    items.forEach((n, k) => place(n, base + (k - (items.length - 1) / 2) * step, R2));
  }
}
for (const kind of Object.keys(RING3)) {
  const group = nodes.filter((n) => n.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
  group.forEach((n, k) => place(n, -90 + (k * 360) / Math.max(1, group.length), RING3[kind]));
}
// safety net: anything left unplaced lands on an outer ring, evenly spaced.
const stray = nodes.filter((n) => n.x == null);
stray.forEach((n, k) => place(n, -90 + (k * 360) / Math.max(1, stray.length), 1015));

// ---------- render the SVG graph ----------
const RADII = { lead: 30, agent: 21, skill: 14, memory: 11, reference: 11, mcp: 11, schema: 11 };
const shortLabel = (n) => n.name.replace(/\.memory\.md$/, '').replace(/\.schema\.json$/, '').replace(/\.md$/, '');

const edgeEls = edges
  .map((e) => {
    const a = nodeById.get(e.a);
    const b = nodeById.get(e.b);
    return `          <line class="edge e-${e.kind}" data-a="${esc(e.a)}" data-b="${esc(e.b)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  })
  .join('\n');

const nodeEls = nodes
  .map((n) => {
    const rr = RADII[n.kind] ?? 11;
    return `          <g class="node k-${n.kind}" data-id="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(`${n.kind}: ${n.name}`)}">
            <circle cx="${n.x}" cy="${n.y}" r="${rr}"/>
            <text x="${n.x}" y="${r2(n.y + rr + 15)}">${esc(shortLabel(n))}</text>
            <title>${esc(`${n.name} (${n.kind})`)}</title>
          </g>`;
  })
  .join('\n');

// Panel data for the client script. JSON is made script-safe by escaping "<".
const panel = {};
for (const n of nodes) {
  panel[n.id] = { name: n.name, kind: n.kind, description: n.description, file: n.file, model: n.model || '', tools: n.tools || [] };
}
const adj = {};
for (const e of edges) {
  (adj[e.a] = adj[e.a] || []).push(e.b);
  (adj[e.b] = adj[e.b] || []).push(e.a);
}
const graphJson = JSON.stringify({ nodes: panel, adj }).replace(/</g, '\\u003c');

// initial viewBox: square covering every placed node plus label margin
const ext = Math.max(300, ...nodes.map((n) => Math.max(Math.abs(n.x), Math.abs(n.y)))) + 140;
const VB0 = { x: -ext, y: -ext, w: 2 * ext, h: 2 * ext };

const CSS = `
:root {
  --bg: #f4f6f9; --panel: #ffffff; --ink: #1c2530; --muted: #5b6b7c; --line: #dde3ea; --line2: #c3cdd9;
  --accent: #1f6feb;
  --c-lead: #7c3aed; --c-agent: #1f6feb; --c-skill: #0e9488; --c-memory: #d97706;
  --c-reference: #64748b; --c-mcp: #b3261e; --c-schema: #75871f;
  --warn: #8a5a00; --warn-bg: #fff3d0;
  --mono: ui-monospace, "Cascadia Mono", "SF Mono", Consolas, "Liberation Mono", monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #10151b; --panel: #171e27; --ink: #e3e9f0; --muted: #96a3b3; --line: #2b3542; --line2: #3a4655;
    --accent: #6ea8fe;
    --c-lead: #a78bfa; --c-agent: #6ea8fe; --c-skill: #2dd4bf; --c-memory: #f2b23e;
    --c-reference: #94a3b8; --c-mcp: #ff8a80; --c-schema: #b5cc5c;
    --warn: #ffcf5c; --warn-bg: #36300f;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
.mono { font-family: var(--mono); font-size: 0.92em; }
.wrap { max-width: 1500px; margin: 0 auto; padding: 24px 22px 40px; }
.mast { border-bottom: 1px solid var(--line); padding-bottom: 16px; margin-bottom: 14px; }
.mast-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.brand { font-weight: 700; letter-spacing: 0.02em; color: var(--muted); }
.badge {
  margin-left: auto; background: var(--warn-bg); color: var(--warn);
  border: 1px solid currentColor; border-radius: 6px;
  font-size: 11px; font-weight: 800; letter-spacing: 0.1em; padding: 4px 9px;
}
h1 { font-size: 25px; line-height: 1.25; margin: 0 0 6px; }
.h1-sub { color: var(--muted); font-weight: 500; }
.meta { margin: 0; color: var(--muted); font-size: 13px; }
`;

const CSS2 = `
.legend { display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; margin: 0 0 14px; color: var(--muted); font-size: 12.5px; }
.lg { display: inline-flex; align-items: center; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
.dot.k-lead { background: var(--c-lead); }
.dot.k-agent { background: var(--c-agent); }
.dot.k-skill { background: var(--c-skill); }
.dot.k-memory { background: var(--c-memory); }
.dot.k-reference { background: var(--c-reference); }
.dot.k-mcp { background: var(--c-mcp); }
.dot.k-schema { background: var(--c-schema); }
#reset {
  margin-left: auto; background: var(--panel); color: var(--ink);
  border: 1px solid var(--line); border-radius: 8px; padding: 5px 12px;
  font: inherit; font-size: 12.5px; cursor: pointer;
}
#reset:hover { border-color: var(--accent); color: var(--accent); }
.stage { display: flex; gap: 16px; align-items: stretch; }
.map-wrap { flex: 1; min-width: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
#map { display: block; width: 100%; height: 74vh; cursor: grab; touch-action: none; }
#map:active { cursor: grabbing; }
.edge { stroke: var(--line2); stroke-width: 1.1; transition: opacity 0.12s, stroke 0.12s; }
.edge.e-cites { stroke-dasharray: 2 4; }
.edge.e-calls { stroke-dasharray: 7 4; }
.node { cursor: pointer; outline: none; transition: opacity 0.12s; }
.node circle { stroke: var(--panel); stroke-width: 2; }
.node text {
  fill: var(--ink); font-size: 12px; text-anchor: middle; pointer-events: none;
  paint-order: stroke; stroke: var(--panel); stroke-width: 3px;
}
.node:focus circle, .node.lit circle { stroke: var(--accent); stroke-width: 3; }
.k-lead circle { fill: var(--c-lead); }
.k-agent circle { fill: var(--c-agent); }
.k-skill circle { fill: var(--c-skill); }
.k-memory circle { fill: var(--c-memory); }
.k-reference circle { fill: var(--c-reference); }
.k-mcp circle { fill: var(--c-mcp); }
.k-schema circle { fill: var(--c-schema); }
#map.hovering .node { opacity: 0.32; }
#map.hovering .node.lit { opacity: 1; }
#map.hovering .edge { opacity: 0.16; }
#map.hovering .edge.lit { opacity: 1; stroke: var(--accent); stroke-width: 2.4; }
.details {
  width: 310px; flex: none; background: var(--panel); border: 1px solid var(--line);
  border-radius: 12px; padding: 14px 16px; font-size: 13.5px; overflow-wrap: anywhere;
}
.details h3 { margin: 6px 0 6px; font-size: 16px; }
.details h4 { margin: 14px 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.details .d-kind { display: inline-block; font-size: 10.5px; font-weight: 800; letter-spacing: 0.09em; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; }
.details .d-desc { margin: 6px 0; }
.details .d-mono { font-family: var(--mono); font-size: 12px; color: var(--muted); margin: 6px 0; }
.details .d-list { margin: 4px 0; padding-left: 18px; }
.details .d-list li { margin: 2px 0; font-family: var(--mono); font-size: 12px; }
.hint { color: var(--muted); }
.foot { border-top: 1px solid var(--line); margin-top: 20px; padding-top: 12px; color: var(--muted); font-size: 12.5px; }
.foot p { margin: 4px 0; }
@media (max-width: 900px) {
  .stage { flex-direction: column; }
  .details { width: auto; }
  #map { height: 62vh; }
}
@media print {
  :root {
    --bg: #ffffff; --panel: #ffffff; --ink: #111418; --muted: #4a5560; --line: #b9c2cc; --line2: #9aa7b4;
    --accent: #1f6feb;
    --c-lead: #7c3aed; --c-agent: #1f6feb; --c-skill: #0e9488; --c-memory: #b45309;
    --c-reference: #64748b; --c-mcp: #b3261e; --c-schema: #75871f;
    --warn: #8a5a00; --warn-bg: #f7e8bf;
    color-scheme: light;
  }
  body { background: #fff; font-size: 12px; }
  .wrap { max-width: none; padding: 0; }
  .stage { display: block; }
  #map { height: auto; cursor: default; }
  #reset { display: none; }
  .details { width: auto; margin-top: 12px; }
  .node circle, .badge, .dot { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
`;

// Client-side controller: viewBox pan/zoom, click-to-inspect, hover edge highlight.
// Written with string concatenation only — no backticks, no ${} — so it embeds cleanly.
const CLIENT_JS = `
'use strict';
var GRAPH = ${graphJson};
var svg = document.getElementById('map');
var VB0 = { x: ${VB0.x}, y: ${VB0.y}, w: ${VB0.w}, h: ${VB0.h} };
var vb = { x: VB0.x, y: VB0.y, w: VB0.w, h: VB0.h };
function apply() { svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h); }
var drag = null;
var moved = false;
svg.addEventListener('pointerdown', function (e) {
  drag = { cx: e.clientX, cy: e.clientY, vx: vb.x, vy: vb.y };
  moved = false;
  svg.setPointerCapture(e.pointerId);
});
svg.addEventListener('pointermove', function (e) {
  if (!drag) return;
  var rect = svg.getBoundingClientRect();
  var dx = (e.clientX - drag.cx) * (vb.w / rect.width);
  var dy = (e.clientY - drag.cy) * (vb.h / rect.height);
  if (Math.abs(dx) + Math.abs(dy) > 0.5) moved = true;
  vb.x = drag.vx - dx;
  vb.y = drag.vy - dy;
  apply();
});
svg.addEventListener('pointerup', function () { drag = null; });
svg.addEventListener('pointercancel', function () { drag = null; });
svg.addEventListener('wheel', function (e) {
  e.preventDefault();
  var rect = svg.getBoundingClientRect();
  var fx = (e.clientX - rect.left) / rect.width;
  var fy = (e.clientY - rect.top) / rect.height;
  var factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
  var nw = Math.min(9000, Math.max(320, vb.w * factor));
  var nh = Math.min(9000, Math.max(320, vb.h * factor));
  vb.x += (vb.w - nw) * fx;
  vb.y += (vb.h - nh) * fy;
  vb.w = nw;
  vb.h = nh;
  apply();
}, { passive: false });
document.getElementById('reset').addEventListener('click', function () {
  vb = { x: VB0.x, y: VB0.y, w: VB0.w, h: VB0.h };
  apply();
});
var edgeEls = Array.prototype.slice.call(svg.querySelectorAll('.edge'));
var nodeEls = Array.prototype.slice.call(svg.querySelectorAll('.node'));
function setLit(id, on) {
  var i;
  for (i = 0; i < edgeEls.length; i++) {
    var a = edgeEls[i].getAttribute('data-a');
    var b = edgeEls[i].getAttribute('data-b');
    if (a === id || b === id) edgeEls[i].classList.toggle('lit', on);
  }
  var nbs = GRAPH.adj[id] || [];
  for (i = 0; i < nodeEls.length; i++) {
    var nid = nodeEls[i].getAttribute('data-id');
    if (nid === id || nbs.indexOf(nid) !== -1) nodeEls[i].classList.toggle('lit', on);
  }
  svg.classList.toggle('hovering', on);
}
function show(id) {
  var n = GRAPH.nodes[id];
  if (!n) return;
  var panel = document.getElementById('details');
  while (panel.firstChild) panel.removeChild(panel.firstChild);
  function add(tag, text, cls) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    el.appendChild(document.createTextNode(text));
    panel.appendChild(el);
    return el;
  }
  add('span', n.kind.toUpperCase(), 'd-kind');
  add('h3', n.name);
  if (n.description) add('p', n.description, 'd-desc');
  if (n.model) add('p', 'model: ' + n.model, 'd-mono');
  if (n.tools && n.tools.length) {
    add('h4', 'tools (' + n.tools.length + ')');
    var ul = document.createElement('ul');
    ul.className = 'd-list';
    for (var i = 0; i < n.tools.length; i++) {
      var li = document.createElement('li');
      li.appendChild(document.createTextNode(n.tools[i]));
      ul.appendChild(li);
    }
    panel.appendChild(ul);
  }
  add('p', n.file, 'd-mono');
  var nbs = GRAPH.adj[id] || [];
  add('h4', 'connections (' + nbs.length + ')');
  var ul2 = document.createElement('ul');
  ul2.className = 'd-list';
  for (var j = 0; j < nbs.length; j++) {
    var li2 = document.createElement('li');
    var other = GRAPH.nodes[nbs[j]];
    li2.appendChild(document.createTextNode(other ? other.name : nbs[j]));
    ul2.appendChild(li2);
  }
  panel.appendChild(ul2);
}
for (var i = 0; i < nodeEls.length; i++) {
  (function (g) {
    var id = g.getAttribute('data-id');
    g.addEventListener('mouseover', function () { setLit(id, true); });
    g.addEventListener('mouseout', function () { setLit(id, false); });
    g.addEventListener('focus', function () { setLit(id, true); });
    g.addEventListener('blur', function () { setLit(id, false); });
    g.addEventListener('click', function () { if (!moved) show(id); });
    g.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(id); }
    });
  })(nodeEls[i]);
}
`;

// ---------- page assembly ----------
function renderAtlas() {
  const vbAttr = `${VB0.x} ${VB0.y} ${VB0.w} ${VB0.h}`;
  const legend = [
    ['lead', 'lead agent'],
    ['agent', 'subagent'],
    ['skill', 'skill'],
    ['memory', 'memory'],
    ['reference', 'reference'],
    ['mcp', 'MCP tool'],
    ['schema', 'schema'],
  ]
    .map(([k, label]) => `<span class="lg"><span class="dot k-${k}"></span>${esc(label)}</span>`)
    .join('\n    ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Platform Atlas — ${esc(PLUGIN_NAME)}</title>
<style>${CSS}${CSS2}</style>
</head>
<body>
<div class="wrap">
  <header class="mast">
    <div class="mast-row">
      <span class="brand mono">${esc(PLUGIN_NAME)}</span>
      <span class="badge">SYNTHETIC DEMO DATA</span>
    </div>
    <h1>Platform Atlas <span class="h1-sub">— agent system map</span></h1>
    <p class="meta">${nodes.length} nodes · ${edges.length} edges · parsed from <span class="mono">agents/</span>, <span class="mono">skills/</span>, <span class="mono">references/</span>, <span class="mono">context/</span>, <span class="mono">schemas/</span> and <span class="mono">mcp-servers/</span> · fixed-angle radial layout, no simulation</p>
  </header>
  <div class="legend">
    ${legend}
    <span class="lg">edges: delegates · applies · reads · cites (dotted) · calls (dashed)</span>
    <span class="lg">skills not named in any agent body attach to the lead</span>
    <button id="reset" type="button">Reset view</button>
  </div>
  <div class="stage">
    <div class="map-wrap">
      <svg id="map" viewBox="${vbAttr}" preserveAspectRatio="xMidYMid meet" role="application" aria-label="Interactive radial map of the agent system">
        <g class="edges">
${edgeEls}
        </g>
        <g class="nodes">
${nodeEls}
        </g>
      </svg>
    </div>
    <aside id="details" class="details">
      <p class="hint">Click a node for details. Drag to pan, scroll to zoom. Hover (or focus) a node to light its connections.</p>
    </aside>
  </div>
  <footer class="foot">
    <p>Generated by <span class="mono">scripts/render-atlas.mjs</span> · plugin <span class="mono">${esc(PLUGIN_NAME)}</span> · parsed from the plugin sources on disk, no wall clock</p>
    <p>Synthetic demo data — not for operational use.</p>
  </footer>
</div>
<script>${CLIENT_JS}</script>
</body>
</html>
`;
}

// ---------- main ----------
function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('usage: node scripts/render-atlas.mjs   parse the plugin, write reports/drafts/platform-atlas.html');
    return;
  }
  const html = renderAtlas();
  mkdirSync(DRAFTS_DIR, { recursive: true });
  const outPath = path.join(DRAFTS_DIR, 'platform-atlas.html');
  writeFileSync(outPath, html, 'utf8');
  const byKind = edges.reduce((acc, e) => ((acc[e.kind] = (acc[e.kind] || 0) + 1), acc), {});
  const breakdown = Object.keys(byKind)
    .sort()
    .map((k) => `${k}: ${byKind[k]}`)
    .join(', ');
  console.log(`platform atlas: ${nodes.length} nodes, ${edges.length} edges (${breakdown})`);
  console.log(`wrote ${path.relative(REPO_ROOT, outPath)}`);
}

main();


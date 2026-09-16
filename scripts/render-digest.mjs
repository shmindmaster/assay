#!/usr/bin/env node
/**
 * render-digest.mjs — render the weekly quality digest as a self-contained HTML report.
 *
 * Modes:
 *   node scripts/render-digest.mjs [--from-data]
 *       Compute the digest-input object deterministically from data/exports + data/index.json
 *       (anchor = index.anchor_date; latest week = last week_ending in the scrap export; NCR
 *       ageing measured from the anchor; repeat offenders = same part+defect+cause with >= 3
 *       NCRs dated within the 90 days before the anchor; cert gaps = cert-manifests required
 *       records absent from the index; audit gaps = audit-scope evidence areas absent from the
 *       index, using the same file-vs-directory presence rule as the MCP server). Writes
 *       reports/drafts/digest-input-<week_ending>.json, then renders the HTML.
 *   node scripts/render-digest.mjs --input <file.json>
 *       Validate <file.json> against schemas/digest-input.schema.json (ajv, draft 2020-12;
 *       exit 1 with readable errors on validation failure), then render the HTML.
 *
 * Output: reports/drafts/quality-digest-<week_ending>.html — zero external requests, inline
 * CSS + inline SVG only, light/dark via prefers-color-scheme, print-friendly, every
 * interpolated string HTML-escaped. Fully deterministic: no wall-clock reads anywhere.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRAFTS_DIR = path.join(REPO_ROOT, 'reports', 'drafts');
const PLUGIN_NAME = 'assay';

const loadJson = (relPath) => JSON.parse(readFileSync(path.join(REPO_ROOT, ...relPath.split('/')), 'utf8'));

// Cause-code vocabulary, verbatim from references/02-cause-codes.md (CAUSE_CODES in
// scripts/generate-data.mjs). scrap-export.csv carries codes only, so text comes from here.
const CAUSE_TEXT = {
  P01: 'Mold compaction below specification',
  P02: 'Gating/risering design inadequate for section thickness',
  P03: 'Sand moisture above control limit',
  M01: 'Melt temperature excursion during pour',
  M02: 'Chemistry off-specification',
  M03: 'Hydrogen porosity — degassing cycle incomplete',
  C01: 'Core shift during mold close',
  C02: 'Core vent blockage',
  D01: 'Machining damage at finishing',
  D02: 'Fixture wear — dimensional drift',
  H01: 'Heat-treat distortion',
  S01: 'Handling damage post-cast',
};

const AGE_BUCKETS = [
  { label: '0-7 days', test: (a) => a <= 7 },
  { label: '8-14 days', test: (a) => a >= 8 && a <= 14 },
  { label: '15-30 days', test: (a) => a >= 15 && a <= 30 },
  { label: '>30 days', test: (a) => a > 30 },
];

// ---------- deterministic calendar + formatting helpers ----------
const DAY_MS = 86400000;
const dayShift = (iso, delta) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (from, to) =>
  Math.round((new Date(to + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / DAY_MS);

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

// Every interpolated string passes through esc() before entering the markup.
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const commas = (digits) => String(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const usd = (n) => '$' + commas(Math.round(n));
const usdExact = (n) => {
  if (!Number.isFinite(n)) return '$0';
  const neg = n < 0 ? '-' : '';
  const [intPart, fracPart] = Math.abs(n).toFixed(2).split('.');
  return fracPart === '00' ? `${neg}$${commas(intPart)}` : `${neg}$${commas(intPart)}.${fracPart}`;
};
const usdCompact = (v) => (v === 0 ? '$0' : v % 1000 === 0 ? `$${v / 1000}k` : `$${(v / 1000).toFixed(1)}k`);
const signedPct = (p) => (p > 0 ? '+' : '') + p.toFixed(1) + '%';
const varCls = (p) => (p > 0 ? 'pos' : p < 0 ? 'neg' : '');

// ---------- schema validation (same ajv setup as scripts/validate-schemas.mjs) ----------
function makeValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  // ISO calendar date, round-trip checked; registered locally so the schema can use
  // "format": "date" without the ajv-formats package.
  ajv.addFormat('date', {
    type: 'string',
    validate: (s) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
      const d = new Date(`${s}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    },
  });
  return ajv.compile(loadJson('schemas/digest-input.schema.json'));
}

const formatErrors = (errors) =>
  (errors ?? [])
    .map((e) => `  ${e.instancePath || '/'} [${e.keyword}] ${e.message} ${JSON.stringify(e.params)}`)
    .join('\n');

// ---------- data loading ----------
function loadScrapRows() {
  const lines = readFileSync(path.join(REPO_ROOT, 'data', 'exports', 'erp', 'scrap-export.csv'), 'utf8')
    // Git may materialize this tracked fixture with CRLF on Windows. Normalize it
    // before parsing so the final header/value of each CSV row is not polluted.
    .replace(/\r\n/g, '\n')
    .trim()
    .split('\n');
  const head = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const row = Object.fromEntries(line.split(',').map((c, i) => [head[i], c]));
    row.cost_usd = Number(row.cost_usd);
    return row;
  });
}

// ---------- deterministic digest computation (--from-data) ----------
function computeDigest() {
  const index = loadJson('data/index.json');
  const ncrs = loadJson('data/exports/qms/ncr-export.json').ncrs;
  const manifests = loadJson('data/exports/quality/cert-manifests.json').manifests;
  const auditScope = loadJson('data/exports/quality/audit-scope.json');
  const scrap = loadScrapRows();

  const anchor = index.anchor_date;
  const onFile = (relPath) => Object.prototype.hasOwnProperty.call(index.documents, relPath);

  const weeks = [...new Set(scrap.map((r) => r.week_ending))].sort();
  const week = weeks[weeks.length - 1];
  const trailing4 = weeks.slice(-5, -1); // the 4 weeks before the current one
  const weekCost = (w, cause) =>
    scrap.filter((r) => r.week_ending === w && (!cause || r.cause_code === cause)).reduce((s, r) => s + r.cost_usd, 0);
  const totalWeek = weekCost(week);
  const t4Avg = trailing4.length ? trailing4.reduce((s, w) => s + weekCost(w), 0) / trailing4.length : 0;

  const causes = [...new Set(scrap.map((r) => r.cause_code))].sort();
  const scrapByCause = causes
    .map((c) => {
      const wk = weekCost(week, c);
      const avg = trailing4.length ? trailing4.reduce((s, w) => s + weekCost(w, c), 0) / trailing4.length : 0;
      return {
        cause_code: c,
        cause_text: CAUSE_TEXT[c] ?? 'Undetermined',
        cell: scrap.find((r) => r.cause_code === c).cell,
        week_cost_usd: wk,
        trailing4_avg_usd: r2(avg),
        variance_pct: avg > 0 ? r1(((wk - avg) / avg) * 100) : 0,
      };
    })
    .sort((a, b) => b.week_cost_usd - a.week_cost_usd || a.cause_code.localeCompare(b.cause_code));

  const topMovers = scrapByCause
    .filter((r) => r.variance_pct > 0)
    .sort((a, b) => b.variance_pct - a.variance_pct || a.cause_code.localeCompare(b.cause_code))
    .slice(0, 3)
    .map((r, i) => {
      const series = weeks.map((w) => weekCost(w, r.cause_code));
      let streak = 0;
      for (let s = series.length - 1; s > 0 && series[s] > series[s - 1]; s--) streak++;
      const topNote = i === 0 && r.week_cost_usd > 5000 ? 'Top mover — ' : '';
      const streakNote =
        weeks.length > 1 && streak >= weeks.length - 1
          ? `rising every week of the ${weeks.length}-week window (${usd(series[0])} → ${usd(series[series.length - 1])}); `
          : streak >= 2
            ? `up ${streak} consecutive weeks; `
            : '';
      return {
        cause_code: r.cause_code,
        cell: r.cell,
        variance_pct: r.variance_pct,
        note: `${topNote}${streakNote}${usd(r.week_cost_usd)} this week vs ${usdExact(r.trailing4_avg_usd)} trailing-4 avg`,
      };
    });

  const open = ncrs.filter((n) => n.status === 'open');
  const buckets = AGE_BUCKETS.map((b) => ({
    label: b.label,
    count: open.filter((n) => b.test(daysBetween(n.date, anchor))).length,
  }));
  const oldestOpen = open
    .map((n) => ({ ncr_id: n.ncr_id, age_days: daysBetween(n.date, anchor), part_number: n.part_number, severity: n.severity }))
    .sort((a, b) => b.age_days - a.age_days || a.ncr_id.localeCompare(b.ncr_id))
    .slice(0, 5);

  const since = dayShift(anchor, -90);
  const offenderMap = new Map();
  for (const n of ncrs.filter((x) => x.date >= since)) {
    const key = `${n.part_number}|${n.defect_type}|${n.cause_code}`;
    if (!offenderMap.has(key)) offenderMap.set(key, []);
    offenderMap.get(key).push(n.ncr_id);
  }
  const repeatOffenders = [...offenderMap.entries()]
    .map(([key, ids]) => {
      const [part_number, defect_type, cause_code] = key.split('|');
      return { part_number, defect_type, cause_code, occurrences_90d: ids.length, ncr_ids: ids.slice().sort() };
    })
    .filter((g) => g.occurrences_90d >= 3)
    .sort((a, b) => b.occurrences_90d - a.occurrences_90d || a.part_number.localeCompare(b.part_number));

  const certGaps = Object.keys(manifests)
    .sort()
    .map((po) => {
      const m = manifests[po];
      return {
        po,
        customer: m.customer,
        part: m.part,
        missing_records: m.required.filter((r) => !onFile(r.expected_path)).map((r) => r.type),
      };
    })
    .filter((g) => g.missing_records.length > 0);

  const areas = auditScope.evidence_areas.map((e) => {
    const isDoc = /\.(md|json)$/.test(e.expected_path);
    const present = isDoc
      ? onFile(e.expected_path)
      : Object.keys(index.documents).some((p) => p.startsWith(e.expected_path + '/'));
    return { id: e.id, area: e.area, present };
  });
  const auditGaps = areas.filter((a) => !a.present).map(({ id, area }) => ({ id, area }));

  return {
    report_type: 'quality-digest',
    week_ending: week,
    generated_at: `${anchor}T00:00:00Z`,
    kpis: {
      open_ncrs: open.length,
      new_ncrs_this_week: ncrs.filter((n) => n.date > dayShift(week, -7) && n.date <= week).length,
      scrap_cost_week_usd: totalWeek,
      scrap_cost_trailing4_avg_usd: r2(t4Avg),
      scrap_variance_pct: t4Avg > 0 ? r1(((totalWeek - t4Avg) / t4Avg) * 100) : 0,
      cert_packages_incomplete: certGaps.length,
      audit_gaps_open: auditGaps.length,
    },
    scrap_by_cause: scrapByCause,
    top_movers: topMovers,
    ncr_ageing: { buckets, oldest_open: oldestOpen },
    repeat_offenders: repeatOffenders,
    cert_gaps: certGaps,
    audit_readiness: {
      audit_id: auditScope.audit_id,
      window: auditScope.window,
      areas_total: areas.length,
      areas_present: areas.filter((a) => a.present).length,
      gaps: auditGaps,
    },
  };
}

// ---------- Pareto chart (pure SVG; values surface on hover via <title>) ----------
function paretoSvg(rows) {
  const W = 980;
  const H = 430;
  const L = 64;
  const R = 58;
  const T = 30;
  const B = 78;
  const pw = W - L - R;
  const ph = H - T - B;
  const f = (x) => Math.round(x * 100) / 100;
  const total = rows.reduce((s, r) => s + r.week_cost_usd, 0);
  const maxV = Math.max(1, ...rows.map((r) => Math.max(r.week_cost_usd, r.trailing4_avg_usd)));
  const mag = 10 ** Math.floor(Math.log10(maxV / 4));
  const step = Math.ceil(maxV / 4 / mag) * mag; // nice 1-9 x 10^k gridline step
  const top = step * 4;
  const y = (v) => f(T + ph * (1 - v / top));
  const slot = pw / rows.length;
  const bw = f(Math.min(slot * 0.58, 66));
  const out = [];
  for (let g = 0; g <= 4; g++) {
    const gy = y(step * g);
    out.push(`<line class="grid" x1="${L}" y1="${gy}" x2="${W - R}" y2="${gy}"/>`);
    out.push(`<text class="axl" x="${L - 8}" y="${f(gy + 4)}" text-anchor="end">${esc(usdCompact(step * g))}</text>`);
    out.push(`<text class="axl" x="${W - R + 8}" y="${f(gy + 4)}">${g * 25}%</text>`);
  }
  out.push(`<line class="axis" x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}"/>`);
  out.push(`<line class="axis" x1="${L}" y1="${T + ph}" x2="${W - R}" y2="${T + ph}"/>`);
  out.push(`<line class="axis" x1="${W - R}" y1="${T}" x2="${W - R}" y2="${T + ph}"/>`);
  out.push(`<text class="axt" transform="translate(16 ${f(T + ph / 2)}) rotate(-90)" text-anchor="middle">Scrap cost (USD)</text>`);
  out.push(`<text class="axt" transform="translate(${W - 12} ${f(T + ph / 2)}) rotate(90)" text-anchor="middle">Cumulative %</text>`);
  let cum = 0;
  const dots = [];
  rows.forEach((row, i) => {
    const x = f(L + i * slot + (slot - bw) / 2);
    const cx = f(L + i * slot + slot / 2);
    const mover = row.variance_pct > 0 && row.week_cost_usd > 5000;
    const barTitle = `${row.cause_code} — ${row.cell}\nWeek ${usd(row.week_cost_usd)}\nTrailing-4 avg ${usdExact(row.trailing4_avg_usd)}\nVariance ${signedPct(row.variance_pct)}`;
    const barY = y(row.week_cost_usd);
    out.push(
      `<rect class="bar${mover ? ' mover' : ''}" x="${x}" y="${barY}" width="${bw}" height="${f(T + ph - barY)}"><title>${esc(barTitle)}</title></rect>`,
    );
    const ty = y(row.trailing4_avg_usd);
    out.push(
      `<line class="tick" x1="${f(x - 5)}" y1="${ty}" x2="${f(x + bw + 5)}" y2="${ty}"><title>${esc(`${row.cause_code} trailing-4 weekly avg ${usdExact(row.trailing4_avg_usd)}`)}</title></line>`,
    );
    cum += row.week_cost_usd;
    const cp = total > 0 ? (cum / total) * 100 : 0;
    dots.push({ cx, cy: f(T + ph * (1 - cp / 100)), label: `${row.cause_code} cumulative ${cp.toFixed(1)}% of week total` });
    out.push(`<text class="xlbl" transform="translate(${cx} ${T + ph + 16}) rotate(-35)" text-anchor="end">${esc(row.cause_code)}</text>`);
  });
  out.push(`<polyline class="cum" points="${dots.map((d) => `${d.cx},${d.cy}`).join(' ')}"/>`);
  for (const d of dots) {
    out.push(`<circle class="cumdot" cx="${d.cx}" cy="${d.cy}" r="3.5"><title>${esc(d.label)}</title></circle>`);
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pareto chart of scrap cost by cause: bars for the current week, tick marks for the trailing-4-week average, and a cumulative percentage line">${out.join('')}</svg>`;
}

// ---------- section builders (all interpolated values pass esc()) ----------
function kpiCards(k, week, auditId) {
  const arrow = k.scrap_variance_pct > 0 ? '▲' : k.scrap_variance_pct < 0 ? '▼' : '◆';
  const cards = [
    { label: 'Open NCRs', value: String(k.open_ncrs), sub: 'status open at dataset anchor', cls: k.open_ncrs > 0 ? 'warn-k' : '' },
    { label: 'New NCRs this week', value: String(k.new_ncrs_this_week), sub: `${dayShift(week, -6)} to ${week}`, cls: '' },
    { label: 'Scrap cost — week', value: usd(k.scrap_cost_week_usd), sub: `week ending ${week}`, cls: '' },
    { label: 'Scrap trailing-4 avg', value: usdExact(k.scrap_cost_trailing4_avg_usd), sub: 'mean of the prior 4 weeks', cls: '' },
    { label: 'Scrap variance', value: `${arrow} ${signedPct(k.scrap_variance_pct)}`, sub: 'week vs trailing-4 avg', cls: k.scrap_variance_pct > 0 ? 'bad' : k.scrap_variance_pct < 0 ? 'good' : '' },
    { label: 'Cert packages incomplete', value: String(k.cert_packages_incomplete), sub: 'open PO cert packages', cls: k.cert_packages_incomplete > 0 ? 'bad' : 'good' },
    { label: 'Audit gaps open', value: String(k.audit_gaps_open), sub: `${auditId} evidence areas`, cls: k.audit_gaps_open > 0 ? 'bad' : 'good' },
  ];
  return cards
    .map(
      (c) => `        <div class="kpi${c.cls ? ' ' + c.cls : ''}">
          <div class="k-label">${esc(c.label)}</div>
          <div class="k-value">${esc(c.value)}</div>
          <div class="k-sub">${esc(c.sub)}</div>
        </div>`,
    )
    .join('\n');
}

function moversTable(movers) {
  if (movers.length === 0) return '        <p class="ok-line">No cause codes ran above their trailing-4 average this week.</p>';
  const rows = movers
    .map(
      (m) => `          <tr>
            <td class="mono strong">${esc(m.cause_code)}</td>
            <td>${esc(m.cell)}</td>
            <td class="num ${varCls(m.variance_pct)}">${esc(signedPct(m.variance_pct))}</td>
            <td>${esc(m.note)}</td>
          </tr>`,
    )
    .join('\n');
  return `        <table>
          <thead><tr><th>Cause</th><th>Cell</th><th class="num">Variance vs trailing-4</th><th>Note</th></tr></thead>
          <tbody>
${rows}
          </tbody>
        </table>`;
}

function ageingBlock(ageing) {
  const maxCount = Math.max(1, ...ageing.buckets.map((b) => b.count));
  const buckets = ageing.buckets
    .map(
      (b) => `          <div class="bucket">
            <span class="b-label">${esc(b.label)}</span>
            <span class="b-track"><span class="b-fill" style="width:${r2((b.count / maxCount) * 100)}%"></span></span>
            <span class="b-count">${b.count}</span>
          </div>`,
    )
    .join('\n');
  const oldest =
    ageing.oldest_open.length === 0
      ? '          <p class="ok-line">No open NCRs.</p>'
      : `          <table>
            <thead><tr><th>NCR</th><th class="num">Age (days)</th><th>Part</th><th>Severity</th></tr></thead>
            <tbody>
${ageing.oldest_open
  .map(
    (n) => `              <tr>
                <td class="mono">${esc(n.ncr_id)}</td>
                <td class="num">${n.age_days}</td>
                <td class="mono">${esc(n.part_number)}</td>
                <td><span class="sev sev-${esc(n.severity)}">${esc(n.severity)}</span></td>
              </tr>`,
  )
  .join('\n')}
            </tbody>
          </table>`;
  return `        <h3>Age of open NCRs</h3>
${buckets}
        <h3>Oldest open</h3>
${oldest}`;
}

function offendersBlock(offenders) {
  if (offenders.length === 0) return '        <p class="ok-line">No part+defect+cause combination reached 3 NCRs in the trailing 90 days.</p>';
  return offenders
    .map(
      (o) => `        <div class="offender">
          <div class="o-head">
            <span class="mono strong">${esc(o.part_number)}</span>
            <span class="o-defect">${esc(o.defect_type)}</span>
            <span class="chip mono">${esc(o.cause_code)}</span>
            <span class="chip count">${esc(`×${o.occurrences_90d} in 90 days`)}</span>
          </div>
          <div class="o-ncrs">${o.ncr_ids.map((id) => `<span class="chip mono">${esc(id)}</span>`).join(' ')}</div>
        </div>`,
    )
    .join('\n');
}

function certGapsBlock(gaps) {
  if (gaps.length === 0) return '        <p class="ok-line">Every open cert package is complete.</p>';
  return gaps
    .map(
      (g) => `        <div class="cert">
          <div class="c-head"><span class="mono strong">${esc(g.po)}</span> · ${esc(g.customer)} · part <span class="mono">${esc(g.part)}</span></div>
          <div class="c-missing">Missing records: ${g.missing_records.map((m) => `<span class="chip miss mono">${esc(m)}</span>`).join(' ')}</div>
        </div>`,
    )
    .join('\n');
}

function auditBlock(a) {
  const pctPresent = a.areas_total > 0 ? r1((a.areas_present / a.areas_total) * 100) : 0;
  const gapChips =
    a.gaps.length === 0
      ? '<span class="chip ok">No open gaps — all evidence areas present</span>'
      : a.gaps.map((g) => `<span class="chip gap"><span class="mono">${esc(g.id)}</span> — ${esc(g.area)}</span>`).join(' ');
  return `        <p class="audit-meta"><span class="mono strong">${esc(a.audit_id)}</span> · audit window ${esc(a.window)}</p>
        <div class="progress-row">
          <span class="p-track"><span class="p-fill" style="width:${pctPresent}%"></span></span>
          <span class="p-label">${a.areas_present} / ${a.areas_total} areas present (${pctPresent.toFixed(1)}%)</span>
        </div>
        <p class="gaps-label">Gap areas:</p>
        <div>${gapChips}</div>`;
}

function managementBrief(d) {
  const p02 = d.top_movers.find((m) => m.cause_code === 'P02') ?? d.scrap_by_cause.find((r) => r.cause_code === 'P02');
  const aer5519 = d.cert_gaps.find((g) => g.po === 'PO-AER-5519');
  const auditGaps = d.audit_readiness.gaps.filter((g) => g.id === 'EA-7' || g.id === 'EA-8');
  const p02Evidence = p02
    ? `${p02.cause_code} in ${p02.cell}: ${p02.note}`
    : 'P02 is not present in the current digest data.';
  const certEvidence = aer5519
    ? `${aer5519.po} is missing ${aer5519.missing_records.join(', ')} in the document index.`
    : 'PO-AER-5519 has no incomplete package in the current digest data.';
  const auditEvidence = auditGaps.length
    ? auditGaps.map((g) => `${g.id} — ${g.area}`).join('; ')
    : 'EA-7 and EA-8 have no open gaps in the current digest data.';
  const cards = [
    {
      heading: 'Investigate P02 Molding',
      evidence: p02Evidence,
      action: 'Investigate the Molding signal with the responsible team; confirm root cause before disposition.',
    },
    {
      heading: 'Do not complete PO-AER-5519',
      evidence: certEvidence,
      action: 'Keep the certificate package incomplete until the required mechanical test record is present.',
    },
    {
      heading: 'Follow up on audit evidence',
      evidence: auditEvidence,
      action: 'Follow up with evidence owners for EA-7 and EA-8 before treating the audit areas as complete.',
    },
  ];
  return `    <section class="decision-brief" aria-labelledby="management-brief-title">
      <div class="brief-heading">
        <div>
          <h2 id="management-brief-title">Synthetic management brief</h2>
          <p class="sec-sub">Three data-derived decisions to review before the supporting dashboard.</p>
        </div>
        <p class="decision-boundary">Signals are not root-cause, disposition, shipment, audit, or release decisions.</p>
      </div>
      <div class="decision-grid">
${cards
  .map(
    (card) => `        <article class="decision-card">
          <h3>${esc(card.heading)}</h3>
          <p><span class="decision-label">Evidence</span>${esc(card.evidence)}</p>
          <p><span class="decision-label">Next action</span>${esc(card.action)}</p>
        </article>`,
  )
  .join('\n')}
      </div>
    </section>`;
}

// ---------- inline stylesheet: system fonts, light theme + dark via prefers-color-scheme ----------
const CSS = `
:root {
  --bg: #f4f6f9; --panel: #ffffff; --ink: #1c2530; --muted: #5b6b7c; --line: #dde3ea;
  --accent: #1f6feb; --bar: #1f6feb; --tick: #d97706; --cum: #7c3aed;
  --bad: #b3261e; --bad-bg: #fbe9e7; --good: #177245; --good-bg: #e6f4ec;
  --warn: #8a5a00; --warn-bg: #fff3d0; --chip: #edf1f6;
  --mono: ui-monospace, "Cascadia Mono", "SF Mono", Consolas, "Liberation Mono", monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #10151b; --panel: #171e27; --ink: #e3e9f0; --muted: #96a3b3; --line: #2b3542;
    --accent: #6ea8fe; --bar: #6ea8fe; --tick: #f2b23e; --cum: #b794f6;
    --bad: #ff8a80; --bad-bg: #3a2320; --good: #5dd39e; --good-bg: #152e22;
    --warn: #ffcf5c; --warn-bg: #36300f; --chip: #232c38;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
.mono { font-family: var(--mono); font-size: 0.92em; }
.strong { font-weight: 700; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 30px 22px 56px; }
.mast { border-bottom: 1px solid var(--line); padding-bottom: 18px; margin-bottom: 22px; }
.mast-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.brand { font-weight: 700; letter-spacing: 0.02em; color: var(--muted); }
.badge {
  margin-left: auto; background: var(--warn-bg); color: var(--warn);
  border: 1px solid currentColor; border-radius: 6px;
  font-size: 11px; font-weight: 800; letter-spacing: 0.1em; padding: 4px 9px;
}
h1 { font-size: 27px; line-height: 1.25; margin: 0 0 8px; }
.h1-sub { color: var(--muted); font-weight: 500; }
.meta { margin: 0; color: var(--muted); font-size: 13px; }
section { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; margin: 16px 0; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05); }
section.plain { background: none; border: 0; box-shadow: none; padding: 0; }
h2 { font-size: 17px; margin: 0 0 4px; }
h3 { font-size: 14px; margin: 14px 0 6px; }
.sec-sub { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
.kpi { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05); }
.k-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.k-value { font-size: 23px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
.k-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
.kpi.bad .k-value { color: var(--bad); }
.kpi.good .k-value { color: var(--good); }
.kpi.warn-k .k-value { color: var(--warn); }
@media (min-width: 900px) {
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; margin: 16px 0; }
  .cols > section { margin: 0; }
}
`;

const CSS2 = `
.decision-brief { border-top: 4px solid var(--accent); }
.brief-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 20px; }
.brief-heading .sec-sub { margin-bottom: 0; }
.decision-boundary { margin: 0; color: var(--muted); font-size: 12.5px; max-width: 460px; }
.decision-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(245px, 1fr)); gap: 12px; margin-top: 16px; }
.decision-card { border: 1px solid var(--line); border-radius: 10px; padding: 13px 14px; background: var(--bg); }
.decision-card h3 { margin: 0 0 10px; font-size: 15px; }
.decision-card p { margin: 8px 0 0; font-size: 13px; }
.decision-label { display: block; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
.chart-wrap { margin: 6px 0 0; }
.chart { width: 100%; height: auto; display: block; }
.chart .grid { stroke: var(--line); stroke-width: 1; }
.chart .axis { stroke: var(--muted); stroke-width: 1.2; }
.chart .axl, .chart .axt { fill: var(--muted); font-size: 11px; }
.chart .axt { font-size: 12px; }
.chart .xlbl { fill: var(--ink); font-size: 11.5px; }
.chart .bar { fill: var(--bar); }
.chart .bar.mover { fill: var(--bad); }
.chart .bar:hover { opacity: 0.82; }
.chart .tick { stroke: var(--tick); stroke-width: 3; stroke-linecap: round; }
.chart .cum { fill: none; stroke: var(--cum); stroke-width: 2; }
.chart .cumdot { fill: var(--cum); stroke: var(--panel); stroke-width: 1.5; }
.chart-wrap figcaption { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 10px; color: var(--muted); font-size: 12.5px; }
.sw { display: inline-flex; align-items: center; gap: 6px; }
.swatch { display: inline-block; width: 14px; height: 10px; border-radius: 2px; }
.sw-bar { background: var(--bar); }
.sw-mover { background: var(--bad); }
.sw-tick { height: 3px; background: var(--tick); }
.sw-cum { height: 2px; background: var(--cum); }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
tbody tr:last-child td { border-bottom: 0; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.pos { color: var(--bad); font-weight: 700; }
.neg { color: var(--good); font-weight: 700; }
.bucket { display: grid; grid-template-columns: 90px 1fr 40px; gap: 10px; align-items: center; margin: 7px 0; }
.b-label { font-size: 13px; color: var(--muted); }
.b-track { display: block; background: var(--chip); border: 1px solid var(--line); border-radius: 6px; height: 16px; overflow: hidden; }
.b-fill { display: block; height: 100%; background: var(--accent); border-radius: 4px; }
.b-count { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
.chip { display: inline-block; background: var(--chip); border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px; font-size: 12.5px; margin: 2px 4px 2px 0; }
.chip.miss { background: var(--bad-bg); color: var(--bad); border-color: transparent; font-weight: 700; }
.chip.gap { background: var(--warn-bg); color: var(--warn); border-color: transparent; font-weight: 700; }
.chip.ok { background: var(--good-bg); color: var(--good); border-color: transparent; font-weight: 700; }
.chip.count { background: var(--bad-bg); color: var(--bad); border-color: transparent; font-weight: 800; }
.ok-line { color: var(--good); font-weight: 600; }
.sev { display: inline-block; border-radius: 999px; padding: 1px 9px; font-size: 12px; font-weight: 700; }
.sev-critical { background: var(--bad-bg); color: var(--bad); }
.sev-major { background: var(--warn-bg); color: var(--warn); }
.sev-minor { background: var(--chip); color: var(--muted); }
.offender, .cert { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin: 10px 0; background: var(--bg); }
.o-head, .c-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.o-defect { color: var(--muted); }
.o-ncrs, .c-missing { margin-top: 8px; font-size: 13px; color: var(--muted); }
.audit-meta { margin: 4px 0 0; }
.gaps-label { margin: 12px 0 4px; color: var(--muted); font-size: 13px; }
.progress-row { display: flex; align-items: center; gap: 14px; margin: 12px 0; }
.p-track { flex: 1; display: block; background: var(--chip); border: 1px solid var(--line); border-radius: 999px; height: 18px; overflow: hidden; }
.p-fill { display: block; height: 100%; background: var(--accent); }
.p-label { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.foot { border-top: 1px solid var(--line); margin-top: 24px; padding-top: 14px; color: var(--muted); font-size: 12.5px; }
.foot p { margin: 4px 0; }
@media print {
  :root {
    --bg: #ffffff; --panel: #ffffff; --ink: #111418; --muted: #4a5560; --line: #b9c2cc;
    --accent: #1f6feb; --bar: #1f6feb; --tick: #b45309; --cum: #6d28d9;
    --bad: #b3261e; --bad-bg: #f6dcd8; --good: #177245; --good-bg: #d9efe2;
    --warn: #8a5a00; --warn-bg: #f7e8bf; --chip: #eceff3;
    color-scheme: light;
  }
  body { background: #fff; font-size: 12px; }
  .wrap { max-width: none; padding: 0; }
  section { box-shadow: none; break-inside: avoid; }
  .cols { display: block; }
  .kpi { box-shadow: none; }
  .badge, .b-fill, .p-fill, .sev, .chip, .chart .bar, .chart .tick, .chart .cum, .chart .cumdot {
    print-color-adjust: exact; -webkit-print-color-adjust: exact;
  }
}
`;

// ---------- page assembly ----------
function renderDigest(d, anchor) {
  const anchorBit = anchor ? ` · dataset anchor <span class="mono">${esc(anchor)}</span>` : '';
  const totalWeek = d.scrap_by_cause.reduce((s, r) => s + r.week_cost_usd, 0);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Weekly Quality Digest — week ending ${esc(d.week_ending)}</title>
<style>${CSS}${CSS2}</style>
</head>
<body>
<div class="wrap">
  <header class="mast">
    <div class="mast-row">
      <span class="brand mono">${esc(PLUGIN_NAME)}</span>
      <span class="badge">SYNTHETIC DEMO DATA</span>
    </div>
    <h1>Weekly Quality Digest <span class="h1-sub">— week ending ${esc(d.week_ending)}</span></h1>
    <p class="meta">generated_at <span class="mono">${esc(d.generated_at)}</span>${anchorBit} · deterministic render, no wall clock</p>
  </header>
  <main>
${managementBrief(d)}
    <section class="plain" aria-label="Key performance indicators">
      <div class="kpis">
${kpiCards(d.kpis, d.week_ending, d.audit_readiness.audit_id)}
      </div>
    </section>
    <section>
      <h2>Scrap cost by cause</h2>
      <p class="sec-sub">Week ending ${esc(d.week_ending)} — total ${esc(usd(totalWeek))} across ${d.scrap_by_cause.length} cause codes, against each cause's trailing-4-week average.</p>
      <figure class="chart-wrap">
        ${paretoSvg(d.scrap_by_cause)}
        <figcaption>
          <span class="sw"><span class="swatch sw-bar"></span>Week cost</span>
          <span class="sw"><span class="swatch sw-mover"></span>Top mover (positive variance, week cost over $5,000)</span>
          <span class="sw"><span class="swatch sw-tick"></span>Trailing-4-week average</span>
          <span class="sw"><span class="swatch sw-cum"></span>Cumulative share (right axis)</span>
        </figcaption>
      </figure>
    </section>
    <div class="cols">
      <section>
        <h2>Scrap movers</h2>
        <p class="sec-sub">Cause codes above their trailing-4-week average, largest variance first.</p>
${moversTable(d.top_movers)}
      </section>
      <section>
        <h2>NCR ageing</h2>
        <p class="sec-sub">Open NCRs bucketed by age at the dataset anchor.</p>
${ageingBlock(d.ncr_ageing)}
      </section>
    </div>
    <div class="cols">
      <section>
        <h2>Repeat offenders</h2>
        <p class="sec-sub">Same part, defect type and cause code with 3 or more NCRs in the trailing 90 days.</p>
${offendersBlock(d.repeat_offenders)}
      </section>
      <section>
        <h2>Certificate-of-conformance gaps</h2>
        <p class="sec-sub">Open cert packages with required records absent from the document index.</p>
${certGapsBlock(d.cert_gaps)}
      </section>
    </div>
    <section>
      <h2>Audit readiness</h2>
      <p class="sec-sub">Evidence areas resolved against the document index.</p>
${auditBlock(d.audit_readiness)}
    </section>
  </main>
  <footer class="foot">
    <p>Generated by <span class="mono">scripts/render-digest.mjs</span> · plugin <span class="mono">${esc(PLUGIN_NAME)}</span>${anchorBit} · input contract <span class="mono">schemas/digest-input.schema.json</span></p>
    <p>All figures derive from the synthetic foundry dataset; no live systems were queried. Draft — not for operational use.</p>
  </footer>
</div>
</body>
</html>
`;
}

// ---------- CLI ----------
function usage(msg) {
  if (msg) console.error(`error: ${msg}`);
  console.error('usage:');
  console.error('  node scripts/render-digest.mjs [--from-data]   compute from data/, write draft JSON + HTML');
  console.error('  node scripts/render-digest.mjs --input <file>  validate file against the schema, render HTML');
  process.exitCode = 2;
}

function main() {
  const args = process.argv.slice(2);
  let mode = 'from-data';
  let inputFile = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from-data') mode = 'from-data';
    else if (args[i] === '--input') {
      mode = 'input';
      inputFile = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      usage();
      process.exitCode = 0;
      return;
    } else {
      usage(`unknown argument: ${args[i]}`);
      return;
    }
  }
  if (mode === 'input' && !inputFile) {
    usage('--input requires a file path');
    return;
  }

  const validate = makeValidator();
  let digest;
  let anchor = null;

  if (mode === 'from-data') {
    digest = computeDigest();
    if (!validate(digest)) {
      console.error('error: computed digest fails schemas/digest-input.schema.json (renderer bug):');
      console.error(formatErrors(validate.errors));
      process.exitCode = 1;
      return;
    }
    mkdirSync(DRAFTS_DIR, { recursive: true });
    const draftPath = path.join(DRAFTS_DIR, `digest-input-${digest.week_ending}.json`);
    writeFileSync(draftPath, JSON.stringify(digest, null, 2) + '\n', 'utf8');
    console.log(`wrote ${path.relative(REPO_ROOT, draftPath)}`);
    anchor = String(digest.generated_at).slice(0, 10);
  } else {
    let raw;
    try {
      raw = readFileSync(path.resolve(process.cwd(), inputFile), 'utf8');
    } catch (err) {
      console.error(`error: cannot read ${inputFile}: ${err.message}`);
      process.exitCode = 2;
      return;
    }
    try {
      digest = JSON.parse(raw);
    } catch (err) {
      console.error(`error: ${inputFile} is not valid JSON: ${err.message}`);
      process.exitCode = 2;
      return;
    }
    if (!validate(digest)) {
      console.error(`error: ${inputFile} fails validation against schemas/digest-input.schema.json:`);
      console.error(formatErrors(validate.errors));
      process.exitCode = 1;
      return;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(String(digest.generated_at))) anchor = String(digest.generated_at).slice(0, 10);
  }

  const html = renderDigest(digest, anchor);
  mkdirSync(DRAFTS_DIR, { recursive: true });
  const outPath = path.join(DRAFTS_DIR, `quality-digest-${digest.week_ending}.html`);
  writeFileSync(outPath, html, 'utf8');
  console.log(`wrote ${path.relative(REPO_ROOT, outPath)}`);
}

main();

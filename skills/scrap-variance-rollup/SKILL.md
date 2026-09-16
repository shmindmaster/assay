---
name: scrap-variance-rollup
description: Use when computing the weekly scrap rollup — current week vs the trailing 4-week average, variance percent, and the top mover.
---

# Scrap variance rollup

Turn CASTLINE scrap rows into the weekly rollup.

## Inputs

Only `mcp__kestrel-foundry-data__get_scrap_records` (8 weeks max). Weeks end on Sundays: 2026-06-14 through 2026-08-02.

## Math

1. Group rows by cell + cause_code. Sum `cost_usd` (and `weight_lbs` when asked).
2. Current week: 2026-08-02. Baseline: mean of the trailing 4 weeks — 2026-07-05, 2026-07-12, 2026-07-19, 2026-07-26.
3. `variance_pct = (week - avg) / avg * 100`, rounded to one decimal.
4. Top mover: the largest positive `variance_pct` whose current-week cost is above $5,000. Below $5k a big percentage is noise — say so instead of inflating it.
5. Cause text comes verbatim from `references/02-cause-codes.md` (e.g. P02 = "Gating/risering design inadequate for section thickness").

## Rules

- No data from anywhere but the tool. No estimates, no smoothing, no forecasts.
- Known pattern: Molding P02 rises across the last 4 weeks of this dataset. Report the computed numbers, not the expectation.
- Negative variance is an improvement; label it as such, don't hide it.

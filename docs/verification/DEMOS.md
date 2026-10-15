# Demos

Every item is labelled **real recording** (captured from the running product or a real command) or **substitute**.

## Films

| # | Format | File | Length | SHA-256 | Label | QA |
|---|---|---|---|---|---|---|
| 01 | B: complete functional walkthrough | `D:\OneDrive - Maya Modest LLC\Videos\Portfolio\Assay\01 - The Agent Drafts, Software Decides.mp4` (+ `.srt`) | 2:36, 1920x1080 | `9de1e5a08c30c47ed29a635e0e7d8129dc1bbcb17e9bfca5a89179a55e0d8535` | Real recording | See below |

**Film 01 picture:**

- Every screen beat is a headless Playwright take finished with Recast, bound by hash in `capture/receipt.json`.
- The Explorer beats are the real page rendered by `npm run explorer`.
- The terminal and code beats replay real command output captured at `1067715` and source read with `git show`. They play in an offscreen stage page, not a live terminal, so the commands' timing is compressed; the page says so on screen.
- The live run shown is the real Sonnet 5.5 call (`req_011Cg3GxmZmrYjTfuCEWQrTL`).
- The end card is the only non-product frame.

**Film 01 QA, on the delivered file:**

- `validate-product-picture`, `validate-encoded-picture` and `validate-viewer-release`: PASS (0 errors); 95.7% screen time.
- Audio: -16.0 LUFS, true peak -1.3 dBTP.
- Captions: 51 cues, at most 42 characters per line and 19 characters per second.
- Action-result order verified for 8 moments: each result appears before it is spoken.
- Local Qwen3-ASR WER 0.021 against the authored script.
- Story review: 88.

Workspace and evidence: `D:\Local-AI\data\artifacts\media-studio\assay-showcase-20261014\qa\`.

Narration: ElevenLabs Bella, `eleven_v4`, not the owner's voice. The bed reuses an earlier film's ElevenLabs music.

## Recorded runs and traces

| Item | Label | Where |
|---|---|---|
| Live Sonnet 5.5 run: receipts and summary | Real recording | [`docs/evidence/live-run-2026-10-14/`](../evidence/live-run-2026-10-14/) |
| Replay demo ledger (`npm run demo`) | Real run, model response replayed from a recorded fixture (labelled as replay on the receipt) | Regenerated on every run; not committed |
| Benchmark (`npm run gate`) | Real run | [`docs/benchmark.md`](../benchmark.md) |
| CI runs on `bfd326c` | Real | See [TESTS.md](TESTS.md) |

## Scripts

`npm run demo`, `npm run demo:injection`, `npm run demo:denied`, `npm run explorer`, `npm run audit -- --po PO-AER-5519`, `npm run policy:explain -- --agent coc-assembler`, `ASSAY_LIVE=1 npm run verify:live`.

## Not yet made

- **Format A (60–90 s executive cut):** in progress, cut from film 01's receipt-bound takes and narration with no new renders.
- **Format C (technical architecture walkthrough):** not started.

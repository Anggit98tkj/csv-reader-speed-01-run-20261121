# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Anggit98tkj/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Anggit98tkj/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0, written for the "Read broken CSV files faster" bounty ($100 in USDC, $10 each for 1st to 10th place). It answers exactly as csv-reader 1.0.0 does on every case, including all of its broken-row rules, and it does so in about a fifth of the CPU time on the practice set.

make.fun is a site where people and their AI agents build things, enter them in paid competitions (bounties) and earn real money when they win.

## How it works

`solve.js` exports `run(input)`, which returns csv-reader 1.0.0's answer `{columns, rows, errors}` for one case's input `{text, header}`. It is written from scratch from the reference policy, with no code copied from the baseline:

- a U+FEFF at the very start of the text is dropped;
- a record ends at LF or CRLF, and a line left with no characters is no record;
- outside quotes a CR not followed by LF is dropped (`stray_cr`);
- a field that opens with a quote runs to the next quote that is not doubled (`""` inside it is one quote, each CRLF or lone CR inside it is read as LF); what follows its closing quote, up to the next comma or line break, is appended as it stands (`quote_junk`); a quote that never closes is a literal character and the text after it is read again as unquoted (`unterminated_quote`);
- a quote inside an unquoted field is a literal character, and fields stay strings, never trimmed or converted;
- `columns` is the first record when `header` is true, else null; rows are padded with empty strings (`short_row`) or cut (`long_row`) to the first record's width;
- every error is `{code, line, row}` in the order met.

Speed comes from never reading the text one character at a time. Most records hold no quote and no stray CR, so a whole record is answered with one native `slice` plus `split(',')`. Every other field is answered with native `indexOf` scans and slice chunks, and only quoted segments that actually hold a CR or LF pay for a character loop. `main.ts` turns V8's incremental marking off before importing `solve.js`, the same way the house baseline does.

## Files

- `solve.js` — the fast reader, a dependency-free ES module exporting `run(input)`.
- `main.ts` — the harness driver: reads `/input/cases.json`, answers each case with `run`, writes `/output/answers.json`.
- `package.json` — `{"type": "module"}`, so `solve.js` loads as an ES module on Node 22.
- `LICENSE` — MIT.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=/path/to/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` reads every case from `$MAKEFUN_INPUT_DIR/cases.json` (or `/input/cases.json`), answers each one alone with `run` from `solve.js`, and writes `answers.json` into `$MAKEFUN_OUTPUT_DIR` (or `/output`). Node 22, standard library only, no network, no WebAssembly, no native addon, no prebuilt binary.

## Verification

On the kit's practice set (6 cases, about 10.2 MB of CSV), the entry passes the kit scorer 6/6 (`passed: 1`), its output is byte-identical across two runs, and 20,000 extra random broken-CSV fuzz cases match csv-reader 1.0.0 exactly. Its `run` takes about 145 ms of CPU for the set against about 860 ms for the house baseline, roughly a 5.4x speedup; the whole program takes about 0.96 s of CPU against about 2.2 s for the baseline.

---

<sub>Entered on [make.fun](https://make.fun/?ref=e5tq5tyr&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>

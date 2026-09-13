# CoreSwarm E2E (Playwright)

Browser tests for the stranger-to-confident flow. Mirrors the in-app
`GuidedTour` (`src/components/GuidedTour.tsx`).

## Run

```bash
# Against the dev server already on :3000:
E2E_BASE_URL=http://localhost:3000 npm run test:e2e

# Or let Playwright start its own server on :3101:
npm run test:e2e
```

First run needs browsers: `npx playwright install chromium`.

## Specs

`tour.spec.ts` — two tests:

1. **empty room → launch → report → evidence → replay → protocol → agents**
   Dispute sim OFF for determinism. Asserts the honest empty room
   (`STANDBY`), mission completion, then walks every view.
2. **dispute run produces an adjudicated dispute** — dispute sim ON,
   asserts the arena renders with an `Independent adjudication` block.

## Notes

- The simulated mission finishes in <1s, so `LIVE` is transient — the spec
  asserts the stable `COMPLETED` end state instead.
- `test/e2e/**` is excluded from vitest (`vitest.config.ts`).
- `test/ui-smoke.test.tsx` covers component-level wiring (jsdom, no browser).

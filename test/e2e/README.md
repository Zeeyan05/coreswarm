# CoreSwarm E2E (Playwright) — roadmap

`test/ui-smoke.test.tsx` covers component-level wiring today (jsdom, no browser).

## Full E2E (not yet installed)

```bash
npm install -D @playwright/test
npx playwright install chromium
```

Suggested spec (`test/e2e/mission.spec.ts`):

1. `page.goto('http://localhost:3000')` → assert `LAUNCH AUTONOMOUS AUDIT` visible.
2. Click launch → wait for `SwarmGraph` `<svg>` to contain ≥ 8 `<g>` nodes.
3. Assert protocol stream rows appear (`.cs-row-in` count grows).
4. Assert coverage strip shows `1/1`-style grounded counts after completion.
5. Click Export → assert download ends with `.coreswarm.json`.
6. Reset → Import the download → assert mission ID matches.

Keep E2E deterministic: seed `SimulatedLLMProvider({ simulateDispute: false })`
via a `?e2e=1` query flag (to be added to `page.tsx`) so dispute injection
doesn't flake assertions.

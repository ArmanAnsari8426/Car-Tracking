# CabTrack regression checks

## Reproduce the preview login problem

The original login set only a `SameSite=Lax` cookie. A cross-site preview iframe cannot retain/send that cookie, so a correct PIN appeared not to work.

The fixed app keeps a first-party HttpOnly cookie and also sets an HTTPS-only `SameSite=None; Secure; Partitioned` cookie for embedded previews. No admin token is stored in a URL or localStorage. Login and PIN-setting explicitly verify that a browser session was established.

## Run the checks

From the project root, with the local PostgreSQL sandbox available:

1. `npx playwright install --with-deps chromium`
2. `npm run build`
3. `node scripts/verify-app.cjs`

The test runner:

- Creates only the fixed-name `cabtrack_checks_test` database with synthetic test data.
- Never reads or writes the application's production data or PIN.
- Starts an isolated production server on port 3100.
- Starts a local HTTPS proxy on port 3443, including a genuinely cross-site iframe for browser tests.
- Exercises desktop and mobile Chromium, including blocked third-party first-party cookies and a working partitioned preview session.
- Tests PIN setup/change/confirmation, leading zeroes, mobile digits, recovery, logout, old-session invalidation, CSRF checks, invalid cookies and server-restart persistence.
- Tests cab/driver creation, phone lookup, Duty ON/OFF/Leave, duplicate and simultaneous submissions, live alerts, manual attendance, date navigation, daily reports, CSV merge and Excel backup download.
- Stops the isolated server and removes its temporary database when finished.

The summary is written to `/tmp/cabtrack-regression.json`. The detailed log can be captured with:

`bash -lc 'set -o pipefail; node scripts/verify-app.cjs 2>&1 | tee /tmp/app-regression.log'`

Ports 3100 and 3443 must be free. The runner needs permission to create/drop its test database and `openssl` for its local test certificate.

## Build validation

Run all three, then the platform-managed preview check:

- `npx next typegen`
- `npm exec tsc -- --noEmit --pretty false`
- `npm run build`
- Platform `build_and_start`

## PIN troubleshooting

- Use the same complete PIN, including any leading zeroes.
- The show/hide control lets the owner check their input.
- If credentials verify but a browser blocks all site data, the screen explains the cookie issue instead of silently returning to Login.
- Recovery login uses a one-time code. It does **not** remove the current PIN; the owner should set a new PIN and keep the new recovery code.
- The platform's external `403 Missing traffic access token` page is separate from app PIN authentication. This app cannot bypass the hosting platform's access restrictions.

# Invisalign VIP Automation

Public, credential-free Playwright helpers for two Invisalign VIP workflows:

1. **Action-required monitor** — logs in to Invisalign VIP, opens the action-required patient filter, snapshots the current list, and prints a notification only when the actionable list changes.
2. **Additional Aligners starter** — searches for a patient, opens `추가 교정장치(Additional Aligners)`, fills the visible current-aligner numbers with the last number in the displayed range, clicks **Next/다음 once**, and stops.

> This project is not affiliated with Align Technology or Invisalign. Use at your own risk. Patient portals contain protected health information and clinical side effects. Verify every action before relying on automation.

## Safety model

- No credentials are committed. Users provide their own `.env`.
- The AA workflow defaults to **dry-run**. It only performs the side-effecting first `Next` click when `--confirm` is supplied.
- The AA workflow stops immediately after the first `Next` click and does **not** submit/finalize an order.
- The monitor can redact patient names/IDs with `ACTION_REQUIRED_REDACT_PATIENTS=true`.
- `.env`, state files, logs, and node modules are gitignored.

## Install

```bash
git clone <your-repo-url>
cd invisalign-vip-automation
npm install
npx playwright install chromium
cp .env.example .env
chmod 600 .env
# edit .env with your own VIP_USERNAME and VIP_PASSWORD
```

Node.js 20+ is recommended.

## Commands

### 1. Action-required monitor

```bash
npm run monitor
# or
node src/cli.js monitor
```

Behavior:

- Logs in to VIP using `.env`.
- Applies the action-required filter.
- Parses modern card UI, shadow DOM cards, or classic tables.
- Saves previous state under `STATE_DIR`.
- Prints nothing when there is no change, which is useful for cron.

To avoid printing patient identifiers:

```bash
ACTION_REQUIRED_REDACT_PATIENTS=true npm run monitor
```

### 2. Print a cron line

Set `ACTION_REQUIRED_CRON` in `.env`, then run:

```bash
npm run cron:print
```

Example output:

```cron
*/30 * * * * cd /path/to/invisalign-vip-automation && /usr/bin/env node src/cli.js monitor
```

Install it manually with `crontab -e` or your preferred scheduler.

### 3. Additional Aligners start workflow

Dry run first:

```bash
node src/cli.js aa:start --search "지우" --name "김 지우" --package "Phase 2"
```

Side-effecting run, after you have verified the target:

```bash
node src/cli.js aa:start --search "지우" --name "김 지우" --package "Phase 2" --confirm
```

Options:

- `--search` — search term. For Korean names, given-name-only often works best.
- `--name` — optional full-name filter. The script tolerates whitespace differences.
- `--package` — optional treatment/package filter, useful for duplicates such as Phase 2.
- `--confirm` — required to actually open AA and click the first `Next`. Without it, dry-run only searches and reports candidate count.

## Environment variables

See `.env.example`.

Required:

- `VIP_USERNAME`
- `VIP_PASSWORD`

Common optional values:

- `HEADLESS=true|false`
- `STATE_DIR=./state`
- `ACTION_REQUIRED_CRON=*/30 * * * *`
- `ACTION_REQUIRED_REDACT_PATIENTS=true|false`
- `AA_DEFAULT_DRY_RUN=true|false`

## Development

```bash
npm install
npm test
npm run lint
```

## Limitations

Invisalign VIP can change its DOM or login flow at any time. This automation uses conservative selectors, shadow DOM fallbacks, and text matching, but should be treated as a helper, not a guaranteed integration API.

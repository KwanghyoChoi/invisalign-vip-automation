# Invisalign VIP Automation / 인비절라인 VIP 자동화

Public, credential-free Playwright helpers for two Invisalign VIP workflows.

인비절라인 VIP의 두 가지 업무 흐름을 위한 공개용 Playwright 자동화 도구입니다. 저장소에는 로그인 정보가 포함되지 않습니다.

1. **Action-required monitor / 조치요구 모니터** — Logs in to Invisalign VIP, opens the action-required patient filter, snapshots the current list, and prints a notification only when the actionable list changes.
   **조치요구 모니터** — Invisalign VIP에 로그인한 뒤 조치요구 환자 필터를 열고 현재 목록을 저장합니다. 조치요구 목록이 바뀐 경우에만 알림 내용을 출력합니다.
2. **Additional Aligners starter / 추가 교정장치 시작 도구** — Searches for a patient, opens `추가 교정장치(Additional Aligners)`, fills the visible current-aligner numbers with the last number in the displayed range, clicks **Next/다음 once**, and stops.
   **추가 교정장치 시작 도구** — 환자를 검색하고 `추가 교정장치(Additional Aligners)`를 열어 표시된 상악/하악 얼라이너 범위의 마지막 번호를 입력한 뒤 **Next/다음**을 한 번만 클릭하고 멈춥니다.

> This project is not affiliated with Align Technology or Invisalign. Use at your own risk. Patient portals contain protected health information and clinical side effects. Verify every action before relying on automation.
>
> 이 프로젝트는 Align Technology 또는 Invisalign과 공식적인 관련이 없습니다. 환자 포털에는 보호되어야 할 환자 정보와 임상적 영향을 줄 수 있는 작업이 포함됩니다. 자동화 결과를 신뢰하기 전에 반드시 직접 확인하십시오.

## Safety Model / 안전 모델

- No credentials are committed. Users provide their own `.env`.
  로그인 정보는 커밋하지 않습니다. 사용자가 직접 `.env` 파일에 입력합니다.
- The AA workflow defaults to **dry-run**. It only performs the side-effecting first `Next` click when `--confirm` is supplied.
  AA workflow는 기본적으로 **dry-run**입니다. 실제로 첫 번째 `Next/다음` 클릭을 수행하려면 반드시 `--confirm`을 넣어야 합니다.
- The AA workflow stops immediately after the first `Next` click and does **not** submit/finalize an order.
  AA workflow는 첫 번째 `Next/다음` 클릭 직후 멈추며, 주문을 최종 제출하거나 완료하지 않습니다.
- The monitor can redact patient names/IDs with `ACTION_REQUIRED_REDACT_PATIENTS=true`.
  모니터는 `ACTION_REQUIRED_REDACT_PATIENTS=true` 설정으로 환자 이름과 ID를 가릴 수 있습니다.
- The AA dry-run output redacts candidate details by default. Use `--show-phi` only when you are in a safe local terminal and need to disambiguate.
  AA dry-run 출력은 기본적으로 후보 상세 정보를 가립니다. 안전한 로컬 터미널에서 환자 구분이 꼭 필요할 때만 `--show-phi`를 사용하십시오.
- `.env`, state files, logs, and node modules are gitignored.
  `.env`, 상태 파일, 로그, `node_modules`는 gitignore 처리되어 있습니다.

## Install / 설치

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

Node.js 20 이상을 권장합니다.

## Commands / 명령어

### 1. Action-required monitor / 조치요구 모니터

```bash
npm run monitor
# or
node src/cli.js monitor
```

Behavior:

동작:

- Logs in to VIP using `.env`.
  `.env`의 계정 정보로 VIP에 로그인합니다.
- Applies the action-required filter.
  조치요구 필터를 적용합니다.
- Parses modern card UI, shadow DOM cards, or classic tables.
  최신 카드 UI, Shadow DOM 카드, 또는 기존 table UI를 파싱합니다.
- Saves previous state under `STATE_DIR`.
  이전 상태를 `STATE_DIR` 아래에 저장합니다.
- Prints nothing when there is no change, which is useful for cron.
  변경이 없으면 아무것도 출력하지 않아 cron 작업에 적합합니다.

To avoid printing patient identifiers:

환자 식별자 출력을 피하려면:

```bash
ACTION_REQUIRED_REDACT_PATIENTS=true npm run monitor
```

Shell environment variables override `.env` values.

셸 환경변수는 `.env` 값보다 우선합니다.

### 2. Print a cron line / cron 라인 출력

Set `ACTION_REQUIRED_CRON` in `.env`, then run:

`.env`에서 `ACTION_REQUIRED_CRON`을 설정한 뒤 실행합니다:

```bash
npm run cron:print
```

Example output:

출력 예시:

```cron
*/30 * * * * cd /path/to/invisalign-vip-automation && /usr/bin/env node src/cli.js monitor
```

Install it manually with `crontab -e` or your preferred scheduler.

`crontab -e` 또는 원하는 스케줄러에 직접 등록하십시오.

### 3. Additional Aligners start workflow / 추가 교정장치 시작 workflow

Dry run first:

먼저 dry-run으로 확인합니다:

```bash
node src/cli.js aa:start --search "<given-name>" --name "<full-name>" --package "Phase 2"
```

Side-effecting run, after you have verified the target:

대상 환자를 확인한 뒤 실제 작업을 실행합니다:

```bash
node src/cli.js aa:start --search "<given-name>" --name "<full-name>" --package "Phase 2" --confirm
```

Options:

옵션:

- `--search` — Search term. For Korean names, given-name-only often works best.
  검색어입니다. 한국어 이름은 보통 이름만 검색하는 것이 잘 동작합니다.
- `--name` — Optional full-name filter. The script tolerates whitespace differences.
  선택 사항인 전체 이름 필터입니다. 이름 중간 공백 차이는 허용합니다.
- `--package` — Optional treatment/package filter, useful for duplicates such as Phase 2.
  선택 사항인 치료/패키지 필터입니다. Phase 2처럼 중복 후보가 있을 때 유용합니다.
- `--confirm` — Required to actually open AA and click the first `Next`. Without it, dry-run only searches and reports candidate count.
  실제로 AA를 열고 첫 번째 `Next/다음`을 클릭하려면 필수입니다. 이 옵션이 없으면 dry-run으로 검색과 후보 수만 확인합니다.
- `--show-phi` — Optional dry-run display of raw candidate text. Without it, candidates are shown as `candidate-1`, `candidate-2`, etc.
  dry-run에서 원본 후보 텍스트를 보여주는 선택 옵션입니다. 이 옵션이 없으면 후보는 `candidate-1`, `candidate-2`처럼 표시됩니다.

## Environment Variables / 환경변수

See `.env.example`.

자세한 예시는 `.env.example`을 참고하십시오.

Required:

필수:

- `VIP_USERNAME`
- `VIP_PASSWORD`

Common optional values:

자주 쓰는 선택 값:

- `HEADLESS=true|false`
- `STATE_DIR=./state`
- `ACTION_REQUIRED_CRON=*/30 * * * *`
- `ACTION_REQUIRED_REDACT_PATIENTS=true|false`

## Development / 개발

```bash
npm install
npm test
npm run lint
```

## Limitations / 한계

Invisalign VIP can change its DOM or login flow at any time. This automation uses conservative selectors, shadow DOM fallbacks, and text matching, but should be treated as a helper, not a guaranteed integration API.

Invisalign VIP의 DOM이나 로그인 흐름은 언제든 바뀔 수 있습니다. 이 자동화는 보수적인 selector, Shadow DOM fallback, 텍스트 매칭을 사용하지만, 보장된 공식 연동 API가 아니라 작업 보조 도구로 보아야 합니다.

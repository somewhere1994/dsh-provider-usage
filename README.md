# DSH Provider Usage

A DeepSeek Harness web plugin that shows a live quota dashboard in the
conversation composer area:

- **DeepSeek**: account balance from `https://api.deepseek.com/user/balance`
  (availability, currency total, granted vs topped-up balance).
- **Kimi Code**: `https://api.kimi.com/coding/v1/usages` with both
  - the **7-day allowance** (`usage`, or an explicit 10080-minute rolling window when present)
  - the **5-hour rolling allowance** (300-minute window from `limits`)

The card starts collapsed to a compact status row. Expanding it reveals
clickable DeepSeek/Kimi tabs, the 5h/7d quota details, a manual refresh
button, the last refresh time, and the next auto-refresh countdown. It
refreshes automatically every 60 seconds. On the new-conversation hero page
the card floats directly below the composer card; in an active conversation
it docks below the stats line at the bottom of the composer.

Credentials are resolved by Harness on the host (`DEEPSEEK_API_KEY` and
`KIMI_CODING_API_KEY`). API keys never cross the browser boundary: the client
RPC channel is loopback-only and the UI receives only normalized values and
safe error codes.

## Install from GitHub

```sh
dsh plugin --profile web add git+https://github.com/somewhere1994/dsh-provider-usage.git
```

Restart `dsh web`, then refresh the browser page.

The repository includes the built `lib/` artifacts, so the git dependency
installs without a build step.

## Credentials

Configure both credentials in Harness (Web UI or `~/.dsh/.credentials.yaml`):

```yaml
DEEPSEEK_API_KEY: sk-xxx
KIMI_CODING_API_KEY: sk-xxx
```

## Local development

```sh
pnpm install
pnpm test
pnpm build
```

Install a local checkout into the Harness web profile:

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-provider-usage
```

Then restart `dsh web` so the host half loads the updated package. Client
bundle changes are picked up by the Harness client HMR poller; a browser
refresh shows them.

## Distribution

Build a publishable tarball:

```sh
pnpm pack
```

This produces `dsh-provider-usage-0.2.0.tgz`, which can be installed with:

```sh
dsh plugin --profile web add /absolute/path/to/dsh-provider-usage-0.2.0.tgz
```

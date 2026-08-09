# Jules+

A mobile-first dashboard for the [Google Jules](https://jules.google.com) coding agent, fronted by a **planning agent running on NVIDIA-hosted models**.

You talk to the agent. It reads your public repositories, remembers what matters, and when the work is clear enough it hands Jules a self-contained brief - with your explicit approval. Jules writes the code and opens the pull request.

Jules+ talks to the **real Jules API** (`https://jules.googleapis.com/v1alpha`) and the **real NVIDIA AI Builder API** (`https://integrate.api.nvidia.com/v1`). There is no mocked session, repository, or model data anywhere in the app: every control calls a route handler, which calls a live upstream.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · shadcn/ui + Radix · TanStack Query · React Hook Form · Zod · Mongoose · Lucide icons

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the two required values
npm run dev
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGO_URI` | yes | MongoDB connection string. Server-only. |
| `JULES_KEY_ENCRYPTION_SECRET` | yes | High-entropy 32-byte secret used to derive the AES-256-GCM keys for **both** stored API keys. Server-only. |
| `APP_URL` | no | Absolute base URL of the deployment. |
| `GITHUB_TOKEN` | no | Raises the agent's public-GitHub read limit from 60 to 5,000 requests/hour. No scopes needed. |
| `NVIDIA_API_BASE_URL` | no | Point the agent at a self-hosted NIM container instead of the hosted endpoint. |

Neither API key is an environment variable. Both are entered in the app, validated against the live API, then encrypted and stored in MongoDB.

Generate the encryption secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

If either required variable is missing, the app renders an explicit configuration screen instead of failing silently.

### Connecting Jules

On first load you get a full-screen setup gate:

1. Create an API key in [Jules Settings](https://jules.google.com/settings) (max 3 keys).
2. Install the Jules GitHub App and grant it repository access.
3. Paste the key. It is validated against `GET /sources?pageSize=1` **before** anything is written to the database.

### Connecting NVIDIA

The chat agent needs its own key, added in **Settings -> NVIDIA AI Builder**:

1. Create a free key at [build.nvidia.com](https://build.nvidia.com) (they start with `nvapi-`).
2. Paste it. It is validated with a 1-token inference call **before** anything is written to the database.

`GET /v1/models` is public on that endpoint, so it cannot distinguish a good key from a bad one - only a real inference call can. That is why validation costs one token instead of being a free list call.

Removing the NVIDIA key disables only the chat agent; Jules, memory, and projects keep working.

## Security model

- The API key is only ever handled server-side. It is never sent to the browser, `localStorage`, logs, or client-side env vars.
- Stored with **AES-256-GCM**. The cipher key is derived from `JULES_KEY_ENCRYPTION_SECRET` via HKDF-SHA256; the raw env secret is never used directly as a key.
- A fresh random 12-byte IV is generated on every write. Ciphertext, IV, and auth tag are stored in separate fields, so tampering fails closed on decrypt.
- **The two keys are encrypted under different derived keys.** `crypto.server.ts` scopes HKDF by purpose (`jules-plus:jules-api-key:v1` vs `jules-plus:nvidia-api-key:v1`), so a ciphertext cannot be moved from one field to the other, even though both come from one env secret.
- Decryption happens only inside `lib/jules-client.server.ts` and `lib/nvidia-client.server.ts`. All DB/crypto/upstream modules use `import "server-only"` guards.
- **The agent cannot act without approval.** `start_jules` and `stop_jules` pause the loop and surface a confirmation card. On approval the tool arguments are re-read **from the server-held transcript**, not from the client payload, so a tampered client cannot swap in a different brief or repository.
- **The system prompt is never client-supplied.** `chatRequestSchema` rejects `role: "system"` outright and the prompt is rebuilt server-side on every turn.
- **The agent reads public GitHub only**, via GET requests, with path-traversal rejection, private-repo refusal, and size caps on every payload.
- Upstream errors are sanitized before reaching the client. Non-JSON upstream bodies are discarded rather than forwarded, and log output is scrubbed of connection strings, API keys, and auth headers.
- An invalid key is never persisted.

## Real-time behaviour

Jules is asynchronous and exposes **no WebSocket or streaming API**, so "real-time" is adaptive polling:

| What | Interval |
| --- | --- |
| Active session detail + activities | 4s |
| Sessions list, while any session is active | 10s |
| Anything settled (completed / failed / idle) | 30s |
| Terminal session detail (completed / failed) | stopped |
| Tab hidden (`document.visibilityState === "hidden"`) | paused, immediate refetch on return |

Requests carry an `AbortSignal` from TanStack Query, so in-flight requests are cancelled on unmount and identical in-flight requests are deduplicated rather than overlapping.

## API routes

All Jules traffic is proxied; the browser never holds a key.

| Route | Methods | Upstream |
| --- | --- | --- |
| `/api/settings/jules-key/test` | GET | — (returns `{ configured }` only) |
| `/api/settings/jules-key` | POST, DELETE | `GET /sources?pageSize=1` for validation |
| `/api/sources` | GET | `sources.list` (`pageSize`, `pageToken`, `filter`) |
| `/api/sources/[...sourceName]` | GET | `sources.get` |
| `/api/sessions` | GET, POST | `sessions.list`, `sessions.create` |
| `/api/sessions/[sessionName]` | GET | `sessions.get` |
| `/api/sessions/[sessionName]/activities` | GET | `sessions.activities.list` |
| `/api/sessions/[sessionName]/approve-plan` | POST | `sessions.approvePlan` |
| `/api/sessions/[sessionName]/messages` | POST | `sessions.sendMessage` |
| `/api/memory`, `/api/memory/[id]` | GET, POST, PATCH, DELETE | MongoDB only |
| `/api/preferences` | GET, PATCH | MongoDB only |
| `/api/settings/nvidia-key/test` | GET | — (returns `{ configured, defaultModel }` only) |
| `/api/settings/nvidia-key` | POST, DELETE | 1-token `POST /v1/chat/completions` for validation |
| `/api/nvidia/models` | GET, POST | `GET /v1/models`, intersected with the curated catalog |
| `/api/chat` | POST | `POST /v1/chat/completions` with tools, plus Jules/GitHub/Mongo via tools |
| `/api/projects`, `/api/projects/[id]` | GET, POST, PATCH, DELETE | MongoDB only |

### Notes on the upstream API

A few details differ from what you might assume, and shaped the implementation:

- **`sessions.list` has no `filter` parameter** — only `pageSize` and `pageToken`. The `?source=` filter on `/api/sessions` is therefore applied in the route handler after fetching a page. (`sources.list` *does* support an AIP-160 `filter`, name-only.)
- **`Session` has no `branch` field.** The branch lives at `sourceContext.githubRepoContext.startingBranch`, and the PR URL at `outputs[].pullRequest.url`. Both are flattened by the normalizer.
- **`GitHubRepoContext.startingBranch` is required upstream.** When the client doesn't pick a branch, `POST /api/sessions` resolves the repository's default branch first.
- **`approvePlan` takes an empty body and returns an empty body**; `sendMessage` returns an empty body too. Neither reflects its result, so the UI relies on the activities poll.
- **Session routes use a single dynamic segment, not a catch-all.** Jules session names are always `sessions/{session}` with no nested slashes, and Next.js only allows a catch-all as the *final* path segment — nesting `/activities` under `[...sessionName]` breaks the router at runtime. Sources do need `[...sourceName]`, since names look like `sources/github/owner/repo`.

## The NVIDIA agent

### Model picker

The composer's branch selector was replaced by a model picker. Messages there go to the
agent rather than straight to Jules, so the model matters at send time; the branch only
matters when a Jules task actually starts, and defaults to the repository's default
branch (overridable by the agent or the repo picker).

`lib/nvidia-models.ts` holds a curated catalog of tool-calling-capable models, and
`GET /api/nvidia/models` intersects it with the live `GET /v1/models` response - a model
NVIDIA retires simply stops being offered instead of failing mid-conversation. Your
selection is persisted server-side and restored on the next visit.

Publisher marks are vendored into `public/model-icons/` (mostly from
[svgl.app](https://svgl.app); see `ATTRIBUTION.md` there). A publisher with no authentic
mark available gets a generated monogram tile rather than borrowing another company's
logo.

### Tools

The split is deliberate: **the agent plans and gathers context, Jules writes code.** The
system prompt leans hard on that, because the common failure mode is a model trying to
emit patches instead of briefing Jules.

| Tool | Gated | What it does |
| --- | --- | --- |
| `list_repositories` | | Repositories connected to Jules |
| `get_repository_overview` | | Public repo metadata + README excerpt |
| `list_repository_files` | | One directory level |
| `read_repository_file` | | One text file, truncated at 8k chars |
| `list_repository_issues` | | Recent issues, PRs filtered out |
| `list_memory` / `save_memory` | | Read and persist durable facts |
| `list_projects` / `save_project_info` | | Read and update project records |
| `list_jules_sessions` / `get_jules_session` | | Jules task state |
| `start_jules` | **yes** | Creates a Jules session |
| `stop_jules` | **yes** | Asks a session to stop, untracks it |

Read-only and memory tools execute automatically. The two gated tools pause the loop and
render a confirmation card; nothing that spends Jules capacity happens without a tap.

Every tool call is rendered in the UI as a step in an action trail with a running /
done / failed / skipped state. Nothing the agent does is invisible.

### Turn structure

`POST /api/chat` is stateless - the client owns the transcript and posts it back each
turn. One turn loops: satisfy any outstanding tool call, else ask the model, until the
model replies with prose or a gated tool pauses it. Capped at 6 model calls per turn, and
a truncated turn says so rather than hanging.

Tool failures are returned to the model as `ok: false` with a readable message instead of
throwing, so it can explain the problem and try another approach. Requesting a tool that
needs an unconfigured upstream degrades to that message rather than a 500.

### `stop_jules` is honest about its limits

The Jules v1alpha API exposes **no cancel, abort, or delete method**. `stop_jules`
therefore sends an explicit stop instruction to the session and marks it stopped in the
project record. It cannot forcibly kill a step already in flight, and both the tool
description and the confirmation card say so.

## Projects

A "project" is a Jules+ concept: the working context the agent accumulates for one
repository - the goal, a rolling summary, structured facts, the working branch, and every
Jules run it started. It is upserted on `source` (unique index), so the agent can record
what it learns repeatedly across a conversation without creating duplicates.

The **Projects** tab lists `active` projects only, which is the point of the tab; paused
and finished work sits behind an "All" toggle. Starting a Jules run reactivates a
project; when every tracked run has stopped, it drops to `paused`.

The sidebar's repository list used to be headed "Projects" and is now "Repositories" -
two different meanings of the word in one sidebar was confusing.

## Navigation and honest scope

`New Task` is the agent chat. `Repositories` and `Dashboard` map directly onto Jules resources.

The Jules alpha API has no endpoint for skills, memory, projects, or scheduling, so rather than ship decorative UI:

- **Memory** is a real feature backed by your MongoDB. Pinned notes are appended to the prompt when a Jules task starts, and the agent writes to it as you talk.
- **Projects** is a real feature backed by your MongoDB, maintained by the agent.
- **Automations** sets the two automation fields the session API *does* support: `automationMode` (`AUTO_CREATE_PR`) and `requirePlanApproval`, persisted as defaults.
- **Skills & Plugins** reports live integration state (API key + GitHub App repository access) and says plainly that no plugin API exists yet.

## Accessibility

Semantic buttons, 44px minimum touch targets, visible focus rings, `aria-live` status regions, labelled controls, skeleton/empty/error states, full keyboard support, and `prefers-reduced-motion` handling. The drawer traps focus and closes on overlay click, `Escape`, or its close button. Layout is verified free of horizontal overflow from 320px upward.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run start      # serve the production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

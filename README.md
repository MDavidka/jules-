# Jules DeepDive

A mobile-first research workspace for the [Google Jules](https://jules.google.com) coding agent. Investigate repositories, start tasks, approve plans, and follow live progress.

Jules DeepDive talks to the **real Jules API** (`https://jules.googleapis.com/v1alpha`). There is no mocked session or repository data anywhere in the app: every control calls a route handler, which calls Jules.

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
| `JULES_KEY_ENCRYPTION_SECRET` | yes | High-entropy 32-byte secret used to derive the AES-256-GCM key. Server-only. |
| `APP_URL` | no | Absolute base URL of the deployment. |

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
4. Connect a GitHub account through `/api/github/connect`. The callback stores the OAuth token encrypted; `/api/github/status` performs a live `GET https://api.github.com/user` check and reports the account login, OAuth scopes, and repository-read capability without exposing the token.

The GitHub connection requests `read:user repo`. The `repo` scope is required when the agent must inspect private repositories. A token merely existing in MongoDB is not considered connected if GitHub rejects it or the account lacks a repository-read scope.

## Security model

- The API key is only ever handled server-side. It is never sent to the browser, `localStorage`, logs, or client-side env vars.
- Stored with **AES-256-GCM**. The cipher key is derived from `JULES_KEY_ENCRYPTION_SECRET` via HKDF-SHA256; the raw env secret is never used directly as a key.
- A fresh random 12-byte IV is generated on every write. Ciphertext, IV, and auth tag are stored in separate fields, so tampering fails closed on decrypt.
- Decryption happens only inside `lib/jules-client.server.ts`. All DB/crypto/Jules modules use `import "server-only"` guards.
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
| `/api/github/connect` | GET | Starts GitHub OAuth with CSRF state protection |
| `/api/github/callback` | GET | Exchanges the OAuth code and stores the encrypted token |
| `/api/github/status` | GET | Live-validates the connected GitHub account |

### Repository MCP tools

The research agent uses an in-process read-only MCP server. It exposes `validate_github_connection`, `list_repository_files`, `inspect_repository`, and `read_repository_file`. The last tool retrieves the exact text from `raw.githubusercontent.com`, reports the repository, ref, path, source, and truncation state, and accepts an optional branch, tag, or commit SHA. The agent is instructed to list files first and use the raw-file tool rather than infer content from filenames or summaries.

### Notes on the upstream API

A few details differ from what you might assume, and shaped the implementation:

- **`sessions.list` has no `filter` parameter** — only `pageSize` and `pageToken`. The `?source=` filter on `/api/sessions` is therefore applied in the route handler after fetching a page. (`sources.list` *does* support an AIP-160 `filter`, name-only.)
- **`Session` has no `branch` field.** The branch lives at `sourceContext.githubRepoContext.startingBranch`, and the PR URL at `outputs[].pullRequest.url`. Both are flattened by the normalizer.
- **`GitHubRepoContext.startingBranch` is required upstream.** When the client doesn't pick a branch, `POST /api/sessions` resolves the repository's default branch first.
- **`approvePlan` takes an empty body and returns an empty body**; `sendMessage` returns an empty body too. Neither reflects its result, so the UI relies on the activities poll.
- **Session routes use a single dynamic segment, not a catch-all.** Jules session names are always `sessions/{session}` with no nested slashes, and Next.js only allows a catch-all as the *final* path segment — nesting `/activities` under `[...sessionName]` breaks the router at runtime. Sources do need `[...sourceName]`, since names look like `sources/github/owner/repo`.

## Navigation and honest scope

`New Task`, `Repositories`, and `Dashboard` map directly onto Jules resources.

The Jules alpha API has no endpoint for skills, memory, or scheduling, so rather than ship decorative UI:

- **Memory** is a real feature backed by your MongoDB. Pinned notes are appended to the prompt when you start a task.
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

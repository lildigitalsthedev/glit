## GitPush — V1 build plan

Scope confirmed: core push flow **plus** repository file browsing and editing. Visual direction: **Terminal Pro** (near-black `#0D0D0D` surfaces, `#141414` panels, cyan `#00F0FF` accent, JetBrains Mono + Inter, dense three-pane IDE shell).

### One thing you need to decide/provide

There is no managed GitHub connector available for per-user sign-in, so per-user GitHub OAuth needs **your own GitHub OAuth App** (2 minutes on GitHub: Settings → Developer settings → OAuth Apps). I'll wire the flow and then ask you for the Client ID and Client Secret, stored as server-side secrets. Callback URL will be `https://<your-app>/api/public/github/callback`.

Until those secrets exist, I'll also ship the PAT path so you can use the app immediately (paste a fine-grained token, stored encrypted, only ever shown as `••••abcd`).

### What gets built

**1. Backend (Lovable Cloud)**
- Enable Cloud with email/password + Google sign-in.
- Tables (all RLS-scoped to `auth.uid()`, with grants): `profiles`, `github_accounts` (login, avatar, display name, encrypted token, token type, last_sync), `repositories` cache, `favorite_repos`, `favorite_paths`, `recent_pushes`, `drafts`, `user_preferences`.
- Tokens encrypted with AES-256-GCM server-side; never returned to the browser.

**2. GitHub access layer (server-only)**
Server functions for: list repos, list branches, read tree, read file contents, create/update file, commit history. Every call loads the caller's decrypted token, verifies the account row belongs to the caller, then hits the GitHub REST API. No GitHub call ever happens from the browser.

**3. Auth + onboarding**
- `/auth` — email/password + Google, in the Terminal Pro register.
- After sign-in, `/connect` prompts GitHub connection (OAuth primary button, "Advanced: use a Personal Access Token" secondary).
- Connection management: rename, reconnect, replace token, delete, per-account repo count and last sync.

**4. Workspace (`/` → the app shell from the chosen direction)**
- Left sidebar: accounts, favorites, recent repos, settings, version/status footer.
- Header: `owner / repo` breadcrumb + branch chip + branch switcher/refresh.
- File tree pane: repo tree, instant filter, click to open a file into the editor.
- Editor pane: Monaco (dark theme, line numbers, word wrap, language detection from extension, autocomplete, find/replace) with file tabs; drag-and-drop or browse to upload a text file into the editor; new-file mode with a filename field that supports nested paths (`ui/Button.tsx` under `src/components` → creates `src/components/ui/Button.tsx`, folders implicit via the Contents API).
- Right panel: change summary + line-level diff (current vs incoming, additions/deletions highlighted), commit message + optional description, `PUSH TO MAIN`-style primary action with Push Anyway / Cancel on the diff.
- Status bar: sync state, pending change count, cursor position.

**5. Push workflow**
Validate account → repo → branch → path → check file existence (get SHA) → create or update with the commit message → success animation → write a `recent_pushes` row. Detailed, readable errors on 401/403/404/409 (bad token, missing scope, protected branch, stale SHA).

**6. Repository browser & history**
- `/repos` — searchable, sortable repo cards (name, owner, private/public badge, default branch, last updated, description, favorite star). Selection is remembered per user.
- `/activity` — recent pushes table (repo, branch, path, message, date, status) with reopen.
- `/settings` — theme, editor font size, tab width, word wrap, auto-save drafts, default branch, default working folder, GitHub connections.
- `Cmd/Ctrl+K` command palette searching repos, files, recent paths, favorites. Toasts via sonner.

### Deliberately deferred to a follow-up
ZIP upload/extract, bulk multi-file push, Prettier formatting, markdown preview, file rename/duplicate/delete, one-click rollback, offline drafts, compare revisions, GitLab/Bitbucket/orgs, and all AI features.

### Technical notes
- TanStack Start; every GitHub/token operation in `createServerFn` handlers or `src/routes/api/public/github/callback`; Monaco loaded client-only after hydration so SSR isn't broken.
- Terminal Pro tokens go into `src/styles.css` as oklch semantic tokens (`--background`, `--card`, `--accent`, `--border`, `--muted-foreground`), fonts via `<link>` in `__root.tsx`. Components use tokens only, no hardcoded colors.

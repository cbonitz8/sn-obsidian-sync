# ServiceNow Obsidian Sync

Bidirectional sync between an Obsidian vault and a ServiceNow Scripted REST API. Devs write documentation in Obsidian with full markdown support, and the plugin keeps everything in sync with ServiceNow for shared team visibility.

## What It Does

- **Bidirectional sync** — edits in Obsidian push to SN, edits in SN pull to Obsidian
- **OAuth 2.0 authentication** — each user authenticates individually, SN knows who made each change
- **Automatic or manual sync** — configurable interval (default 30s) or on-demand via command palette
- **Document locking** — auto-checkout on edit prevents conflicting changes; git-style conflict markers as fallback
- **Content-aware sync** — compares actual content, not just timestamps, to avoid false conflicts from metadata-only SN changes
- **Folder structure from metadata** — documents are organized into project/category folders automatically based on SN fields
- **Frontmatter tracking** — each file has `sn_sys_id`, `sn_category`, `sn_project`, `sn_tags`, `sn_synced` in YAML frontmatter
- **Live metadata from SN** — categories, projects, and tags are fetched from the instance, not hardcoded

## Architecture

Six core modules composed by the main plugin class:

| Module | Responsibility |
|--------|---------------|
| `AuthManager` | OAuth 2.0 flow — authorize, store tokens, auto-refresh |
| `ApiClient` | Wraps all REST calls (CRUD, checkout/checkin, getChanges, metadata) |
| `SyncEngine` | Orchestrates pull/push cycles, bulk push, initial pull |
| `FileWatcher` | Monitors vault for creates/edits/deletes, debounces, flags dirty files |
| `FrontmatterManager` | Reads/writes SN frontmatter fields via Obsidian API |
| `ConflictResolver` | Detects conflicts, injects git-style markers for manual resolution |

## Setup

### 1. ServiceNow Side

The plugin requires a Scripted REST API on your SN instance. See [`docs/sn-side-implementation.md`](docs/sn-side-implementation.md) for complete setup instructions including:

- Scripted REST API with 10 endpoints (CRUD, checkout/checkin, getChanges, metadata)
- OAuth Application registration
- Table schema (your custom table with category, project, tags, content, locking fields)
- Choice values for categories and projects
- ACLs

**Required endpoints:**

| Operation | Method | Path |
|-----------|--------|------|
| List docs | GET | `/documents` |
| Get doc | GET | `/documents/{id}` |
| Create doc | POST | `/documents` |
| Update doc | PUT | `/documents/{id}` |
| Delete doc | DELETE | `/documents/{id}` |
| Get changes | GET | `/documents/changes?since={ts}` |
| Checkout | POST | `/documents/{id}/checkout` |
| Checkin | POST | `/documents/{id}/checkin` |
| Force checkin | POST | `/documents/{id}/force-checkin` |
| Metadata | GET | `/metadata` |

### 2. OAuth Application

Register in SN at **System OAuth > Application Registry > New > Create an OAuth API endpoint for external clients**:

| Field | Value |
|-------|-------|
| Name | `Obsidian Sync` |
| Redirect URL | `obsidian://sn-obsidian-sync/callback` |
| Active | true |

Copy the generated **Client ID** and **Client Secret** for the plugin settings.

### 3. Install the Plugin

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/sn-obsidian-sync/` directory. Enable the plugin in Obsidian settings.

### 4. Configure

In the plugin settings:

| Setting | What to enter |
|---------|--------------|
| Instance URL | Your SN instance (e.g., `https://yourinstance.service-now.com`) |
| API path | Base path for your Scripted REST API (e.g., `/api/x_your_scope/your_api`) |
| Metadata path | Path for the metadata endpoint (default: `/metadata`) |
| OAuth Client ID | From the OAuth app you registered |
| OAuth Client Secret | From the OAuth app you registered |

Click **Authenticate** — your browser will open to the SN login page. After granting access, you'll be redirected back to Obsidian.

### 5. Verify Connection

In settings, scroll to **ServiceNow Data** and click **Fetch from SN**. You should see your categories, projects, and tags listed.

### 6. Initial Sync

If you're starting with an empty SN instance and existing vault docs:
1. Ensure all files have `sn_category` and `sn_project` in frontmatter
2. Run **Cmd+P > "Bulk push"** to upload everything to SN

If you're starting with existing SN docs and an empty vault:
1. Run **Cmd+P > "Initial pull"** to download all documents

## Metadata Response Shape

The plugin fetches metadata from your SN instance to populate dropdowns for categories, projects, and tags. You implement a metadata endpoint on your instance (at the `metadataPath` configured in settings) that returns JSON in this shape:

```json
{
  "result": {
    "categories": [
      { "value": "category_key", "label": "Display Name" }
    ],
    "projects": [
      { "value": "project_key", "label": "Display Name" }
    ],
    "tags": ["tag1", "tag2"]
  }
}
```

The `categories` and `projects` arrays contain objects with a `value` (the internal key stored in frontmatter) and a `label` (the human-readable name shown in the UI). The `tags` array is a flat list of strings.

If your metadata is static, you can hardcode the arrays in your Scripted REST resource — the plugin just needs the response in this shape. For dynamic metadata, query your choice lists or configuration tables and build the response at runtime.

## Sync Behavior

### Sync Cycle

Pull always runs before push. Every cycle:

1. **Pull** — fetch docs changed since last sync via `getChanges`
   - Same content as local → update frontmatter only (no false conflict)
   - Different content, local is clean → overwrite local
   - Different content, local is dirty → inject conflict markers
   - New doc → create local file per folder mapping

2. **Push** — find all files with `sn_synced: false`
   - Has `sn_sys_id` → checkout, update, checkin
   - No `sn_sys_id` but has metadata → create in SN automatically
   - No `sn_sys_id` and no metadata → prompt via modal

### Conflict Resolution

**Primary:** locking. The plugin calls checkout when you edit a file. Other users see it as locked.

**Fallback:** if a push fails because the remote changed (lock expired, force-released), the plugin compares content. If identical, it re-acquires the lock and pushes. If different, it injects git-style markers:

```
<<<<<<< Local (Obsidian)
Your local content
=======
Remote content from ServiceNow
>>>>>>> Remote (ServiceNow)
```

Resolve manually, then the next sync pushes the resolved version.

### Delete Handling

**Local delete** (configurable):
- `ignore` (default) — don't re-pull, SN record untouched
- `re-pull` — re-download from SN next cycle
- `archive` — add to ignore list

**Remote delete** (configurable):
- `delete local` (default) — remove the local file
- `keep local` — keep file, clear `sn_sys_id` (becomes unlinked)

## Folder Structure

Documents are placed based on their SN metadata:

```
{Project}/
  Session Logs/
  Design Specs/
Daily Logs/
QA/
  In Progress/
  Complete/
Resources/
  Components/
  CSS/
```

The folder mapping is configurable in settings. The default maps:
- `session_log` → `Session Logs/`
- `design_spec` → `Design Specs/`
- `daily_log` → `Daily Logs/`
- `project_overview` → project root
- `qa_document` → `QA/` with `In Progress/` and `Complete/` subfolders
- `reference` → `Resources/`

## Frontmatter

The plugin manages these fields (prefix configurable, default `sn_`):

```yaml
---
sn_sys_id: abc123def456789
sn_category: session_log
sn_project: my_project
sn_tags: "archived, complete"
sn_synced: true
---
```

- `sn_sys_id` — link to the SN record, written after first push
- `sn_category` — SN choice value (e.g., `session_log`, `design_spec`)
- `sn_project` — SN choice value (e.g., `my_project`, `another_project`)
- `sn_tags` — comma-separated
- `sn_synced` — `false` on local edit, `true` after successful push

## Commands

| Command | Description |
|---------|-------------|
| Sync now | Run a pull/push cycle immediately |
| Initial pull | Download all documents from SN (first-time setup) |
| Bulk push | Upload all unsynced documents to SN |

Also: click the status bar item ("SN: synced") to trigger a manual sync.

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production build
npm test         # run unit tests
```

### Project Structure

```
src/
  main.ts                 # Plugin entry, composes modules
  types.ts                # Shared interfaces
  settings.ts             # Settings interface + tab UI
  auth-manager.ts         # OAuth 2.0 flow
  api-client.ts           # REST calls
  sync-engine.ts          # Pull/push orchestration
  file-watcher.ts         # Vault event monitoring
  frontmatter-manager.ts  # YAML frontmatter read/write
  conflict-resolver.ts    # Conflict detection + markers
  new-doc-modal.ts        # New document metadata prompt
  folder-mapper.ts        # Folder placement logic
```

## License

GPL-3.0

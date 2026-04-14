# Phase 2: Pull-Phase Section Merge Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Phase 1 section merge engine into the sync engine's pull path, with client-side base caching, type cleanups, and section-aware conflict display.

**Architecture:** Base cache stores last-synced body per doc via Obsidian's adapter API. On pull conflict, sync engine parses both sides into sections and runs three-way merge. Auto-merged results write back silently; true conflicts pass section detail to ConflictModal. Three type cleanups (shared `stripFrontmatter`, typed `applyConflict`, API payload types) are prerequisite work.

**Tech Stack:** TypeScript, vitest, Obsidian Plugin API (`app.vault.adapter`)

**Design spec:** `docs/2026-04-13-section-merge-phase2-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types.ts` | Modify | Add `sectionConflicts?` to `ConflictEntry`, add `CreateDocumentPayload`/`UpdateDocumentPayload` |
| `src/frontmatter-manager.ts` | Modify | Export standalone `stripFrontmatter()` function |
| `src/conflict-resolver.ts` | Modify | `applyConflict(entry: ConflictEntry)`, import shared `stripFrontmatter`, accept `BaseCache`, update base on resolution |
| `src/conflict-modal.ts` | Modify | Import shared `stripFrontmatter`, render section conflict detail |
| `src/api-client.ts` | Modify | Use `CreateDocumentPayload`/`UpdateDocumentPayload` types |
| `src/base-cache.ts` | Create | Client-side base content cache via Obsidian adapter |
| `src/base-cache.test.ts` | Create | Tests for base cache |
| `src/sync-engine.ts` | Modify | Import shared `stripFrontmatter`, accept `BaseCache`, wire section merge into pull path |
| `src/main.ts` | Modify | Instantiate `BaseCache`, pass to `SyncEngine` and `ConflictResolver` |

---

### Task 1: Type cleanups — `types.ts` and `api-client.ts`

**Files:**
- Modify: `src/types.ts`
- Modify: `src/api-client.ts`

- [ ] **Step 1: Add `sectionConflicts` to `ConflictEntry` and API payload types**

In `src/types.ts`, modify the `ConflictEntry` interface and add payload types:

```typescript
// Modify existing ConflictEntry — add sectionConflicts field:
export interface ConflictEntry {
  sysId: string;
  path: string;
  remoteContent: string;
  remoteTimestamp: string;
  lockedBy: string;
  sectionConflicts?: SectionConflict[];
}

// Add after SyncResult (end of existing types, before section merge types):
export type CreateDocumentPayload = Pick<SNDocument, "title" | "content" | "category" | "project" | "tags">;
export type UpdateDocumentPayload = Partial<CreateDocumentPayload>;
```

- [ ] **Step 2: Update `api-client.ts` to use payload types**

In `src/api-client.ts`, add the import and update signatures:

```typescript
// Update import line:
import type { CreateDocumentPayload, UpdateDocumentPayload, SNDocument, SNMetadata } from "./types";

// Replace createDocument signature (line 74):
async createDocument(doc: CreateDocumentPayload): Promise<ApiResponse<SNDocument>> {
  return this.request<SNDocument>("POST", "/documents", doc);
}

// Replace updateDocument signature (line 84):
async updateDocument(id: string, doc: UpdateDocumentPayload): Promise<ApiResponse<SNDocument>> {
  return this.request<SNDocument>("PUT", `/documents/${id}`, doc);
}
```

- [ ] **Step 3: Verify build**

Run: `cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync" && npx tsc --noEmit --skipLibCheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync"
git add src/types.ts src/api-client.ts
git commit -m "refactor: add sectionConflicts to ConflictEntry, typed API payloads"
```

---

### Task 2: Extract shared `stripFrontmatter`

**Files:**
- Modify: `src/frontmatter-manager.ts`
- Modify: `src/sync-engine.ts`
- Modify: `src/conflict-resolver.ts`
- Modify: `src/conflict-modal.ts`

- [ ] **Step 1: Add exported function to `frontmatter-manager.ts`**

Add at the top of `src/frontmatter-manager.ts`, before the class definition:

```typescript
export function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const endIdx = content.indexOf("\n---", 3);
  if (endIdx === -1) return content;
  return content.slice(endIdx + 4).replace(/^\n+/, "");
}
```

- [ ] **Step 2: Update `sync-engine.ts` — remove private method, import shared**

In `src/sync-engine.ts`:

Add to imports at top:
```typescript
import { stripFrontmatter } from "./frontmatter-manager";
```

Delete the private `stripFrontmatter` method (lines 682-687):
```typescript
// DELETE this entire method:
  private stripFrontmatter(content: string): string {
    if (!content.startsWith("---")) return content;
    const endIdx = content.indexOf("\n---", 3);
    if (endIdx === -1) return content;
    return content.slice(endIdx + 4).replace(/^\n+/, "");
  }
```

Replace all `this.stripFrontmatter(` with `stripFrontmatter(` throughout the file. There are 3 call sites:
- Line 383: `const contentChanged = localBody !== this.stripFrontmatter(doc.content);`
- Line 494: `if (this.stripFrontmatter(latest.data.content) === this.stripFrontmatter(content)) {`

- [ ] **Step 3: Update `conflict-resolver.ts` — remove method, import shared**

In `src/conflict-resolver.ts`:

Add to imports at top:
```typescript
import { stripFrontmatter } from "./frontmatter-manager";
```

Delete the `stripFrontmatter` method (lines 162-167):
```typescript
// DELETE this entire method:
  stripFrontmatter(raw: string): string {
    if (!raw.startsWith("---")) return raw;
    const endIdx = raw.indexOf("\n---", 3);
    if (endIdx === -1) return raw;
    return raw.slice(endIdx + 4).replace(/^\n+/, "");
  }
```

Replace `this.stripFrontmatter(` with `stripFrontmatter(` in `clearStaleConflicts()` (2 calls at lines 136-137).

- [ ] **Step 4: Update `conflict-modal.ts` — remove method, import shared**

In `src/conflict-modal.ts`:

Add to imports at top:
```typescript
import { stripFrontmatter } from "./frontmatter-manager";
```

Delete the private `stripFrontmatter` method (lines 131-136):
```typescript
// DELETE this entire method:
  private stripFrontmatter(raw: string): string {
    if (!raw.startsWith("---")) return raw;
    const endIdx = raw.indexOf("\n---", 3);
    if (endIdx === -1) return raw;
    return raw.slice(endIdx + 4).replace(/^\n+/, "");
  }
```

Replace `this.stripFrontmatter(` with `stripFrontmatter(` (2 calls at lines 57-58).

- [ ] **Step 5: Run tests + type check**

Run: `cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync" && npx vitest run && npx tsc --noEmit --skipLibCheck`
Expected: All tests pass, no type errors

- [ ] **Step 6: Commit**

```bash
cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync"
git add src/frontmatter-manager.ts src/sync-engine.ts src/conflict-resolver.ts src/conflict-modal.ts
git commit -m "refactor: extract shared stripFrontmatter to frontmatter-manager"
```

---

### Task 3: Refactor `applyConflict` to accept typed `ConflictEntry`

**Files:**
- Modify: `src/conflict-resolver.ts`
- Modify: `src/sync-engine.ts`

- [ ] **Step 1: Change `applyConflict` signature in `conflict-resolver.ts`**

In `src/conflict-resolver.ts`, replace the method at line 42:

```typescript
// BEFORE:
  applyConflict(sysId: string, path: string, remoteContent: string, remoteTimestamp: string, lockedBy: string) {
    const conflict: ConflictEntry = { sysId, path, remoteContent, remoteTimestamp, lockedBy };
    this.plugin.syncState.conflicts[sysId] = conflict;
    new ConflictModal(this.plugin, conflict).open();
  }

// AFTER:
  applyConflict(entry: ConflictEntry) {
    this.plugin.syncState.conflicts[entry.sysId] = entry;
    new ConflictModal(this.plugin, entry).open();
  }
```

- [ ] **Step 2: Update call sites in `sync-engine.ts`**

In `src/sync-engine.ts`, update both `applyConflict` calls:

**Pull path** (line 390):
```typescript
// BEFORE:
this.conflictResolver.applyConflict(doc.sys_id, mapEntry.path, doc.content, doc.sys_updated_on, doc.checked_out_by || "");

// AFTER:
this.conflictResolver.applyConflict({
  sysId: doc.sys_id,
  path: mapEntry.path,
  remoteContent: doc.content,
  remoteTimestamp: doc.sys_updated_on,
  lockedBy: doc.checked_out_by || "",
});
```

**Push path** (line 502):
```typescript
// BEFORE:
this.conflictResolver.applyConflict(fm.sys_id, file.path, latest.data.content, latest.data.sys_updated_on, latest.data.checked_out_by || "");

// AFTER:
this.conflictResolver.applyConflict({
  sysId: fm.sys_id!,
  path: file.path,
  remoteContent: latest.data.content,
  remoteTimestamp: latest.data.sys_updated_on,
  lockedBy: latest.data.checked_out_by || "",
});
```

- [ ] **Step 3: Run tests + type check**

Run: `cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync" && npx vitest run && npx tsc --noEmit --skipLibCheck`
Expected: All tests pass, no type errors

- [ ] **Step 4: Commit**

```bash
cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync"
git add src/conflict-resolver.ts src/sync-engine.ts
git commit -m "refactor: applyConflict takes typed ConflictEntry object"
```

---

### Task 4: Base cache module

**Files:**
- Create: `src/base-cache.ts`
- Create: `src/base-cache.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/base-cache.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { BaseCache } from "./base-cache";

// Minimal mock of Obsidian's DataAdapter
function createMockAdapter() {
  const store = new Map<string, string>();
  return {
    store,
    async read(path: string): Promise<string> {
      const data = store.get(path);
      if (data === undefined) throw new Error("File not found");
      return data;
    },
    async write(path: string, data: string): Promise<void> {
      store.set(path, data);
    },
  };
}

function createMockApp(adapter: ReturnType<typeof createMockAdapter>) {
  return {
    vault: {
      adapter,
      configDir: ".obsidian",
    },
  } as unknown as import("obsidian").App;
}

describe("BaseCache", () => {
  let adapter: ReturnType<typeof createMockAdapter>;
  let cache: BaseCache;

  beforeEach(() => {
    adapter = createMockAdapter();
    const app = createMockApp(adapter);
    cache = new BaseCache(app, "sn-obsidian-sync");
  });

  it("returns null for unknown sysId", async () => {
    expect(await cache.loadBase("unknown")).toBeNull();
  });

  it("round-trips save and load", async () => {
    await cache.saveBase("abc123", "hello world");
    expect(await cache.loadBase("abc123")).toBe("hello world");
  });

  it("overwrites existing base", async () => {
    await cache.saveBase("abc123", "version 1");
    await cache.saveBase("abc123", "version 2");
    expect(await cache.loadBase("abc123")).toBe("version 2");
  });

  it("removes base", async () => {
    await cache.saveBase("abc123", "content");
    await cache.removeBase("abc123");
    expect(await cache.loadBase("abc123")).toBeNull();
  });

  it("persists to adapter as JSON", async () => {
    await cache.saveBase("id1", "body1");
    const raw = adapter.store.get(".obsidian/plugins/sn-obsidian-sync/sync-base-cache.json");
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed["id1"]).toBe("body1");
  });

  it("loads from existing cache file on first access", async () => {
    adapter.store.set(
      ".obsidian/plugins/sn-obsidian-sync/sync-base-cache.json",
      JSON.stringify({ existing: "data" })
    );
    const freshCache = new BaseCache(createMockApp(adapter), "sn-obsidian-sync");
    expect(await freshCache.loadBase("existing")).toBe("data");
  });

  it("handles corrupt cache file gracefully", async () => {
    adapter.store.set(
      ".obsidian/plugins/sn-obsidian-sync/sync-base-cache.json",
      "not valid json{{"
    );
    const freshCache = new BaseCache(createMockApp(adapter), "sn-obsidian-sync");
    expect(await freshCache.loadBase("anything")).toBeNull();
  });

  it("handles missing cache file gracefully", async () => {
    // adapter has no file — read will throw
    expect(await cache.loadBase("anything")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync" && npx vitest run src/base-cache.test.ts`
Expected: FAIL — module `./base-cache` not found

- [ ] **Step 3: Implement base cache**

Create `src/base-cache.ts`:

```typescript
import type { App } from "obsidian";

export class BaseCache {
  private app: App;
  private cachePath: string;
  private cache: Record<string, string> | null = null;

  constructor(app: App, pluginId: string) {
    this.app = app;
    this.cachePath = `${app.vault.configDir}/plugins/${pluginId}/sync-base-cache.json`;
  }

  async loadBase(sysId: string): Promise<string | null> {
    await this.ensureLoaded();
    return this.cache![sysId] ?? null;
  }

  async saveBase(sysId: string, body: string): Promise<void> {
    await this.ensureLoaded();
    this.cache![sysId] = body;
    await this.persist();
  }

  async removeBase(sysId: string): Promise<void> {
    await this.ensureLoaded();
    delete this.cache![sysId];
    await this.persist();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.cache !== null) return;
    try {
      const raw = await this.app.vault.adapter.read(this.cachePath);
      this.cache = JSON.parse(raw);
    } catch {
      this.cache = {};
    }
  }

  private async persist(): Promise<void> {
    await this.app.vault.adapter.write(this.cachePath, JSON.stringify(this.cache));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync" && npx vitest run src/base-cache.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync"
git add src/base-cache.ts src/base-cache.test.ts
git commit -m "feat: add base cache module for three-way merge base storage"
```

---

### Task 5: Wire `BaseCache` into `conflict-resolver.ts`

**Files:**
- Modify: `src/conflict-resolver.ts`

- [ ] **Step 1: Add `BaseCache` dependency and update resolution methods**

In `src/conflict-resolver.ts`:

Add import:
```typescript
import type { BaseCache } from "./base-cache";
```

Update constructor:
```typescript
export class ConflictResolver {
  private plugin: SNSyncPlugin;
  private baseCache: BaseCache;

  constructor(plugin: SNSyncPlugin, baseCache: BaseCache) {
    this.plugin = plugin;
    this.baseCache = baseCache;
  }
```

In `resolveWithPull` — add base cache save after writing remote content (after line 79, before `delete`):
```typescript
    await this.baseCache.saveBase(sysId, stripFrontmatter(conflict.remoteContent));
```

In `resolveWithPush` — add base cache save for local content (after the `markDirty` call at line 103, before `delete`):
```typescript
    if (file instanceof TFile) {
      const raw = await this.plugin.app.vault.read(file);
      await this.baseCache.saveBase(sysId, stripFrontmatter(raw));
    }
```

Note: `resolveWithPush` already has a `file instanceof TFile` block — add the cache save inside it, after `markDirty`.

- [ ] **Step 2: Run tests + type check**

Run: `cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync" && npx vitest run && npx tsc --noEmit --skipLibCheck`
Expected: All pass. Existing `conflict-resolver.test.ts` tests may need the constructor call updated — check if mock passes `baseCache`.

- [ ] **Step 3: Fix conflict-resolver tests if needed**

Read `src/conflict-resolver.test.ts` and update `ConflictResolver` instantiation to pass a mock `BaseCache`:

```typescript
const mockBaseCache = {
  loadBase: async () => null,
  saveBase: async () => {},
  removeBase: async () => {},
} as unknown as BaseCache;
// ... new ConflictResolver(mockPlugin, mockBaseCache)
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync"
git add src/conflict-resolver.ts src/conflict-resolver.test.ts
git commit -m "feat: conflict-resolver updates base cache on resolution"
```

---

### Task 6: Wire section merge into `sync-engine.ts` pull path

**Files:**
- Modify: `src/sync-engine.ts`

- [ ] **Step 1: Add imports and `BaseCache` to constructor**

In `src/sync-engine.ts`, add imports:

```typescript
import { parseSections } from "./section-parser";
import { mergeSections } from "./section-merger";
import type { BaseCache } from "./base-cache";
```

Update constructor to accept `BaseCache`:

```typescript
  private baseCache: BaseCache;

  constructor(
    plugin: SNSyncPlugin,
    apiClient: ApiClient,
    frontmatterManager: FrontmatterManager,
    fileWatcher: FileWatcher,
    conflictResolver: ConflictResolver,
    baseCache: BaseCache
  ) {
    this.plugin = plugin;
    this.apiClient = apiClient;
    this.frontmatterManager = frontmatterManager;
    this.fileWatcher = fileWatcher;
    this.conflictResolver = conflictResolver;
    this.baseCache = baseCache;
  }
```

- [ ] **Step 2: Add `rebuildWithFrontmatter` helper**

Add as a private method on `SyncEngine`:

```typescript
  private async rebuildWithFrontmatter(file: TFile, newBody: string): Promise<string> {
    const raw = await this.plugin.app.vault.read(file);
    if (!raw.startsWith("---")) return newBody;
    const endIdx = raw.indexOf("\n---", 3);
    if (endIdx === -1) return newBody;
    return raw.substring(0, endIdx + 4) + "\n" + newBody;
  }
```

- [ ] **Step 3: Replace conflict path in `handlePulledDoc`**

Replace the conflict block (the `if (fm.synced === false) { ... }` block around lines 388-391):

```typescript
        if (fm.synced === false) {
          const remoteBody = stripFrontmatter(doc.content);
          const baseBody = await this.baseCache.loadBase(doc.sys_id);
          const baseSections = baseBody ? parseSections(baseBody) : null;
          const localSections = parseSections(localBody);
          const remoteSections = parseSections(remoteBody);
          const mergeResult = mergeSections(baseSections, localSections, remoteSections);

          if (!mergeResult.hasConflicts) {
            this.fileWatcher.addSyncWritePath(file.path);
            const merged = await this.rebuildWithFrontmatter(file, mergeResult.mergedBody);
            await this.plugin.app.vault.modify(file, merged);
            await this.frontmatterManager.write(file, {
              sys_id: fm.sys_id,
              category: fm.category,
              project: fm.project,
              tags: fm.tags,
              synced: true,
            });
            this.fileWatcher.removeSyncWritePath(file.path);
            await this.baseCache.saveBase(doc.sys_id, mergeResult.mergedBody);
            mapEntry.lastServerTimestamp = doc.sys_updated_on;
            result.pulled++;
          } else {
            this.conflictResolver.applyConflict({
              sysId: doc.sys_id,
              path: mapEntry.path,
              remoteContent: doc.content,
              remoteTimestamp: doc.sys_updated_on,
              lockedBy: doc.checked_out_by || "",
              sectionConflicts: mergeResult.conflicts,
            });
            result.conflicts++;
          }
        }
```

- [ ] **Step 4: Add base cache save to clean pull path**

After the existing `mapEntry.lastServerTimestamp = doc.sys_updated_on;` in the clean pull `else` block (around line 403), add:

```typescript
          await this.baseCache.saveBase(doc.sys_id, stripFrontmatter(doc.content));
```

- [ ] **Step 5: Add base cache save to `createLocalFile`**

In `createLocalFile()`, after the `docMap` assignment (around line 653), add:

```typescript
    await this.baseCache.saveBase(doc.sys_id, stripFrontmatter(doc.content));
```

- [ ] **Step 6: Run type check**

Run: `cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync" && npx tsc --noEmit --skipLibCheck`
Expected: No errors (main.ts will error because constructor call is stale — fixed in Task 8)

If type check fails only on `main.ts` constructor, that's expected. Proceed.

- [ ] **Step 7: Commit**

```bash
cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync"
git add src/sync-engine.ts
git commit -m "feat: wire section merge into sync engine pull path"
```

---

### Task 7: Update `conflict-modal.ts` for section conflict display

**Files:**
- Modify: `src/conflict-modal.ts`

- [ ] **Step 1: Add section conflict rendering**

In `src/conflict-modal.ts`, add section conflict display after the metadata row and before the diff computation. Insert after line 53 (`metaRow.createDiv` for remote):

```typescript
    // Section conflict summary (when available)
    if (this.conflict.sectionConflicts && this.conflict.sectionConflicts.length > 0) {
      const sectionInfo = contentEl.createDiv({ cls: "sn-conflict-modal-sections" });
      sectionInfo.createEl("h3", {
        text: `${this.conflict.sectionConflicts.length} section conflict${this.conflict.sectionConflicts.length > 1 ? "s" : ""}`,
      });

      const list = sectionInfo.createEl("ul", { cls: "sn-conflict-section-list" });
      for (const sc of this.conflict.sectionConflicts) {
        const item = list.createEl("li");
        item.createEl("strong", { text: sc.heading || sc.key });
      }
    }
```

- [ ] **Step 2: Run type check**

Run: `cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync" && npx tsc --noEmit --skipLibCheck`
Expected: No errors (or only main.ts constructor — fixed next task)

- [ ] **Step 3: Commit**

```bash
cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync"
git add src/conflict-modal.ts
git commit -m "feat: display section conflict detail in ConflictModal"
```

---

### Task 8: Wire everything in `main.ts`

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add BaseCache import and instantiation**

In `src/main.ts`:

Add import:
```typescript
import { BaseCache } from "./base-cache";
```

Add property to the class (after `syncEngine!: SyncEngine;`):
```typescript
  baseCache!: BaseCache;
```

In `onload()`, after `this.frontmatterManager` init and before `this.fileWatcher` init (around line 61):

```typescript
    this.baseCache = new BaseCache(this.app, this.manifest.id);
```

Update `this.conflictResolver` init (line 62):
```typescript
    this.conflictResolver = new ConflictResolver(this, this.baseCache);
```

Update `this.syncEngine` init (lines 63-69):
```typescript
    this.syncEngine = new SyncEngine(
      this,
      this.apiClient,
      this.frontmatterManager,
      this.fileWatcher,
      this.conflictResolver,
      this.baseCache
    );
```

- [ ] **Step 2: Run full type check**

Run: `cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync" && npx tsc --noEmit --skipLibCheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync"
git add src/main.ts
git commit -m "feat: wire BaseCache into plugin initialization"
```

---

### Task 9: Full verification — tests, build, lint

**Files:**
- None (verification only)

- [ ] **Step 1: Run all tests**

Run: `cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync" && npx vitest run`
Expected: All tests pass (base-cache + all Phase 1 tests + existing tests)

- [ ] **Step 2: Run type check**

Run: `cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync" && npx tsc --noEmit --skipLibCheck`
Expected: No errors

- [ ] **Step 3: Run lint on modified files**

Run: `cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync" && npx eslint src/base-cache.ts src/frontmatter-manager.ts src/conflict-resolver.ts src/conflict-modal.ts src/sync-engine.ts src/main.ts src/api-client.ts src/types.ts`
Expected: No errors

- [ ] **Step 4: Run build**

Run: `cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync" && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Copy built plugin to Obsidian**

```bash
cp "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync/main.js" "/Users/caleb/Obsidian/Ethos Vault/Ethos/.obsidian/plugins/sn-obsidian-sync/main.js"
cp "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync/styles.css" "/Users/caleb/Obsidian/Ethos Vault/Ethos/.obsidian/plugins/sn-obsidian-sync/styles.css"
cp "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync/manifest.json" "/Users/caleb/Obsidian/Ethos Vault/Ethos/.obsidian/plugins/sn-obsidian-sync/manifest.json"
```

- [ ] **Step 6: Fix any issues and commit**

If lint or build issues arise, fix and commit:

```bash
cd "/Users/caleb/git stuff/sn-obsidian-sync/sn-obsidian-sync"
git add -A
git commit -m "fix: resolve lint/build issues in Phase 2 integration"
```

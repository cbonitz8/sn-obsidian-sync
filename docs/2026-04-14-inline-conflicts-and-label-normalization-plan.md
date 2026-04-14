# Inline Conflicts + Label Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add expandable inline conflict resolution in the browser and fix label/value normalization for project/category choice fields.

**Architecture:** Feature 2 (label normalization) ships first since it's smaller, touches different code, and the fixes are independently valuable. Feature 1 (inline conflicts) builds on the existing conflict list UI in the browser settings tab.

**Tech Stack:** TypeScript, Obsidian API, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/sync-engine.ts` | Modify | Add `resolveValue()`, fix category in `createLocalFile()`, resolve on push |
| `src/sn-browser-view.ts` | Modify | Add `resolveTreeLabel()`, expandable conflict rows, inline diff |
| `src/styles.css` | Modify | Expandable conflict row styles |

---

### Task 1: Add resolveValue() and fix push paths

**Files:**
- Modify: `src/sync-engine.ts`

- [ ] **Step 1: Add resolveValue method**

Add after `resolveLabel` (line ~636-640) in `src/sync-engine.ts`:

```typescript
private resolveValue(type: "projects" | "categories", input: string): string {
  if (!this.cachedMetadata || !input) return input;
  const byValue = this.cachedMetadata[type].find((e) => e.value === input);
  if (byValue) return input;
  const byLabel = this.cachedMetadata[type].find(
    (e) => e.label.toLowerCase() === input.toLowerCase()
  );
  return byLabel?.value ?? input;
}
```

- [ ] **Step 2: Resolve values in handlePushFile new-doc path**

In `handlePushFile()`, after the metadata fetch / modal block (around line 597, before `createDocument` call), add resolution:

Replace:
```typescript
      const createResult = await this.apiClient.createDocument({
        title: file.basename,
        content,
        category,
        project,
        tags,
      });
```

With:
```typescript
      await this.ensureMetadata();
      const createResult = await this.apiClient.createDocument({
        title: file.basename,
        content,
        category: this.resolveValue("categories", category),
        project: this.resolveValue("projects", project),
        tags,
      });
```

- [ ] **Step 3: Resolve values in bulkPush**

In `bulkPush()`, replace the `createDocument` call (around line 219):

Replace:
```typescript
          const createResult = await this.apiClient.createDocument({
            title: file.basename,
            content,
            category: fm.category ?? "",
            project: fm.project ?? "",
            tags: fm.tags ?? "",
          });
```

With:
```typescript
          await this.ensureMetadata();
          const createResult = await this.apiClient.createDocument({
            title: file.basename,
            content,
            category: this.resolveValue("categories", fm.category ?? ""),
            project: this.resolveValue("projects", fm.project ?? ""),
            tags: fm.tags ?? "",
          });
```

- [ ] **Step 4: Fix category resolution in createLocalFile**

In `createLocalFile()`, line 661, replace:

```typescript
    const categoryLabel = doc.category;
```

With:

```typescript
    const categoryLabel = this.resolveLabel("categories", doc.category);
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Clean build, no errors.

Run: `npm test`
Expected: All tests pass (81 tests).

- [ ] **Step 6: Commit**

```bash
git add src/sync-engine.ts
git commit -m "fix: normalize label→value on push, resolve category for folder placement"
```

---

### Task 2: Display labels in browser tree

**Files:**
- Modify: `src/sn-browser-view.ts`

- [ ] **Step 1: Add resolveTreeLabel helper**

Add as a private method on `SNBrowserView`, after `getDocsForSelectedNode()` (around line 531):

```typescript
private resolveTreeLabel(type: "projects" | "categories", value: string): string {
  if (!this.metadata || !value) return value;
  const entry = this.metadata[type].find((e) => e.value === value);
  return entry?.label ?? value;
}
```

- [ ] **Step 2: Resolve project labels in tree**

In `renderTree()`, the tree is built from raw values for grouping (lines 436-444). The grouping keys must stay as raw values so filtering works. Change only the **display text**.

Replace line 438:
```typescript
      const proj = doc.project || "(No Project)";
```
With:
```typescript
      const proj = doc.project || "";
```

Then change the project node display text. Replace line 464-466:
```typescript
      projHeader.createEl("span", {
        text: `${project} (${projCount})`,
        cls: `sn-tree-label ${this.selectedTreeNode === projKey ? "is-active" : ""}`,
      });
```

With:
```typescript
      const projDisplay = this.resolveTreeLabel("projects", project) || "(No Project)";
      projHeader.createEl("span", {
        text: `${projDisplay} (${projCount})`,
        cls: `sn-tree-label ${this.selectedTreeNode === projKey ? "is-active" : ""}`,
      });
```

- [ ] **Step 3: Resolve category labels in tree**

Replace line 441:
```typescript
      const cat = doc.category || "(Uncategorized)";
```
With:
```typescript
      const cat = doc.category || "";
```

Replace line 503:
```typescript
          catNode.createEl("span", { text: `${category} (${catDocs.length})` });
```
With:
```typescript
          const catDisplay = this.resolveTreeLabel("categories", category) || "(Uncategorized)";
          catNode.createEl("span", { text: `${catDisplay} (${catDocs.length})` });
```

- [ ] **Step 4: Also resolve label in context menu**

Replace line 483:
```typescript
          item.setTitle(`Exclude "${project}" from sync`);
```
With:
```typescript
          const projMenuLabel = this.resolveTreeLabel("projects", project) || project;
          item.setTitle(`Exclude "${projMenuLabel}" from sync`);
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Clean build.

Run: `npm test`
Expected: All tests pass (81 tests).

- [ ] **Step 6: Commit**

```bash
git add src/sn-browser-view.ts
git commit -m "fix: display labels instead of raw values in browser tree"
```

---

### Task 3: Expandable conflict rows — collapsed state

**Files:**
- Modify: `src/sn-browser-view.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Add state fields**

In the `SNBrowserView` class, add two new state fields after `expandedNodes` (line 19):

```typescript
  private expandedConflictId: string | null = null;
  private showDiffForConflict: string | null = null;
```

- [ ] **Step 2: Add imports**

Add at the top of `sn-browser-view.ts`, after the existing imports:

```typescript
import { computeDiff, extractHunks } from "./diff";
import { stripFrontmatter } from "./frontmatter-manager";
```

- [ ] **Step 3: Update collapsed conflict rows**

Replace the entire conflict list rendering block (lines 346-383) with:

```typescript
      const conflictList = conflictSection.createDiv({ cls: "sn-conflict-list" });
      for (const conflict of conflicts) {
        const fileName = conflict.path.split("/").pop() ?? conflict.path;
        const isExpanded = this.expandedConflictId === conflict.sysId;

        const row = conflictList.createDiv({ cls: `sn-conflict-row ${isExpanded ? "is-expanded" : ""}` });
        row.addEventListener("click", () => {
          this.expandedConflictId = isExpanded ? null : conflict.sysId;
          if (!isExpanded) this.showDiffForConflict = null;
          void this.render();
        });

        const info = row.createDiv({ cls: "sn-conflict-info" });
        info.createEl("span", { text: fileName, cls: "sn-conflict-name" });
        const meta = info.createDiv({ cls: "sn-conflict-meta" });
        if (conflict.remoteTimestamp) {
          const remoteMtime = new Date(conflict.remoteTimestamp.replace(" ", "T"));
          const remoteTimeStr = isNaN(remoteMtime.getTime())
            ? conflict.remoteTimestamp
            : remoteMtime.toLocaleDateString();
          meta.createEl("span", { text: `Remote: ${remoteTimeStr}` });
        }
        if (conflict.lockedBy) {
          meta.createEl("span", { text: `Locked by: ${conflict.lockedBy}` });
        }
        const sc = conflict.sectionConflicts;
        if (sc && sc.length > 0) {
          meta.createEl("span", {
            text: `${sc.length} section conflict${sc.length > 1 ? "s" : ""}`,
            cls: "sn-conflict-meta-sections",
          });
        }

        const actions = row.createDiv({ cls: "sn-conflict-row-actions" });
        const openBtn = actions.createEl("button", { text: "Open", cls: "sn-action-btn" });
        openBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const file = this.plugin.app.vault.getAbstractFileByPath(conflict.path);
          if (file instanceof TFile) {
            void this.plugin.app.workspace.getLeaf(false).openFile(file);
          }
        });
        const pullBtn = actions.createEl("button", { text: "Pull remote", cls: "sn-action-btn mod-cta" });
        pullBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          void (async () => {
            await this.plugin.conflictResolver.resolveWithPull(conflict.sysId);
            this.expandedConflictId = null;
            this.showDiffForConflict = null;
            await this.render();
          })();
        });
        const pushBtn = actions.createEl("button", { text: "Push local", cls: "sn-action-btn" });
        pushBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          void (async () => {
            await this.plugin.conflictResolver.resolveWithPush(conflict.sysId);
            this.expandedConflictId = null;
            this.showDiffForConflict = null;
            await this.render();
          })();
        });
        const dismissBtn = actions.createEl("button", { text: "Dismiss", cls: "sn-action-btn sn-action-btn-danger" });
        dismissBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          void (async () => {
            delete this.plugin.syncState.conflicts[conflict.sysId];
            await this.plugin.saveSettings();
            this.expandedConflictId = null;
            this.showDiffForConflict = null;
            await this.render();
          })();
        });

        if (isExpanded) {
          this.renderConflictExpanded(conflictList, conflict);
        }
      }
```

- [ ] **Step 4: Add cursor pointer to conflict rows**

In `styles.css`, replace the existing `.sn-conflict-row` rule:

```css
.sn-conflict-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--background-secondary);
  border-radius: 6px;
  border-left: 3px solid var(--color-orange);
}
```

With:

```css
.sn-conflict-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--background-secondary);
  border-radius: 6px;
  border-left: 3px solid var(--color-orange);
  cursor: pointer;
}

.sn-conflict-row.is-expanded {
  border-radius: 6px 6px 0 0;
}
```

- [ ] **Step 5: Build (will fail — renderConflictExpanded not yet defined)**

Run: `npm run build`
Expected: Error — `renderConflictExpanded` does not exist. This confirms the wiring is correct.

- [ ] **Step 6: Add stub for renderConflictExpanded**

Add as a private method on `SNBrowserView`:

```typescript
private renderConflictExpanded(container: HTMLElement, conflict: ConflictEntry) {
  const expanded = container.createDiv({ cls: "sn-conflict-row-expanded" });
  expanded.createEl("p", { text: "Loading...", cls: "sn-conflict-empty" });
}
```

Add the import for `ConflictEntry` — update the existing types import at line 3:

```typescript
import type { SNDocument, SNMetadata, ConflictEntry } from "./types";
```

- [ ] **Step 7: Build and verify**

Run: `npm run build`
Expected: Clean build.

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/sn-browser-view.ts src/styles.css
git commit -m "feat: expandable conflict rows with collapse/expand toggle"
```

---

### Task 4: Expandable conflict rows — expanded state with diff

**Files:**
- Modify: `src/sn-browser-view.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Implement renderConflictExpanded**

Replace the stub `renderConflictExpanded` method with:

```typescript
private renderConflictExpanded(container: HTMLElement, conflict: ConflictEntry) {
  const expanded = container.createDiv({ cls: "sn-conflict-row-expanded" });
  expanded.addEventListener("click", (e) => e.stopPropagation());

  // Section conflict detail
  const sc = conflict.sectionConflicts;
  if (sc && sc.length > 0) {
    const sectionInfo = expanded.createDiv({ cls: "sn-conflict-section-summary" });
    for (const s of sc) {
      const item = sectionInfo.createDiv({ cls: "sn-conflict-section-item" });
      item.createEl("strong", { text: s.heading });
      const preview = item.createDiv({ cls: "sn-conflict-section-preview" });
      const localPre = preview.createDiv({ cls: "sn-conflict-section-local" });
      localPre.createEl("span", { text: "Local:", cls: "sn-conflict-section-label" });
      localPre.createEl("pre", { text: s.localBody.slice(0, 200) + (s.localBody.length > 200 ? "..." : "") });
      const remotePre = preview.createDiv({ cls: "sn-conflict-section-remote" });
      remotePre.createEl("span", { text: "Remote:", cls: "sn-conflict-section-label" });
      remotePre.createEl("pre", { text: s.remoteBody.slice(0, 200) + (s.remoteBody.length > 200 ? "..." : "") });
    }
  }

  // Diff toggle
  const showingDiff = this.showDiffForConflict === conflict.sysId;
  const diffToggle = expanded.createEl("button", {
    text: showingDiff ? "Hide diff" : "Show diff",
    cls: "sn-action-btn sn-conflict-diff-toggle",
  });
  diffToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    this.showDiffForConflict = showingDiff ? null : conflict.sysId;
    void this.render();
  });

  if (showingDiff) {
    const file = this.plugin.app.vault.getAbstractFileByPath(conflict.path);
    if (file instanceof TFile) {
      void (async () => {
        const rawLocal = await this.plugin.app.vault.read(file);
        const localBody = stripFrontmatter(rawLocal);
        const remoteBody = stripFrontmatter(conflict.remoteContent);
        const diffLines = computeDiff(localBody, remoteBody);

        if (diffLines.length === 0) {
          expanded.createEl("p", { text: "Contents are identical.", cls: "sn-conflict-empty" });
          return;
        }

        const legend = expanded.createDiv({ cls: "sn-diff-legend" });
        legend.createSpan({ cls: "sn-diff-legend-item sn-diff-legend-local", text: "\u2212 Local" });
        legend.createSpan({ cls: "sn-diff-legend-item sn-diff-legend-remote", text: "+ Remote" });

        const hunks = extractHunks(diffLines);
        const diffContainer = expanded.createDiv({ cls: "sn-conflict-inline-diff" });

        for (let i = 0; i < hunks.length; i++) {
          if (i > 0) {
            diffContainer.createDiv({ cls: "sn-diff-separator", text: "\u22EF" });
          }
          const hunkEl = diffContainer.createDiv({ cls: "sn-diff-hunk" });
          for (const line of hunks[i]!.lines) {
            const lineEl = hunkEl.createDiv({ cls: `sn-diff-line sn-diff-${line.type}` });
            const prefix = line.type === "added" ? "+" : line.type === "removed" ? "\u2212" : " ";
            lineEl.createSpan({ text: prefix, cls: "sn-diff-prefix" });
            lineEl.createSpan({ text: line.text });
          }
        }
      })();
    }
  }
}
```

- [ ] **Step 2: Add expanded row and inline diff styles**

Add to `styles.css`, after the `.sn-conflict-row.is-expanded` rule:

```css
.sn-conflict-row-expanded {
  padding: 12px;
  background: var(--background-secondary);
  border-left: 3px solid var(--color-orange);
  border-radius: 0 0 6px 6px;
  margin-top: -6px;
  margin-bottom: 6px;
}

.sn-conflict-section-summary {
  margin-bottom: 10px;
}

.sn-conflict-section-item {
  margin-bottom: 8px;
}

.sn-conflict-section-preview {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.sn-conflict-section-preview pre {
  font-size: 0.75em;
  margin: 2px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 80px;
  overflow: hidden;
}

.sn-conflict-section-local,
.sn-conflict-section-remote {
  flex: 1;
  min-width: 0;
}

.sn-conflict-section-label {
  font-size: 0.8em;
  font-weight: 600;
  color: var(--text-muted);
}

.sn-conflict-diff-toggle {
  margin-bottom: 8px;
}

.sn-conflict-inline-diff {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  font-family: var(--font-monospace);
  font-size: 0.8em;
  line-height: 1.6;
}

.sn-conflict-meta-sections {
  color: var(--color-orange);
  font-weight: 500;
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build.

Run: `npm test`
Expected: All tests pass (81 tests).

- [ ] **Step 4: Commit**

```bash
git add src/sn-browser-view.ts src/styles.css
git commit -m "feat: inline conflict expansion with section detail and diff toggle"
```

---

### Task 5: Final build + copy to vault

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 3: Copy to Obsidian vault**

```bash
cp main.js "/Users/caleb/Obsidian/Ethos Vault/Ethos/.obsidian/plugins/sn-obsidian-sync/main.js"
cp styles.css "/Users/caleb/Obsidian/Ethos Vault/Ethos/.obsidian/plugins/sn-obsidian-sync/styles.css"
cp manifest.json "/Users/caleb/Obsidian/Ethos Vault/Ethos/.obsidian/plugins/sn-obsidian-sync/manifest.json"
```

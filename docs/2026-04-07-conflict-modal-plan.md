# Conflict Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare "there's a conflict" notice with a modal showing timestamps, authorship, and a focused line-level diff so users can make informed pull/push decisions.

**Architecture:** New `src/diff.ts` for the pure diff algorithm (LCS-based, no deps), new `src/conflict-modal.ts` for the Obsidian Modal subclass that renders the diff UI. `conflict-resolver.ts` opens the modal on conflict detection. `main.ts` adds a "View details" button to the persistent conflict notice.

**Tech Stack:** TypeScript, Obsidian API (Modal, Notice, TFile), vitest for testing

---

### Task 1: Diff algorithm — core LCS and line diff

**Files:**
- Create: `src/diff.ts`
- Create: `src/diff.test.ts`

- [ ] **Step 1: Write failing tests for computeDiff**

Create `src/diff.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeDiff, type DiffLine } from "./diff";

describe("computeDiff", () => {
  it("returns empty array for identical content", () => {
    const result = computeDiff("hello\nworld", "hello\nworld");
    expect(result).toEqual([]);
  });

  it("detects a single added line", () => {
    const result = computeDiff("a\nb", "a\nb\nc");
    expect(result).toEqual([
      { type: "context", text: "a" },
      { type: "context", text: "b" },
      { type: "added", text: "c" },
    ]);
  });

  it("detects a single removed line", () => {
    const result = computeDiff("a\nb\nc", "a\nb");
    expect(result).toEqual([
      { type: "context", text: "a" },
      { type: "context", text: "b" },
      { type: "removed", text: "c" },
    ]);
  });

  it("detects a changed line as remove + add", () => {
    const result = computeDiff("a\nold\nc", "a\nnew\nc");
    expect(result).toEqual([
      { type: "context", text: "a" },
      { type: "removed", text: "old" },
      { type: "added", text: "new" },
      { type: "context", text: "c" },
    ]);
  });

  it("handles completely different content", () => {
    const result = computeDiff("a\nb", "c\nd");
    expect(result).toEqual([
      { type: "removed", text: "a" },
      { type: "removed", text: "b" },
      { type: "added", text: "c" },
      { type: "added", text: "d" },
    ]);
  });

  it("handles empty local content", () => {
    const result = computeDiff("", "new line");
    expect(result).toEqual([
      { type: "added", text: "new line" },
    ]);
  });

  it("handles empty remote content", () => {
    const result = computeDiff("old line", "");
    expect(result).toEqual([
      { type: "removed", text: "old line" },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/diff.test.ts`
Expected: FAIL — cannot find module `./diff`

- [ ] **Step 3: Implement computeDiff with LCS algorithm**

Create `src/diff.ts`:

```typescript
export interface DiffLine {
  type: "context" | "added" | "removed";
  text: string;
}

/**
 * Compute the longest common subsequence of two string arrays.
 * Returns an array of [indexInA, indexInB] pairs for matched lines.
 */
function lcs(a: string[], b: string[]): [number, number][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  const pairs: [number, number][] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }

  return pairs.reverse();
}

/**
 * Compute a line-level diff between local and remote content.
 * Returns DiffLine[] with only changed hunks and surrounding context.
 * Returns empty array if contents are identical.
 */
export function computeDiff(local: string, remote: string): DiffLine[] {
  if (local === remote) return [];

  const localLines = local ? local.split("\n") : [];
  const remoteLines = remote ? remote.split("\n") : [];
  const matched = lcs(localLines, remoteLines);

  // Build full diff sequence
  const full: DiffLine[] = [];
  let li = 0;
  let ri = 0;

  for (const [ml, mr] of matched) {
    while (li < ml) {
      full.push({ type: "removed", text: localLines[li]! });
      li++;
    }
    while (ri < mr) {
      full.push({ type: "added", text: remoteLines[ri]! });
      ri++;
    }
    full.push({ type: "context", text: localLines[ml]! });
    li = ml + 1;
    ri = mr + 1;
  }

  while (li < localLines.length) {
    full.push({ type: "removed", text: localLines[li]! });
    li++;
  }
  while (ri < remoteLines.length) {
    full.push({ type: "added", text: remoteLines[ri]! });
    ri++;
  }

  return full;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/diff.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/diff.ts src/diff.test.ts
git commit -m "feat: add LCS-based line diff algorithm"
```

---

### Task 2: Diff algorithm — hunk extraction with context

**Files:**
- Modify: `src/diff.ts`
- Modify: `src/diff.test.ts`

- [ ] **Step 1: Write failing tests for extractHunks**

Append to `src/diff.test.ts`:

```typescript
import { computeDiff, extractHunks, type DiffLine, type Hunk } from "./diff";

describe("extractHunks", () => {
  it("returns empty array for no diff lines", () => {
    expect(extractHunks([])).toEqual([]);
  });

  it("returns a single hunk with context for a small diff", () => {
    const lines: DiffLine[] = [
      { type: "context", text: "a" },
      { type: "removed", text: "old" },
      { type: "added", text: "new" },
      { type: "context", text: "c" },
    ];
    const hunks = extractHunks(lines);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.lines).toEqual(lines);
  });

  it("limits context to 3 lines before and after a change", () => {
    const lines: DiffLine[] = [
      { type: "context", text: "1" },
      { type: "context", text: "2" },
      { type: "context", text: "3" },
      { type: "context", text: "4" },
      { type: "context", text: "5" },
      { type: "removed", text: "old" },
      { type: "added", text: "new" },
      { type: "context", text: "6" },
      { type: "context", text: "7" },
      { type: "context", text: "8" },
      { type: "context", text: "9" },
      { type: "context", text: "10" },
    ];
    const hunks = extractHunks(lines);
    expect(hunks).toHaveLength(1);
    // 3 before + removed + added + 3 after = 8 lines
    expect(hunks[0]!.lines).toHaveLength(8);
    expect(hunks[0]!.lines[0]!.text).toBe("3");
    expect(hunks[0]!.lines[7]!.text).toBe("8");
  });

  it("merges overlapping hunks", () => {
    const lines: DiffLine[] = [
      { type: "removed", text: "a" },
      { type: "context", text: "1" },
      { type: "context", text: "2" },
      { type: "context", text: "3" },
      { type: "context", text: "4" },
      { type: "context", text: "5" },
      { type: "added", text: "b" },
    ];
    const hunks = extractHunks(lines);
    // gap is 5 context lines; 3 after first + 3 before second = 6 > 5 → merge
    expect(hunks).toHaveLength(1);
  });

  it("splits distant hunks", () => {
    const lines: DiffLine[] = [
      { type: "removed", text: "a" },
      { type: "context", text: "1" },
      { type: "context", text: "2" },
      { type: "context", text: "3" },
      { type: "context", text: "4" },
      { type: "context", text: "5" },
      { type: "context", text: "6" },
      { type: "context", text: "7" },
      { type: "added", text: "b" },
    ];
    const hunks = extractHunks(lines);
    // gap is 7 context lines; 3 + 3 = 6 < 7 → split
    expect(hunks).toHaveLength(2);
    expect(hunks[0]!.lines[0]!.text).toBe("a");
    expect(hunks[1]!.lines[hunks[1]!.lines.length - 1]!.text).toBe("b");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/diff.test.ts`
Expected: FAIL — `extractHunks` is not exported from `./diff`

- [ ] **Step 3: Implement extractHunks**

Add to the bottom of `src/diff.ts`:

```typescript
export interface Hunk {
  lines: DiffLine[];
}

const CONTEXT_LINES = 3;

/**
 * Group diff lines into hunks showing only changed regions with surrounding context.
 * Adjacent hunks whose context would overlap are merged.
 */
export function extractHunks(diffLines: DiffLine[]): Hunk[] {
  if (diffLines.length === 0) return [];

  // Find indices of all changed lines
  const changeIndices: number[] = [];
  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i]!.type !== "context") {
      changeIndices.push(i);
    }
  }

  if (changeIndices.length === 0) return [];

  // Build raw hunks: each change gets a range with context
  const ranges: [number, number][] = [];
  let rangeStart = Math.max(0, changeIndices[0]! - CONTEXT_LINES);
  let rangeEnd = Math.min(diffLines.length - 1, changeIndices[0]! + CONTEXT_LINES);

  for (let i = 1; i < changeIndices.length; i++) {
    const newStart = Math.max(0, changeIndices[i]! - CONTEXT_LINES);
    const newEnd = Math.min(diffLines.length - 1, changeIndices[i]! + CONTEXT_LINES);

    if (newStart <= rangeEnd + 1) {
      // Overlapping or adjacent — extend current range
      rangeEnd = newEnd;
    } else {
      ranges.push([rangeStart, rangeEnd]);
      rangeStart = newStart;
      rangeEnd = newEnd;
    }
  }
  ranges.push([rangeStart, rangeEnd]);

  return ranges.map(([start, end]) => ({
    lines: diffLines.slice(start, end + 1),
  }));
}
```

Also update the `computeDiff` import in the test file to include `extractHunks` and `Hunk`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/diff.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/diff.ts src/diff.test.ts
git commit -m "feat: add hunk extraction with context merging"
```

---

### Task 3: ConflictModal — render diff and metadata

**Files:**
- Create: `src/conflict-modal.ts`

- [ ] **Step 1: Create ConflictModal class**

Create `src/conflict-modal.ts`:

```typescript
import { Modal, TFile } from "obsidian";
import type SNSyncPlugin from "./main";
import type { ConflictEntry } from "./types";
import { computeDiff, extractHunks } from "./diff";

export class ConflictModal extends Modal {
  private plugin: SNSyncPlugin;
  private conflict: ConflictEntry;
  private resolved = false;

  constructor(plugin: SNSyncPlugin, conflict: ConflictEntry) {
    super(plugin.app);
    this.plugin = plugin;
    this.conflict = conflict;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass("sn-conflict-modal");

    const file = this.app.vault.getAbstractFileByPath(this.conflict.path);
    if (!(file instanceof TFile)) {
      contentEl.createEl("p", { text: "File not found — conflict may be stale." });
      return;
    }

    const fileName = file.basename;

    // Header
    contentEl.createEl("h2", { text: fileName });
    contentEl.createEl("p", {
      text: "Both local and remote versions were edited independently",
      cls: "sn-conflict-modal-subtitle",
    });

    // Metadata row
    const metaRow = contentEl.createDiv({ cls: "sn-conflict-modal-meta" });

    const localMtime = new Date(file.stat.mtime);
    const localTimeStr = localMtime.toLocaleString();
    metaRow.createDiv({
      cls: "sn-conflict-modal-meta-local",
      text: `Local \u2014 modified ${localTimeStr}`,
    });

    let remoteText = `Remote \u2014 modified ${this.conflict.remoteTimestamp}`;
    if (this.conflict.lockedBy) {
      remoteText += ` by ${this.conflict.lockedBy}`;
    }
    metaRow.createDiv({
      cls: "sn-conflict-modal-meta-remote",
      text: remoteText,
    });

    // Compute diff
    const rawLocal = await this.app.vault.read(file);
    const localBody = this.stripFrontmatter(rawLocal);
    const remoteBody = this.stripFrontmatter(this.conflict.remoteContent);

    const diffLines = computeDiff(localBody, remoteBody);

    if (diffLines.length === 0) {
      const identical = contentEl.createDiv({ cls: "sn-conflict-modal-identical" });
      identical.createEl("p", { text: "Contents are identical." });
      const clearBtn = identical.createEl("button", {
        text: "Clear conflict",
        cls: "sn-action-btn mod-cta",
      });
      clearBtn.addEventListener("click", () => {
        this.resolved = true;
        delete this.plugin.syncState.conflicts[this.conflict.sysId];
        void this.plugin.saveSettings();
        this.close();
      });
      return;
    }

    // Render hunks
    const hunks = extractHunks(diffLines);
    const diffContainer = contentEl.createDiv({ cls: "sn-conflict-modal-diff" });

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

    // Action bar
    const actions = contentEl.createDiv({ cls: "sn-conflict-modal-actions" });

    const acceptBtn = actions.createEl("button", {
      text: "Accept remote",
      cls: "sn-action-btn mod-cta",
    });
    acceptBtn.addEventListener("click", () => {
      this.resolved = true;
      void this.plugin.conflictResolver.resolveWithPull(this.conflict.sysId);
      this.close();
    });

    const keepBtn = actions.createEl("button", {
      text: "Keep local",
      cls: "sn-action-btn",
    });
    keepBtn.addEventListener("click", () => {
      this.resolved = true;
      void this.plugin.conflictResolver.resolveWithPush(this.conflict.sysId);
      this.close();
    });

    const cancelBtn = actions.createEl("button", {
      text: "Cancel",
      cls: "sn-action-btn",
    });
    cancelBtn.addEventListener("click", () => {
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }

  private stripFrontmatter(raw: string): string {
    if (!raw.startsWith("---")) return raw;
    const endIdx = raw.indexOf("\n---", 3);
    if (endIdx === -1) return raw;
    return raw.slice(endIdx + 4).replace(/^\n+/, "");
  }
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Commit**

```bash
git add src/conflict-modal.ts
git commit -m "feat: add ConflictModal with diff rendering and action buttons"
```

---

### Task 4: Wire modal into conflict-resolver.ts

**Files:**
- Modify: `src/conflict-resolver.ts:41-56` (applyConflict method)

- [ ] **Step 1: Import ConflictModal and open it from applyConflict**

At the top of `src/conflict-resolver.ts`, add the import:

```typescript
import { ConflictModal } from "./conflict-modal";
```

Replace the `applyConflict` method body (lines 41-56) with:

```typescript
  applyConflict(sysId: string, path: string, remoteContent: string, remoteTimestamp: string, lockedBy: string) {
    this.plugin.syncState.conflicts[sysId] = {
      sysId,
      path,
      remoteContent,
      remoteTimestamp,
      lockedBy,
    };

    const conflict = this.plugin.syncState.conflicts[sysId]!;
    new ConflictModal(this.plugin, conflict).open();
  }
```

This replaces the Notice with the modal. The command palette commands remain as fallback.

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass (existing conflict-resolver tests + new diff tests)

- [ ] **Step 4: Commit**

```bash
git add src/conflict-resolver.ts
git commit -m "feat: open conflict modal on conflict detection instead of bare notice"
```

---

### Task 5: Add "View details" button to persistent conflict notice

**Files:**
- Modify: `src/main.ts:295-316` (checkActiveConflictState method)

- [ ] **Step 1: Import ConflictModal in main.ts**

Add to the imports at the top of `src/main.ts`:

```typescript
import { ConflictModal } from "./conflict-modal";
```

- [ ] **Step 2: Update checkActiveConflictState to include a button**

Replace the `checkActiveConflictState` method (lines 295-316) with:

```typescript
  private checkActiveConflictState() {
    if (this.activeConflictNotice) {
      this.activeConflictNotice.hide();
      this.activeConflictNotice = null;
    }

    const file = this.app.workspace.getActiveFile();
    if (!file) return;

    const conflict = this.conflictResolver.getConflictForPath(file.path);
    if (!conflict) return;

    const frag = document.createDocumentFragment();
    const container = frag.createEl("div", { cls: "sn-conflict-notice" });
    container.createEl("div", { text: "Sync conflict", cls: "sn-conflict-notice-title" });
    container.createEl("div", {
      text: `"${file.basename}" has conflicting remote changes.`,
      cls: "sn-conflict-notice-body",
    });
    const viewBtn = container.createEl("button", {
      text: "View details",
      cls: "sn-action-btn sn-conflict-notice-btn",
    });
    viewBtn.addEventListener("click", () => {
      new ConflictModal(this, conflict).open();
      if (this.activeConflictNotice) {
        this.activeConflictNotice.hide();
        this.activeConflictNotice = null;
      }
    });

    this.activeConflictNotice = new Notice(frag, 0);
  }
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: add 'View details' button to persistent conflict notice"
```

---

### Task 6: CSS styles for conflict modal and diff

**Files:**
- Modify: `styles.css` (append new styles)

- [ ] **Step 1: Add conflict modal and diff styles**

Append to `styles.css`:

```css
/* Conflict modal */
.sn-conflict-modal {
  max-width: 700px;
}

.sn-conflict-modal-subtitle {
  color: var(--text-muted);
  font-size: 0.9em;
  margin-top: -8px;
  margin-bottom: 16px;
}

.sn-conflict-modal-meta {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  background: var(--background-secondary);
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 0.85em;
  flex-wrap: wrap;
}

.sn-conflict-modal-meta-local {
  color: var(--text-muted);
}

.sn-conflict-modal-meta-remote {
  color: var(--text-muted);
}

.sn-conflict-modal-identical {
  text-align: center;
  padding: 24px;
  color: var(--text-muted);
}

/* Diff rendering */
.sn-conflict-modal-diff {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  margin-bottom: 16px;
  font-family: var(--font-monospace);
  font-size: 0.8em;
  line-height: 1.6;
}

.sn-diff-hunk {
  padding: 4px 0;
}

.sn-diff-separator {
  text-align: center;
  color: var(--text-faint);
  padding: 4px;
  font-size: 0.9em;
  border-top: 1px solid var(--background-modifier-border);
  border-bottom: 1px solid var(--background-modifier-border);
}

.sn-diff-line {
  padding: 1px 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.sn-diff-prefix {
  display: inline-block;
  width: 18px;
  flex-shrink: 0;
  color: var(--text-faint);
  user-select: none;
}

.sn-diff-removed {
  background: rgba(255, 100, 100, 0.15);
}

.sn-diff-added {
  background: rgba(100, 255, 100, 0.15);
}

.sn-diff-context {
  background: transparent;
}

/* Action bar */
.sn-conflict-modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* Notice button */
.sn-conflict-notice-btn {
  margin-top: 6px;
  font-size: 0.85em;
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat: add CSS styles for conflict modal and diff view"
```

---

### Task 7: Final integration test and cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run ESLint**

Run: `npm run lint 2>&1 | grep -v sentence-case`
Expected: No new errors (only pre-existing sentence-case warnings)

- [ ] **Step 3: Build the plugin**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 4: Final commit if any adjustments were needed**

```bash
git add -A
git commit -m "chore: final cleanup for conflict modal feature"
```

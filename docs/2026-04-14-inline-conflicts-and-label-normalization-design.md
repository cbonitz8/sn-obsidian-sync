# Inline Conflict Resolution + Label/Value Normalization

## Goal

Two improvements to the Snobby browser and sync pipeline:

1. Expandable inline conflict resolution in the browser's Sync Settings tab — eliminate the multi-click flow of browser → open file → notice → modal.
2. Fix label/value confusion for project and category choice fields so the tree displays labels, push sends values, and folder placement is consistent.

## Feature 1: Inline Conflict Resolution

### Problem

Resolving multiple conflicts requires: open browser → settings tab → click Open → switch to file → see notice → click View Details → modal → resolve → repeat. Too many steps for batch work.

### Design

The existing conflict list in the Sync Settings tab (sn-browser-view.ts, lines 320-384) becomes expandable. Each conflict row toggles between collapsed and expanded states.

**Collapsed state** (current behavior, plus):
- File name, remote timestamp, locked-by
- Section conflict count if available (e.g., "2 section conflicts")
- Pull Remote / Push Local / Dismiss buttons — resolve without expanding

**Expanded state** (click row to toggle):
- Everything from collapsed
- Section conflict detail: heading names with truncated local/remote body previews (same as conflict-modal section detail)
- "Show diff" toggle button that reveals the full diff inline (same computeDiff/extractHunks output as the modal)
- Diff uses same CSS classes as the modal diff (sn-diff-hunk, sn-diff-removed, etc.)
- Diff legend (local/remote color labels)

**Behavior:**
- Click row → expand/collapse toggle
- Resolve (Pull/Push/Dismiss) → row collapses and removes from list, next stays collapsed
- Clicking buttons does NOT toggle expand (stopPropagation on button clicks)
- View re-renders after each resolution to update conflict count in tab label

**Modal stays** for the single-file trigger: active-leaf-change notice → "View details" → ConflictModal. No changes to that flow.

### Changes

**sn-browser-view.ts:**
- Add `expandedConflictId: string | null` state field
- Replace the conflict list render (lines 346-383) with expandable row logic
- Row click toggles `expandedConflictId`, re-renders
- Expanded row calls `computeDiff` and `extractHunks` (import from diff.ts)
- Expanded row reads section conflicts from `conflict.sectionConflicts`
- Add `showDiffForConflict: string | null` state for the diff toggle
- Import `stripFrontmatter` from frontmatter-manager for diff computation

**styles.css:**
- `.sn-conflict-row` gains cursor:pointer
- `.sn-conflict-row-expanded` — expanded container below the row
- `.sn-conflict-section-summary` — section conflict heading list
- `.sn-conflict-inline-diff` — reuses existing sn-diff-* classes, constrained max-height with scroll
- `.sn-conflict-diff-toggle` — show/hide diff button

## Feature 2: Label/Value Normalization

### Problem

Three related bugs from label/value confusion:

1. **Push sends labels to SN.** Frontmatter `sn_project` often contains the display label (e.g., "EGCS Audits") because that's what users and skills write. The push path sends it as-is. SN's choice field accepts it but stores it inconsistently vs docs created through the SN UI with the value (`egcs_audits`).

2. **Browser tree shows raw values.** Tree nodes display `egcs_audits` and `design_spec` instead of "EGCS Audits" and "Design Spec". The filter dropdowns correctly show labels, but the tree doesn't resolve.

3. **Category not resolved for folder placement.** `createLocalFile()` resolves project to label for folder paths but passes category raw. Line 661: `const categoryLabel = doc.category` should call `resolveLabel`.

### Design

#### Push-side: label → value resolution

Add a `resolveValue` method to SyncEngine (inverse of `resolveLabel`):

```typescript
private resolveValue(type: "projects" | "categories", input: string): string {
  if (!this.cachedMetadata || !input) return input;
  // If input matches a value, it's already correct
  const byValue = this.cachedMetadata[type].find((e) => e.value === input);
  if (byValue) return input;
  // If input matches a label, return the corresponding value
  const byLabel = this.cachedMetadata[type].find(
    (e) => e.label.toLowerCase() === input.toLowerCase()
  );
  return byLabel?.value ?? input;
}
```

Call it before sending to API in:
- `handlePushFile()` new doc path (line ~574-575): resolve `category` and `project` before `createDocument()`
- `bulkPush()` (line ~215-216): same resolution before `createDocument()`

Metadata must be loaded before resolution. Both paths already have `ensureMetadata` or inline metadata fetch. Add `await this.ensureMetadata()` where missing.

#### Display-side: value → label in browser tree

In `renderTree()`, resolve display labels when building tree nodes:

```typescript
const projLabel = this.resolveTreeLabel("projects", doc.project) || "(No Project)";
const catLabel = this.resolveTreeLabel("categories", doc.category) || "(Uncategorized)";
```

New helper on SNBrowserView:
```typescript
private resolveTreeLabel(type: "projects" | "categories", value: string): string {
  if (!this.metadata || !value) return value;
  const entry = this.metadata[type].find((e) => e.value === value);
  return entry?.label ?? value;
}
```

Tree grouping keys stay as raw values (for correct filtering), but display text uses labels.

#### Folder placement fix

In `createLocalFile()`, line 661:

**Before:** `const categoryLabel = doc.category;`
**After:** `const categoryLabel = this.resolveLabel("categories", doc.category);`

### Changes

**sync-engine.ts:**
- Add `resolveValue()` private method
- Call in `handlePushFile()` new-doc path and `bulkPush()` before API calls
- Fix line 661: resolve category label for folder placement
- Add `await this.ensureMetadata()` before `resolveValue` calls where metadata might not be cached

**sn-browser-view.ts:**
- Add `resolveTreeLabel()` private method
- Use in `renderTree()` for project and category node display text
- Keep raw values as grouping keys, display labels as text

## Test Plan

### Inline conflicts
- Collapsed row shows file name, timestamp, section count, action buttons
- Click row expands, click again collapses
- Expanded shows section detail when sectionConflicts present
- "Show diff" toggle reveals/hides diff
- Pull/Push/Dismiss resolves and removes row without expanding others
- Tab label conflict count updates after resolution
- Modal still works from active-file notice

### Label normalization
- Push with `sn_project: "EGCS Audits"` (label) sends `egcs_audits` (value) to API
- Push with `sn_project: "egcs_audits"` (value) sends `egcs_audits` unchanged
- Push with unknown project sends as-is (fallback)
- Case-insensitive label matching
- Tree shows "EGCS Audits" not "egcs_audits"
- Tree grouping still works (filters match correctly)
- Category resolved for folder placement in createLocalFile

## Not in Scope

- Fixing existing bad data in SN (user handles manually)
- Per-section resolution UI in expanded rows (Phase 4-5)
- Push-path base cache saves (Phase 3)
1
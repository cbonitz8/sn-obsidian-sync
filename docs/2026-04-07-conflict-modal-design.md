# Conflict resolution modal

## Problem

When a sync conflict is detected (both local and remote versions changed independently), the user gets a bare notice saying "there's a conflict" with options to pull or push via the command palette. There is no context about what changed, when, or by whom — making it hard to decide which version to keep.

## Solution

Replace the passive notice with a modal dialog that shows timestamps, authorship, and a focused diff of the changes, with action buttons to resolve inline.

## Data flow

1. `applyConflict()` stores the conflict entry as today (sysId, path, remoteContent, remoteTimestamp, lockedBy)
2. Modal is opened immediately after conflict detection
3. On open, modal reads **fresh** local content from the vault (not a snapshot) so the user always sees the current local state
4. Diff is computed between local body and remote body (both stripped of frontmatter)
5. User picks an action: accept remote, keep local, or cancel

## Modal layout

### Header
- Title: file name
- Subtitle: "Both local and remote versions were edited independently"

### Metadata row
- Left side: "Local — modified [readable timestamp]" (from `file.stat.mtime`)
- Right side: "Remote — modified [sys_updated_on]" plus "by [username]" if `lockedBy` is populated

### Diff section
- Shows only changed hunks, not the full document
- Each hunk includes up to 3 lines of unchanged context above and below
- Adjacent hunks whose context would overlap are merged into a single hunk
- Removed lines (present in local, absent in remote) styled with red/pink background
- Added lines (present in remote, absent in local) styled with green background
- Unchanged context lines in neutral style
- If contents are identical (user manually aligned them), show "Contents are identical" with an option to clear the conflict

### Action bar
- **Accept remote** (primary/CTA button) — calls `resolveWithPull(sysId)`, closes modal
- **Keep local** — calls `resolveWithPush(sysId)`, closes modal
- **Cancel** — closes modal, conflict stays active for later resolution

## Diff algorithm

Implemented without external dependencies (Obsidian plugin requirement).

- Split both local and remote body into lines
- Compute longest common subsequence (LCS) to identify unchanged lines
- Mark lines as added, removed, or unchanged
- Group consecutive changes into hunks with up to 3 lines of surrounding context
- Merge adjacent hunks that would have overlapping context

## Changes to existing code

### New files
- `src/conflict-modal.ts` — `ConflictModal` class (extends `Modal`) and `computeDiff()` utility

### Modified files
- `src/types.ts` — no changes to `ConflictEntry` (local content is read fresh on modal open)
- `src/conflict-resolver.ts` — `applyConflict()` opens the modal in addition to (or instead of) showing a notice
- `src/main.ts` — `checkActiveConflictState()` notice adds a "View details" button that re-opens the modal for the active conflict
- `src/styles.css` — CSS classes for diff hunks, metadata row, and action bar

### Unchanged
- Conflict detection logic (sound as-is)
- Command palette resolve commands (kept as fallback)
- Lock behavior (no lock acquired during diff viewing)

## Design decisions

- **Fresh local content on open**: The modal reads the file when opened, not when the conflict was detected. If the user edits the file between detection and opening the modal, they see the current state.
- **No lock during viewing**: Viewing the diff is read-only decision-making. The push flow already handles checkout/update/checkin. Locking while reading would block others unnecessarily.
- **Accept remote as primary**: It's the safer default — preserves the remote contributor's work. The user can still choose keep local.
- **No ServiceNow instance link**: The remote content is already pulled down and shown in the diff. No need to open the browser.

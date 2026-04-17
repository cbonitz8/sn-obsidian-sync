import { describe, it, expect } from "vitest";
import { computeDiff, extractHunks, computeSideBySide, extractSideBySideHunks, extractChangeGroups, assembleDiffWithLineChoices, type DiffLine } from "./diff";

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

describe("computeSideBySide", () => {
  it("returns empty array for identical content", () => {
    const result = computeSideBySide("hello\nworld", "hello\nworld");
    expect(result).toEqual([]);
  });

  it("pairs context lines on both sides", () => {
    const result = computeSideBySide("a\nold\nc", "a\nnew\nc");
    expect(result).toContainEqual({
      left: { text: "a", type: "context" },
      right: { text: "a", type: "context" },
    });
    expect(result).toContainEqual({
      left: { text: "c", type: "context" },
      right: { text: "c", type: "context" },
    });
  });

  it("shows removed lines on left with null on right", () => {
    const result = computeSideBySide("a\nb\nc", "a\nc");
    const removedRow = result.find((r) => r.left?.text === "b");
    expect(removedRow).toBeDefined();
    expect(removedRow!.left).toMatchObject({ text: "b", type: "removed" });
    expect(removedRow!.right).toBeNull();
  });

  it("shows added lines on right with null on left", () => {
    const result = computeSideBySide("a\nc", "a\nb\nc");
    const addedRow = result.find((r) => r.right?.text === "b");
    expect(addedRow).toBeDefined();
    expect(addedRow!.left).toBeNull();
    expect(addedRow!.right).toMatchObject({ text: "b", type: "added" });
  });

  it("pairs changed lines side by side", () => {
    const result = computeSideBySide("a\nold\nc", "a\nnew\nc");
    const changedRow = result.find((r) => r.left?.text === "old");
    expect(changedRow).toBeDefined();
    expect(changedRow!.left).toMatchObject({ text: "old", type: "removed" });
    expect(changedRow!.right).toMatchObject({ text: "new", type: "added" });
  });

  it("handles multiple consecutive changes with unequal counts", () => {
    const result = computeSideBySide("a\nx\ny\nc", "a\np\nc");
    const xRow = result.find((r) => r.left?.text === "x");
    expect(xRow!.right).toMatchObject({ text: "p", type: "added" });
    const yRow = result.find((r) => r.left?.text === "y");
    expect(yRow!.right).toBeNull();
  });

  it("handles empty local content", () => {
    const result = computeSideBySide("", "new line");
    expect(result[0]!.left).toBeNull();
    expect(result[0]!.right).toMatchObject({ text: "new line", type: "added" });
  });

  it("handles empty remote content", () => {
    const result = computeSideBySide("old line", "");
    expect(result[0]!.left).toMatchObject({ text: "old line", type: "removed" });
    expect(result[0]!.right).toBeNull();
  });
});

describe("extractSideBySideHunks", () => {
  it("trims context-only lines and shows hunks with 3-line context", () => {
    // 10 identical lines, then 1 changed line, then 10 more identical
    const localLines = Array.from({ length: 21 }, (_, i) => i === 10 ? "OLD" : `line ${i}`);
    const remoteLines = Array.from({ length: 21 }, (_, i) => i === 10 ? "NEW" : `line ${i}`);
    const local = localLines.join("\n");
    const remote = remoteLines.join("\n");

    const allLines = computeSideBySide(local, remote);
    expect(allLines.length).toBe(21); // all 21 lines present

    const hunks = extractSideBySideHunks(allLines);
    expect(hunks.length).toBe(1);
    // 3 context before + 1 changed + 3 context after = 7
    expect(hunks[0]!.lines.length).toBe(7);
    // Changed line should be in the middle
    const changed = hunks[0]!.lines.find((l) => l.left?.type === "removed");
    expect(changed).toBeDefined();
    expect(changed!.left!.text).toBe("OLD");
    expect(changed!.right!.text).toBe("NEW");
  });
});

describe("extractChangeGroups", () => {
  it("returns empty for identical content", () => {
    const diff = computeDiff("a\nb", "a\nb");
    expect(extractChangeGroups(diff)).toEqual([]);
  });

  it("identifies single change group", () => {
    const diff = computeDiff("a\nb\nc", "a\nX\nc");
    const groups = extractChangeGroups(diff);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.index).toBe(0);
    expect(groups[0]!.hasLocal).toBe(true);
    expect(groups[0]!.hasRemote).toBe(true);
  });

  it("identifies separate change groups", () => {
    const diff = computeDiff("a\nb\nc\nd\ne", "a\nB\nc\nD\ne");
    const groups = extractChangeGroups(diff);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.index).toBe(0);
    expect(groups[1]!.index).toBe(1);
  });

  it("detects local-only and remote-only groups", () => {
    const diff = computeDiff("a\nb\nc", "a\nc\nX");
    const groups = extractChangeGroups(diff);
    expect(groups.some((g) => g.hasLocal && !g.hasRemote)).toBe(true);
    expect(groups.some((g) => !g.hasLocal && g.hasRemote)).toBe(true);
  });
});

describe("assembleDiffWithLineChoices", () => {
  it("keeps local when all removed=true and added=false", () => {
    const diff = computeDiff("a\nb\nc", "a\nX\nc");
    // diff: context a, removed b (idx 1), added X (idx 2), context c
    const choices = new Map([[1, true], [2, false]]);
    expect(assembleDiffWithLineChoices(diff, choices)).toBe("a\nb\nc");
  });

  it("takes remote when removed=false and added=true", () => {
    const diff = computeDiff("a\nb\nc", "a\nX\nc");
    const choices = new Map([[1, false], [2, true]]);
    expect(assembleDiffWithLineChoices(diff, choices)).toBe("a\nX\nc");
  });

  it("includes both sides (additive merge)", () => {
    const diff = computeDiff("a\nb\nc", "a\nX\nc");
    const choices = new Map([[1, true], [2, true]]);
    expect(assembleDiffWithLineChoices(diff, choices)).toBe("a\nb\nX\nc");
  });

  it("excludes both sides (deletion)", () => {
    const diff = computeDiff("a\nb\nc", "a\nX\nc");
    const choices = new Map([[1, false], [2, false]]);
    expect(assembleDiffWithLineChoices(diff, choices)).toBe("a\nc");
  });

  it("cherry-picks individual lines from a multi-line change group", () => {
    // The motivating use case: 2 removed + 1 added in one group
    const diff = computeDiff("a\ndelete\nkeep this\nb", "a\nhm\nb");
    // diff: context a, removed delete (1), removed keep this (2), added hm (3), context b
    const choices = new Map([[1, false], [2, true], [3, true]]);
    expect(assembleDiffWithLineChoices(diff, choices)).toBe("a\nkeep this\nhm\nb");
  });

  it("handles multiple change groups independently", () => {
    const diff = computeDiff("a\nb\nc\nd\ne", "a\nB\nc\nD\ne");
    // group 0: removed b (1), added B (2); group 1: removed d (4), added D (5)
    const choices = new Map([[1, true], [2, false], [4, false], [5, true]]);
    expect(assembleDiffWithLineChoices(diff, choices)).toBe("a\nb\nc\nD\ne");
  });

  it("context lines always included regardless of choices", () => {
    const diff = computeDiff("a\nb", "a\nc");
    const choices = new Map([[1, false], [2, false]]);
    expect(assembleDiffWithLineChoices(diff, choices)).toBe("a");
  });
});

describe("computeSideBySide diffIndex annotation", () => {
  it("annotates removed cells with correct diffIndex", () => {
    const sbs = computeSideBySide("a\nb\nc", "a\nc");
    // diff: context a (0), removed b (1), context c (2)
    const removedRow = sbs.find((r) => r.left?.type === "removed");
    expect(removedRow).toBeDefined();
    expect(removedRow!.left!.diffIndex).toBe(1);
  });

  it("annotates added cells with correct diffIndex", () => {
    const sbs = computeSideBySide("a\nc", "a\nb\nc");
    // diff: context a (0), added b (1), context c (2)
    const addedRow = sbs.find((r) => r.right?.type === "added");
    expect(addedRow).toBeDefined();
    expect(addedRow!.right!.diffIndex).toBe(1);
  });

  it("annotates paired removed+added with correct diffIndices", () => {
    const sbs = computeSideBySide("a\nold\nc", "a\nnew\nc");
    // diff: context a (0), removed old (1), added new (2), context c (3)
    const pairedRow = sbs.find((r) => r.left?.type === "removed" && r.right?.type === "added");
    expect(pairedRow).toBeDefined();
    expect(pairedRow!.left!.diffIndex).toBe(1);
    expect(pairedRow!.right!.diffIndex).toBe(2);
  });

  it("context cells have no diffIndex", () => {
    const sbs = computeSideBySide("a\nb", "a\nc");
    const contextRow = sbs.find((r) => r.left?.type === "context");
    expect(contextRow).toBeDefined();
    expect(contextRow!.left!.diffIndex).toBeUndefined();
  });

  it("multi-line removed run has sequential diffIndices", () => {
    const sbs = computeSideBySide("a\nb\nc\nd", "a\nd");
    // diff: context a (0), removed b (1), removed c (2), context d (3)
    const removedRows = sbs.filter((r) => r.left?.type === "removed");
    expect(removedRows).toHaveLength(2);
    expect(removedRows[0]!.left!.diffIndex).toBe(1);
    expect(removedRows[1]!.left!.diffIndex).toBe(2);
  });
});

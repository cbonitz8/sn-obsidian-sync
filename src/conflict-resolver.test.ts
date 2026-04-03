import { describe, it, expect } from "vitest";
import { injectConflictMarkers, hasConflictMarkers } from "./conflict-resolver";

describe("injectConflictMarkers", () => {
  it("wraps local and remote content in git-style markers", () => {
    const result = injectConflictMarkers("local content", "remote content");
    expect(result).toBe(
      "<<<<<<< Local (Obsidian)\nlocal content\n=======\nremote content\n>>>>>>> Remote (ServiceNow)"
    );
  });

  it("preserves multiline content", () => {
    const local = "line 1\nline 2";
    const remote = "line A\nline B";
    const result = injectConflictMarkers(local, remote);
    expect(result).toContain("line 1\nline 2");
    expect(result).toContain("line A\nline B");
  });
});

describe("hasConflictMarkers", () => {
  it("detects conflict markers", () => {
    const content = "some text\n<<<<<<< Local (Obsidian)\nfoo\n=======\nbar\n>>>>>>> Remote (ServiceNow)\nmore text";
    expect(hasConflictMarkers(content)).toBe(true);
  });

  it("returns false for clean content", () => {
    expect(hasConflictMarkers("just normal text")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { resolveFilePath, inferMetadataFromPath, sanitizeTitle } from "./folder-mapper";
import type { FolderMapping } from "./types";

const MAPPING: FolderMapping = {
  projects: true,
  categories: {
    session_log: "Session Logs",
    design_spec: "Design Specs",
    qa_document: {
      root: "QA",
      subfolders: ["In Progress", "Complete"],
    },
    reference: "Resources",
  },
  custom: [
    { path: "Resources/Reusable Components/Widgets", tag: "widget" },
  ],
};

describe("resolveFilePath", () => {
  it("places doc with project + category", () => {
    const result = resolveFilePath(MAPPING, "My Doc", "Project Alpha", "session_log", "");
    expect(result).toBe("Project Alpha/Session Logs/My Doc.md");
  });

  it("places doc with project only", () => {
    const result = resolveFilePath(MAPPING, "My Doc", "Project Alpha", "", "");
    expect(result).toBe("Project Alpha/My Doc.md");
  });

  it("places doc with category only", () => {
    const result = resolveFilePath(MAPPING, "My Doc", "", "design_spec", "");
    expect(result).toBe("Design Specs/My Doc.md");
  });

  it("places doc with neither at vault root", () => {
    const result = resolveFilePath(MAPPING, "My Doc", "", "", "");
    expect(result).toBe("My Doc.md");
  });

  it("places QA doc in root subfolder when no status specified", () => {
    const result = resolveFilePath(MAPPING, "Audit Review", "", "qa_document", "");
    expect(result).toBe("QA/In Progress/Audit Review.md");
  });

  it("uses custom tag mapping when tag matches", () => {
    const result = resolveFilePath(MAPPING, "eg-select", "", "", "widget");
    expect(result).toBe("Resources/Reusable Components/Widgets/eg-select.md");
  });
});

describe("inferMetadataFromPath", () => {
  it("infers project and category from path", () => {
    const result = inferMetadataFromPath("Project Alpha/Session Logs/My Doc.md", MAPPING);
    expect(result.project).toBe("Project Alpha");
    expect(result.category).toBe("session_log");
  });

  it("infers project only when no category folder", () => {
    const result = inferMetadataFromPath("Project Alpha/overview.md", MAPPING);
    expect(result.project).toBe("Project Alpha");
    expect(result.category).toBe("");
  });

  it("infers category only when no project folder", () => {
    const result = inferMetadataFromPath("Design Specs/My Doc.md", MAPPING);
    expect(result.project).toBe("");
    expect(result.category).toBe("design_spec");
  });

  it("infers custom tag from path", () => {
    const result = inferMetadataFromPath("Resources/Reusable Components/Widgets/eg-select.md", MAPPING);
    expect(result.tag).toBe("widget");
  });

  it("returns empty for file at vault root", () => {
    const result = inferMetadataFromPath("random.md", MAPPING);
    expect(result.project).toBe("");
    expect(result.category).toBe("");
  });
});

describe("sanitizeTitle", () => {
  it("removes filesystem-unsafe characters", () => {
    expect(sanitizeTitle("My Doc: A/B Test")).toBe("My Doc- A-B Test");
  });

  it("trims whitespace", () => {
    expect(sanitizeTitle("  hello  ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(sanitizeTitle("")).toBe("Untitled");
  });
});

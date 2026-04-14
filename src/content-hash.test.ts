import { describe, it, expect } from "vitest";
import { normalizeContent, contentHash } from "./content-hash";

describe("normalizeContent", () => {
  it("trims trailing whitespace per line", () => {
    expect(normalizeContent("hello   \nworld  ")).toBe("hello\nworld\n");
  });

  it("collapses multiple trailing newlines to one", () => {
    expect(normalizeContent("hello\nworld\n\n\n")).toBe("hello\nworld\n");
  });

  it("preserves leading whitespace", () => {
    expect(normalizeContent("  indented\n    more")).toBe("  indented\n    more\n");
  });

  it("handles empty string", () => {
    expect(normalizeContent("")).toBe("\n");
  });

  it("handles single newline", () => {
    expect(normalizeContent("\n")).toBe("\n");
  });

  it("handles content with no trailing whitespace", () => {
    expect(normalizeContent("clean\nlines")).toBe("clean\nlines\n");
  });
});

describe("contentHash", () => {
  it("returns same hash for identical content", () => {
    expect(contentHash("hello\nworld")).toBe(contentHash("hello\nworld"));
  });

  it("returns same hash when only trailing whitespace differs", () => {
    expect(contentHash("hello   \nworld  ")).toBe(contentHash("hello\nworld"));
  });

  it("returns same hash when trailing newlines differ", () => {
    expect(contentHash("hello\nworld\n\n\n")).toBe(contentHash("hello\nworld"));
  });

  it("returns different hash for different content", () => {
    expect(contentHash("hello")).not.toBe(contentHash("world"));
  });

  it("returns a string", () => {
    expect(typeof contentHash("test")).toBe("string");
  });
});

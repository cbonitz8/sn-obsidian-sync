import type { FolderMapping } from "./types";

/**
 * Resolve a document's vault file path based on its metadata and folder mapping config.
 * Paths are relative to vault root.
 */
export function resolveFilePath(
  mapping: FolderMapping,
  title: string,
  project: string,
  category: string,
  tag: string
): string {
  const filename = `${sanitizeTitle(title)}.md`;

  // Check custom tag mappings first
  if (tag) {
    const custom = mapping.custom.find((c) => c.tag === tag);
    if (custom) {
      return `${custom.path}/${filename}`;
    }
  }

  const parts: string[] = [];

  if (mapping.projects && project) {
    parts.push(project);
  }

  if (category) {
    const catMapping = mapping.categories[category];
    if (catMapping) {
      if (typeof catMapping === "string") {
        parts.push(catMapping);
      } else {
        // Structured mapping with subfolders — default to first subfolder
        parts.push(catMapping.root);
        parts.push(catMapping.subfolders[0] ?? "");
      }
    }
  }

  parts.push(filename);
  return parts.filter((p) => p.length > 0).join("/");
}

/**
 * Infer document metadata (project, category, tag) from a file's vault path.
 * Reverse lookup against the folder mapping.
 */
export function inferMetadataFromPath(
  filePath: string,
  mapping: FolderMapping
): { project: string; category: string; tag: string } {
  const result = { project: "", category: "", tag: "" };

  const segments = filePath.split("/");

  // Need at least a filename
  if (segments.length < 1) {
    return result;
  }

  // Check custom mappings first (full path match)
  for (const custom of mapping.custom) {
    const pathWithoutFile = segments.slice(0, -1).join("/");
    if (pathWithoutFile === custom.path || pathWithoutFile.startsWith(custom.path + "/")) {
      result.tag = custom.tag;
      return result;
    }
  }

  // Only a filename — no project or category
  if (segments.length === 1) {
    return result;
  }

  // Build reverse category map: folder name -> category key
  const categoryByFolder = buildCategoryReverseMap(mapping);

  if (mapping.projects && segments.length >= 2) {
    const possibleProject = segments[0]!;
    const possibleCatFolder = segments.length >= 3 ? segments[1]! : "";

    // Check if the first segment is a known category folder
    if (categoryByFolder.has(possibleProject)) {
      result.category = categoryByFolder.get(possibleProject)!;
      return result;
    }

    result.project = possibleProject;

    if (possibleCatFolder && categoryByFolder.has(possibleCatFolder)) {
      result.category = categoryByFolder.get(possibleCatFolder)!;
    }
  } else if (segments.length >= 2) {
    const possibleCatFolder = segments[0]!;
    if (categoryByFolder.has(possibleCatFolder)) {
      result.category = categoryByFolder.get(possibleCatFolder)!;
    }
  }

  return result;
}

function buildCategoryReverseMap(mapping: FolderMapping): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(mapping.categories)) {
    if (typeof value === "string") {
      map.set(value, key);
    } else {
      map.set(value.root, key);
      for (const sub of value.subfolders) {
        map.set(sub, key);
      }
    }
  }
  return map;
}

/**
 * Sanitize a document title for use as a filename.
 */
export function sanitizeTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) return "Untitled";
  return trimmed.replace(/[\\/:*?"<>|]/g, "-");
}

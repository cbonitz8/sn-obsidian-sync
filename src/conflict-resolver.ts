import type { App, TFile } from "obsidian";
import type { FrontmatterManager } from "./frontmatter-manager";

const MARKER_LOCAL = "<<<<<<< Local (Obsidian)";
const MARKER_SEPARATOR = "=======";
const MARKER_REMOTE = ">>>>>>> Remote (ServiceNow)";

/** Inject git-style conflict markers around local and remote content */
export function injectConflictMarkers(localContent: string, remoteContent: string): string {
  return `${MARKER_LOCAL}\n${localContent}\n${MARKER_SEPARATOR}\n${remoteContent}\n${MARKER_REMOTE}`;
}

/** Check whether content contains conflict markers */
export function hasConflictMarkers(content: string): boolean {
  return content.includes(MARKER_LOCAL) && content.includes(MARKER_REMOTE);
}

export class ConflictResolver {
  private app: App;
  private frontmatterManager: FrontmatterManager;

  constructor(app: App, frontmatterManager: FrontmatterManager) {
    this.app = app;
    this.frontmatterManager = frontmatterManager;
  }

  /**
   * Handle a conflict: local file has unsync'd edits AND remote has changed.
   * Injects conflict markers into the local file content (after frontmatter).
   */
  async applyConflict(file: TFile, remoteContent: string) {
    const localFull = await this.app.vault.read(file);
    const localContent = stripFrontmatter(localFull);
    const merged = injectConflictMarkers(localContent, remoteContent);
    const frontmatter = extractFrontmatter(localFull);
    await this.app.vault.modify(file, frontmatter + merged);
    await this.frontmatterManager.markDirty(file);
  }
}

/** Extract the frontmatter block (including delimiters and trailing newline) from file content */
function extractFrontmatter(content: string): string {
  if (!content.startsWith("---")) return "";
  const endIndex = content.indexOf("---", 3);
  if (endIndex === -1) return "";
  return content.slice(0, endIndex + 3) + "\n";
}

/** Strip the frontmatter block from file content, returning just the body */
function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const endIndex = content.indexOf("---", 3);
  if (endIndex === -1) return content;
  return content.slice(endIndex + 3).replace(/^\n+/, "");
}

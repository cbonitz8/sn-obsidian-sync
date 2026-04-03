import { TFile } from "obsidian";
import type SNSyncPlugin from "./main";
import type { FrontmatterManager } from "./frontmatter-manager";
import type { ApiClient } from "./api-client";

const DEBOUNCE_MS = 500;

export class FileWatcher {
  private plugin: SNSyncPlugin;
  private frontmatterManager: FrontmatterManager;
  private apiClient: ApiClient;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  /** Paths currently being written to by the sync engine — skip these to avoid loops */
  private syncWritePaths: Set<string> = new Set();

  constructor(plugin: SNSyncPlugin, frontmatterManager: FrontmatterManager, apiClient: ApiClient) {
    this.plugin = plugin;
    this.frontmatterManager = frontmatterManager;
    this.apiClient = apiClient;
  }

  /** Start listening to vault events */
  start() {
    this.plugin.registerEvent(
      this.plugin.app.vault.on("modify", (file) => {
        if (file instanceof TFile) this.onModify(file);
      })
    );

    this.plugin.registerEvent(
      this.plugin.app.vault.on("delete", (file) => {
        if (file instanceof TFile) this.onDelete(file);
      })
    );

    this.plugin.registerEvent(
      this.plugin.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) this.onRename(file, oldPath);
      })
    );
  }

  /** Mark a path as being written by the sync engine (suppresses FileWatcher reaction) */
  addSyncWritePath(path: string) {
    this.syncWritePaths.add(path);
  }

  /** Remove a path from the sync-write suppression set */
  removeSyncWritePath(path: string) {
    this.syncWritePaths.delete(path);
  }

  private isSyncedFile(path: string): boolean {
    if (!path.endsWith(".md")) return false;
    return !this.isExcluded(path);
  }

  isExcluded(path: string): boolean {
    for (const pattern of this.plugin.settings.excludePaths) {
      if (path.startsWith(pattern) || path === pattern) return true;
      if (pattern.startsWith("*") && path.endsWith(pattern.slice(1))) return true;
    }
    return false;
  }

  private onModify(file: TFile) {
    if (!this.isSyncedFile(file.path)) return;
    if (this.syncWritePaths.has(file.path)) return;

    // Debounce rapid saves
    const existing = this.debounceTimers.get(file.path);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      file.path,
      setTimeout(async () => {
        this.debounceTimers.delete(file.path);
        await this.handleFileModified(file);
      }, DEBOUNCE_MS)
    );
  }

  private async handleFileModified(file: TFile) {
    const fm = await this.frontmatterManager.read(file);

    // Don't mark dirty if already dirty
    if (fm.synced === false) return;

    await this.frontmatterManager.markDirty(file);

    // Auto-checkout if enabled and doc has a sys_id
    if (this.plugin.settings.checkoutOnEdit && fm.sys_id) {
      try {
        await this.apiClient.checkout(fm.sys_id);
      } catch (e) {
        console.error("SN Sync: Auto-checkout failed", e);
      }
    }
  }

  private async onDelete(file: TFile) {
    if (!this.isSyncedFile(file.path)) return;

    // Find the sys_id for this file from the docMap
    const entry = Object.values(this.plugin.syncState.docMap).find(
      (e) => e.path === file.path
    );
    if (!entry) return;

    const behavior = this.plugin.settings.localDeleteBehavior;

    switch (behavior) {
      case "ignore":
        this.plugin.syncState.ignoredIds.push(entry.sysId);
        delete this.plugin.syncState.docMap[entry.sysId];
        await this.plugin.saveSettings();
        break;
      case "re-pull":
        // Do nothing — the next sync cycle will re-create the file
        break;
      case "archive": {
        // File is already deleted, but we can re-fetch and place in archive
        // For now, add to ignore list — archive will be handled by sync engine on next pull
        this.plugin.syncState.ignoredIds.push(entry.sysId);
        delete this.plugin.syncState.docMap[entry.sysId];
        await this.plugin.saveSettings();
        break;
      }
    }
  }

  private async onRename(file: TFile, oldPath: string) {
    if (!this.isSyncedFile(file.path) && !this.isSyncedFile(oldPath)) return;

    // Update docMap to reflect the new path
    const entry = Object.values(this.plugin.syncState.docMap).find(
      (e) => e.path === oldPath
    );
    if (entry) {
      entry.path = file.path;
      await this.plugin.saveSettings();
    }
  }

  /** Get all files in the sync folder that have sn_synced: false */
  async getDirtyFiles(): Promise<TFile[]> {
    const allFiles = this.plugin.app.vault.getMarkdownFiles();
    const dirtyFiles: TFile[] = [];

    for (const file of allFiles) {
      if (this.isExcluded(file.path)) continue;
      const fm = await this.frontmatterManager.read(file);
      if (fm.synced === false) {
        dirtyFiles.push(file);
      }
    }

    return dirtyFiles;
  }
}

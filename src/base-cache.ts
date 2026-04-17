import type { App } from "obsidian";

export class BaseCache {
  private app: App;
  private cachePath: string;
  private cache: Record<string, string> | null = null;

  constructor(app: App, pluginDir: string) {
    this.app = app;
    this.cachePath = `${pluginDir}/sync-base-cache.json`;
  }

  private async ensureLoaded(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    try {
      const raw = await this.app.vault.adapter.read(this.cachePath);
      this.cache = JSON.parse(raw) as Record<string, string>;
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    if (!this.cache) return;
    const dir = this.cachePath.substring(0, this.cachePath.lastIndexOf("/"));
    if (!(await this.app.vault.adapter.exists(dir))) {
      await this.app.vault.adapter.mkdir(dir);
    }
    await this.app.vault.adapter.write(this.cachePath, JSON.stringify(this.cache));
  }

  async loadBase(sysId: string): Promise<string | null> {
    const data = await this.ensureLoaded();
    return data[sysId] ?? null;
  }

  async saveBase(sysId: string, body: string): Promise<void> {
    const data = await this.ensureLoaded();
    data[sysId] = body;
    await this.persist();
  }

  async removeBase(sysId: string): Promise<void> {
    const data = await this.ensureLoaded();
    delete data[sysId];
    await this.persist();
  }

  /** Remove cache entries not present in the active docMap. */
  async evictOrphans(activeSysIds: Set<string>): Promise<number> {
    const data = await this.ensureLoaded();
    let evicted = 0;
    for (const key of Object.keys(data)) {
      if (!activeSysIds.has(key)) {
        delete data[key];
        evicted++;
      }
    }
    if (evicted > 0) await this.persist();
    return evicted;
  }
}

import type { App } from "obsidian";

export class BaseCache {
  private app: App;
  private cachePath: string;
  private cache: Record<string, string> | null = null;

  constructor(app: App, pluginId: string) {
    this.app = app;
    this.cachePath = `${app.vault.configDir}/plugins/${pluginId}/sync-base-cache.json`;
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
}

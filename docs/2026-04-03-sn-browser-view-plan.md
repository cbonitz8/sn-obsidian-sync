# SN Browser View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-pane ItemView for browsing SN documents, selectively downloading them, and managing sync exclusions.

**Architecture:** A single `ItemView` subclass with internal tab switching (Browse / Sync Settings). The browse tab renders a tree + document list from cached API data. Downloads reuse the existing `SyncEngine.createLocalFile()`. Exclude list stored in settings, enforced by FileWatcher.

**Tech Stack:** TypeScript, Obsidian ItemView API, existing plugin modules (ApiClient, SyncEngine, FrontmatterManager)

---

### Task 1: Add excludePaths to settings + enforce in FileWatcher

**Files:**
- Modify: `src/types.ts`
- Modify: `src/settings.ts`
- Modify: `src/file-watcher.ts`

- [ ] **Step 1: Add `excludePaths` to SNSyncSettings in types.ts**

Add after `folderMapping`:

```typescript
  folderMapping: FolderMapping;
  excludePaths: string[];
}
```

- [ ] **Step 2: Add default in settings.ts**

Add `excludePaths: []` to `DEFAULT_SETTINGS`:

```typescript
  folderMapping: DEFAULT_FOLDER_MAPPING,
  excludePaths: [],
};
```

- [ ] **Step 3: Add exclude check to FileWatcher**

In `src/file-watcher.ts`, update `isSyncedFile` to also check the exclude list:

```typescript
  private isSyncedFile(path: string): boolean {
    if (!path.endsWith(".md")) return false;
    return !this.isExcluded(path);
  }

  private isExcluded(path: string): boolean {
    for (const pattern of this.plugin.settings.excludePaths) {
      if (path.startsWith(pattern) || path === pattern) return true;
      // Simple glob: *.extension
      if (pattern.startsWith("*") && path.endsWith(pattern.slice(1))) return true;
    }
    return false;
  }
```

Also update `getDirtyFiles` to filter excluded paths:

```typescript
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
```

- [ ] **Step 4: Make `isExcluded` public for the browser view to use**

Change `private isExcluded` to `isExcluded` (no access modifier = public in TS convention, or explicitly `public`).

- [ ] **Step 5: Verify build**

Run: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/settings.ts src/file-watcher.ts
git commit -m "feat: add excludePaths setting and enforce in FileWatcher"
```

---

### Task 2: Make SyncEngine.createLocalFile public

**Files:**
- Modify: `src/sync-engine.ts`

- [ ] **Step 1: Change createLocalFile visibility**

In `src/sync-engine.ts`, change `private async createLocalFile` to `async createLocalFile` on the method that starts around line 463.

Also change `private async ensureFolderExists` to `async ensureFolderExists` and `private async resolveCollision` to `async resolveCollision` since `createLocalFile` depends on them.

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/sync-engine.ts
git commit -m "feat: expose createLocalFile as public for browser view"
```

---

### Task 3: Expose apiClient and syncEngine on plugin

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Make apiClient and syncEngine public**

In `src/main.ts`, change:
- `private apiClient!: ApiClient;` → `apiClient!: ApiClient;`
- `private syncEngine!: SyncEngine;` → `syncEngine!: SyncEngine;`

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: expose apiClient and syncEngine for browser view access"
```

---

### Task 4: Create the SN Browser View — shell with tab switching

**Files:**
- Create: `src/sn-browser-view.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create src/sn-browser-view.ts with view registration and tab switching**

```typescript
import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type SNSyncPlugin from "./main";
import type { SNDocument, SNMetadata } from "./types";

export const VIEW_TYPE_SN_BROWSER = "sn-document-browser";

export class SNBrowserView extends ItemView {
  private plugin: SNSyncPlugin;
  private activeTab: "browse" | "settings" = "browse";
  private serverDocs: SNDocument[] = [];
  private metadata: SNMetadata | null = null;
  private isLoading = false;

  constructor(leaf: WorkspaceLeaf, plugin: SNSyncPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_SN_BROWSER;
  }

  getDisplayText(): string {
    return "SN Browser";
  }

  getIcon(): string {
    return "cloud";
  }

  async onOpen() {
    await this.render();
  }

  async onClose() {}

  private async render() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("sn-browser");

    // Tab bar
    const tabBar = container.createDiv({ cls: "sn-browser-tabs" });
    const browseTab = tabBar.createEl("button", {
      text: "Browse SN",
      cls: `sn-browser-tab ${this.activeTab === "browse" ? "is-active" : ""}`,
    });
    const settingsTab = tabBar.createEl("button", {
      text: "Sync Settings",
      cls: `sn-browser-tab ${this.activeTab === "settings" ? "is-active" : ""}`,
    });

    browseTab.addEventListener("click", () => {
      this.activeTab = "browse";
      this.render();
    });
    settingsTab.addEventListener("click", () => {
      this.activeTab = "settings";
      this.render();
    });

    // Content area
    const content = container.createDiv({ cls: "sn-browser-content" });

    if (this.activeTab === "browse") {
      await this.renderBrowseTab(content);
    } else {
      this.renderSettingsTab(content);
    }
  }

  private async renderBrowseTab(container: HTMLElement) {
    container.createEl("p", { text: "Loading...", cls: "sn-browser-loading" });
    // Will be implemented in Task 5
  }

  private renderSettingsTab(container: HTMLElement) {
    container.createEl("p", { text: "Sync settings will appear here." });
    // Will be implemented in Task 8
  }
}
```

- [ ] **Step 2: Register the view and add command in main.ts**

Add imports at the top of `src/main.ts`:

```typescript
import { SNBrowserView, VIEW_TYPE_SN_BROWSER } from "./sn-browser-view";
```

Add in `onload()`, after the settings tab registration:

```typescript
    // SN Browser view
    this.registerView(
      VIEW_TYPE_SN_BROWSER,
      (leaf) => new SNBrowserView(leaf, this)
    );

    this.addCommand({
      id: "open-sn-browser",
      name: "Open SN Browser",
      callback: () => {
        const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_SN_BROWSER);
        if (existing.length > 0) {
          this.app.workspace.revealLeaf(existing[0]!);
        } else {
          const leaf = this.app.workspace.getLeaf("tab");
          leaf.setViewState({ type: VIEW_TYPE_SN_BROWSER, active: true });
        }
      },
    });
```

Add in `onunload()`:

```typescript
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_SN_BROWSER);
```

- [ ] **Step 3: Add basic tab styles to styles.css**

```css
.sn-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sn-browser-tabs {
  display: flex;
  border-bottom: 1px solid var(--background-modifier-border);
  padding: 0 8px;
}

.sn-browser-tab {
  padding: 8px 16px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.9em;
  color: var(--text-muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.sn-browser-tab.is-active {
  color: var(--text-normal);
  border-bottom-color: var(--interactive-accent);
}

.sn-browser-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.sn-browser-loading {
  color: var(--text-muted);
  font-style: italic;
}
```

- [ ] **Step 4: Verify build and test**

Run: `npm run build`
Manual test: Reload Obsidian, Cmd+P → "Open SN Browser". Should see a tab with "Browse SN" and "Sync Settings" buttons. Clicking switches the content area.

- [ ] **Step 5: Commit**

```bash
git add src/sn-browser-view.ts src/main.ts styles.css
git commit -m "feat: add SN Browser view shell with tab switching"
```

---

### Task 5: Browse tab — fetch data and render filter bar

**Files:**
- Modify: `src/sn-browser-view.ts`

- [ ] **Step 1: Implement data fetching and filter bar**

Replace the `renderBrowseTab` method:

```typescript
  private selectedProject = "";
  private selectedCategory = "";
  private selectedStatus = "";
  private searchQuery = "";
  private selectedDocIds: Set<string> = new Set();

  private async fetchData() {
    if (this.serverDocs.length > 0) return; // use cache
    this.isLoading = true;

    const [docsResponse, metaResponse] = await Promise.all([
      this.plugin.apiClient.getDocuments(),
      this.plugin.apiClient.getMetadata(),
    ]);

    if (docsResponse.ok && docsResponse.data) {
      this.serverDocs = Array.isArray(docsResponse.data)
        ? docsResponse.data
        : [docsResponse.data];
    }
    if (metaResponse.ok && metaResponse.data) {
      this.metadata = metaResponse.data;
    }

    this.isLoading = false;
  }

  private getDocStatus(doc: SNDocument): string {
    const entry = this.plugin.syncState.docMap[doc.sys_id];
    if (!entry) return "not-downloaded";
    // Check if local file has pending changes
    const file = this.plugin.app.vault.getAbstractFileByPath(entry.path);
    if (!file) return "not-downloaded";
    return "synced";
  }

  private getFilteredDocs(): SNDocument[] {
    return this.serverDocs.filter((doc) => {
      if (this.selectedProject && doc.project !== this.selectedProject) return false;
      if (this.selectedCategory && doc.category !== this.selectedCategory) return false;
      if (this.selectedStatus) {
        const status = this.getDocStatus(doc);
        if (this.selectedStatus !== status) return false;
      }
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        if (!doc.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  private async renderBrowseTab(container: HTMLElement) {
    await this.fetchData();

    if (this.isLoading) {
      container.createEl("p", { text: "Loading documents from ServiceNow...", cls: "sn-browser-loading" });
      return;
    }

    if (this.serverDocs.length === 0) {
      container.createEl("p", { text: "No documents found. Check your connection settings." });
      return;
    }

    // Filter bar
    const filterBar = container.createDiv({ cls: "sn-filter-bar" });

    // Project filter
    const projectSelect = filterBar.createEl("select", { cls: "sn-filter-select" });
    projectSelect.createEl("option", { text: "All Projects", value: "" });
    if (this.metadata) {
      for (const proj of this.metadata.projects) {
        const opt = projectSelect.createEl("option", { text: proj.label, value: proj.value });
        if (this.selectedProject === proj.value) opt.selected = true;
      }
    }
    projectSelect.addEventListener("change", () => {
      this.selectedProject = projectSelect.value;
      this.render();
    });

    // Category filter
    const categorySelect = filterBar.createEl("select", { cls: "sn-filter-select" });
    categorySelect.createEl("option", { text: "All Categories", value: "" });
    if (this.metadata) {
      for (const cat of this.metadata.categories) {
        const opt = categorySelect.createEl("option", { text: cat.label, value: cat.value });
        if (this.selectedCategory === cat.value) opt.selected = true;
      }
    }
    categorySelect.addEventListener("change", () => {
      this.selectedCategory = categorySelect.value;
      this.render();
    });

    // Status filter
    const statusSelect = filterBar.createEl("select", { cls: "sn-filter-select" });
    statusSelect.createEl("option", { text: "All Status", value: "" });
    statusSelect.createEl("option", { text: "Synced", value: "synced" });
    statusSelect.createEl("option", { text: "Not Downloaded", value: "not-downloaded" });
    statusSelect.value = this.selectedStatus;
    statusSelect.addEventListener("change", () => {
      this.selectedStatus = statusSelect.value;
      this.render();
    });

    // Search
    const searchInput = filterBar.createEl("input", {
      type: "text",
      placeholder: "Search by title...",
      cls: "sn-filter-search",
      value: this.searchQuery,
    });
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.render();
    });

    // Refresh button
    const refreshBtn = filterBar.createEl("button", { text: "↻", cls: "sn-filter-refresh" });
    refreshBtn.addEventListener("click", () => {
      this.serverDocs = [];
      this.metadata = null;
      this.render();
    });

    // Two-pane container
    const panes = container.createDiv({ cls: "sn-browser-panes" });
    this.renderTree(panes);
    this.renderDocList(panes);
  }
```

- [ ] **Step 2: Add filter bar styles to styles.css**

```css
.sn-filter-bar {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.sn-filter-select {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 0.85em;
}

.sn-filter-search {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 0.85em;
  flex: 1;
  min-width: 120px;
}

.sn-filter-refresh {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--background-modifier-border);
  background: none;
  cursor: pointer;
  font-size: 1em;
}

.sn-browser-panes {
  display: flex;
  gap: 8px;
  flex: 1;
  min-height: 0;
}
```

- [ ] **Step 3: Add stub methods for tree and doc list**

```typescript
  private renderTree(container: HTMLElement) {
    const treePane = container.createDiv({ cls: "sn-tree-pane" });
    treePane.createEl("p", { text: "Tree loading..." });
  }

  private renderDocList(container: HTMLElement) {
    const listPane = container.createDiv({ cls: "sn-list-pane" });
    listPane.createEl("p", { text: "Select a node in the tree" });
  }
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/sn-browser-view.ts styles.css
git commit -m "feat: add data fetching, filter bar, and two-pane layout to browse tab"
```

---

### Task 6: Browse tab — tree navigation

**Files:**
- Modify: `src/sn-browser-view.ts`

- [ ] **Step 1: Build tree data structure and rendering**

Add tree state property:

```typescript
  private selectedTreeNode: string = ""; // "project:value" or "project:value/category:value"
  private expandedNodes: Set<string> = new Set();
```

Replace the `renderTree` stub:

```typescript
  private renderTree(container: HTMLElement) {
    const treePane = container.createDiv({ cls: "sn-tree-pane" });

    const docs = this.getFilteredDocs();

    // Group by project → category
    const tree = new Map<string, Map<string, SNDocument[]>>();
    for (const doc of docs) {
      const proj = doc.project || "(No Project)";
      if (!tree.has(proj)) tree.set(proj, new Map());
      const projMap = tree.get(proj)!;
      const cat = doc.category || "(Uncategorized)";
      if (!projMap.has(cat)) projMap.set(cat, []);
      projMap.get(cat)!.push(doc);
    }

    // "All" node
    const allNode = treePane.createDiv({ cls: `sn-tree-node ${!this.selectedTreeNode ? "is-active" : ""}` });
    allNode.createEl("span", { text: `All (${docs.length})` });
    allNode.addEventListener("click", () => {
      this.selectedTreeNode = "";
      this.render();
    });

    // Project nodes
    for (const [project, categories] of tree) {
      const projKey = `project:${project}`;
      const projCount = Array.from(categories.values()).reduce((sum, d) => sum + d.length, 0);
      const isExpanded = this.expandedNodes.has(projKey);

      const projNode = treePane.createDiv({ cls: "sn-tree-node sn-tree-project" });
      const projHeader = projNode.createDiv({ cls: "sn-tree-header" });
      projHeader.createEl("span", {
        text: isExpanded ? "▼" : "▶",
        cls: "sn-tree-arrow",
      });
      projHeader.createEl("span", {
        text: `${project} (${projCount})`,
        cls: `sn-tree-label ${this.selectedTreeNode === projKey ? "is-active" : ""}`,
      });

      projHeader.addEventListener("click", () => {
        if (isExpanded) {
          this.expandedNodes.delete(projKey);
        } else {
          this.expandedNodes.add(projKey);
        }
        this.selectedTreeNode = projKey;
        this.render();
      });

      if (isExpanded) {
        const catContainer = projNode.createDiv({ cls: "sn-tree-children" });
        for (const [category, catDocs] of categories) {
          const catKey = `${projKey}/category:${category}`;
          const catNode = catContainer.createDiv({
            cls: `sn-tree-node sn-tree-category ${this.selectedTreeNode === catKey ? "is-active" : ""}`,
          });
          catNode.createEl("span", { text: `${category} (${catDocs.length})` });
          catNode.addEventListener("click", (e) => {
            e.stopPropagation();
            this.selectedTreeNode = catKey;
            this.render();
          });
        }
      }
    }
  }
```

- [ ] **Step 2: Add tree styles**

```css
.sn-tree-pane {
  flex: 0 0 200px;
  border-right: 1px solid var(--background-modifier-border);
  padding-right: 8px;
  overflow-y: auto;
}

.sn-tree-node {
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 0.85em;
}

.sn-tree-node:hover {
  background: var(--background-secondary);
}

.sn-tree-node.is-active,
.sn-tree-label.is-active {
  color: var(--text-accent);
  font-weight: 600;
}

.sn-tree-header {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sn-tree-arrow {
  font-size: 0.7em;
  width: 12px;
  text-align: center;
}

.sn-tree-children {
  padding-left: 20px;
}

.sn-tree-category {
  padding-left: 6px;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/sn-browser-view.ts styles.css
git commit -m "feat: add tree navigation with project/category grouping"
```

---

### Task 7: Browse tab — document list with selection and download

**Files:**
- Modify: `src/sn-browser-view.ts`

- [ ] **Step 1: Replace renderDocList stub with full implementation**

```typescript
  private getDocsForSelectedNode(): SNDocument[] {
    const docs = this.getFilteredDocs();
    if (!this.selectedTreeNode) return docs;

    const parts = this.selectedTreeNode.split("/");
    const projectMatch = parts[0]?.replace("project:", "") ?? "";
    const categoryMatch = parts[1]?.replace("category:", "") ?? "";

    return docs.filter((doc) => {
      const proj = doc.project || "(No Project)";
      if (proj !== projectMatch) return false;
      if (categoryMatch) {
        const cat = doc.category || "(Uncategorized)";
        if (cat !== categoryMatch) return false;
      }
      return true;
    });
  }

  private renderDocList(container: HTMLElement) {
    const listPane = container.createDiv({ cls: "sn-list-pane" });

    const docs = this.getDocsForSelectedNode();

    // Action bar
    const actionBar = listPane.createDiv({ cls: "sn-action-bar" });
    const selectedCount = this.selectedDocIds.size;
    actionBar.createEl("span", {
      text: `${docs.length} documents${selectedCount > 0 ? ` · ${selectedCount} selected` : ""}`,
      cls: "sn-action-count",
    });

    if (selectedCount > 0) {
      const downloadBtn = actionBar.createEl("button", {
        text: `Download Selected (${selectedCount})`,
        cls: "sn-action-btn mod-cta",
      });
      downloadBtn.addEventListener("click", () => this.downloadSelected());
    }

    const downloadAllBtn = actionBar.createEl("button", {
      text: "Download All Not Synced",
      cls: "sn-action-btn",
    });
    downloadAllBtn.addEventListener("click", () => this.downloadAllUnsynced(docs));

    // Document rows
    const list = listPane.createDiv({ cls: "sn-doc-list" });
    for (const doc of docs) {
      const status = this.getDocStatus(doc);
      const isSelected = this.selectedDocIds.has(doc.sys_id);

      const row = list.createDiv({ cls: `sn-doc-row ${isSelected ? "is-selected" : ""}` });

      // Checkbox
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = isSelected;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.selectedDocIds.add(doc.sys_id);
        } else {
          this.selectedDocIds.delete(doc.sys_id);
        }
        this.render();
      });

      // Status icon
      const statusIcon = status === "synced" ? "●" : "○";
      const statusColor = status === "synced" ? "var(--color-green)" : "var(--text-faint)";
      row.createEl("span", { text: statusIcon, cls: "sn-doc-status" }).style.color = statusColor;

      // Title
      row.createEl("span", { text: doc.title, cls: "sn-doc-title" });

      // Category badge
      if (doc.category) {
        const label = this.metadata?.categories.find((c) => c.value === doc.category)?.label ?? doc.category;
        row.createEl("span", { text: label, cls: "sn-doc-badge" });
      }

      // Date
      if (doc.sys_updated_on) {
        const date = doc.sys_updated_on.split(" ")[0] ?? "";
        row.createEl("span", { text: date, cls: "sn-doc-meta" });
      }

      // Checked out indicator
      if (doc.checked_out_by) {
        row.createEl("span", { text: "🔒", cls: "sn-doc-lock" });
      }

      // Double-click to open
      row.addEventListener("dblclick", () => {
        const entry = this.plugin.syncState.docMap[doc.sys_id];
        if (entry) {
          const file = this.plugin.app.vault.getAbstractFileByPath(entry.path);
          if (file) {
            this.plugin.app.workspace.getLeaf(false).openFile(file as any);
          }
        }
      });
    }
  }

  private async downloadSelected() {
    const docs = this.serverDocs.filter((d) => this.selectedDocIds.has(d.sys_id));
    await this.downloadDocs(docs);
    this.selectedDocIds.clear();
    this.render();
  }

  private async downloadAllUnsynced(docs: SNDocument[]) {
    const unsynced = docs.filter((d) => this.getDocStatus(d) === "not-downloaded");
    await this.downloadDocs(unsynced);
    this.render();
  }

  private async downloadDocs(docs: SNDocument[]) {
    if (docs.length === 0) {
      new Notice("No documents to download.");
      return;
    }

    new Notice(`Downloading ${docs.length} documents...`);
    let count = 0;

    for (const doc of docs) {
      try {
        await this.plugin.syncEngine.createLocalFile(doc);
        count++;
        if (count % 10 === 0) {
          new Notice(`Downloaded ${count}/${docs.length}...`);
        }
      } catch (e) {
        console.error(`SN Browser: Failed to download ${doc.title}`, e);
      }
    }

    await this.plugin.saveSettings();
    new Notice(`Downloaded ${count} documents.`);
  }
```

- [ ] **Step 2: Add document list styles**

```css
.sn-list-pane {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}

.sn-action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.sn-action-count {
  font-size: 0.85em;
  color: var(--text-muted);
  margin-right: auto;
}

.sn-action-btn {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--background-modifier-border);
  background: none;
  cursor: pointer;
  font-size: 0.8em;
}

.sn-action-btn.mod-cta {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border: none;
}

.sn-doc-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sn-doc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.85em;
  cursor: pointer;
}

.sn-doc-row:hover {
  background: var(--background-secondary);
}

.sn-doc-row.is-selected {
  background: var(--background-secondary-alt);
}

.sn-doc-status {
  font-size: 0.8em;
  flex-shrink: 0;
}

.sn-doc-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sn-doc-badge {
  font-size: 0.75em;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--background-secondary);
  color: var(--text-muted);
  flex-shrink: 0;
}

.sn-doc-meta {
  font-size: 0.75em;
  color: var(--text-faint);
  flex-shrink: 0;
}

.sn-doc-lock {
  font-size: 0.8em;
  flex-shrink: 0;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Manual test**

Reload Obsidian, open SN Browser. Should see:
- Filter bar at top with project/category/status dropdowns + search
- Tree on left with project → category grouping
- Document list on right with checkboxes, status icons, titles, badges
- "Download Selected" and "Download All Not Synced" buttons
- Double-click a synced doc opens it in editor

- [ ] **Step 5: Commit**

```bash
git add src/sn-browser-view.ts styles.css
git commit -m "feat: add document list with selection, status icons, and download actions"
```

---

### Task 8: Sync Settings tab — exclude list management

**Files:**
- Modify: `src/sn-browser-view.ts`

- [ ] **Step 1: Implement the settings tab**

Replace the `renderSettingsTab` stub:

```typescript
  private renderSettingsTab(container: HTMLElement) {
    // Sync overview stats
    const stats = container.createDiv({ cls: "sn-sync-stats" });
    const totalServer = this.serverDocs.length;
    const totalLocal = Object.keys(this.plugin.syncState.docMap).length;
    const excludeCount = this.plugin.settings.excludePaths.length;

    stats.createEl("h3", { text: "Sync Overview" });
    const statGrid = stats.createDiv({ cls: "sn-stat-grid" });
    statGrid.createDiv({ cls: "sn-stat" }).innerHTML = `<span class="sn-stat-value">${totalServer}</span><span class="sn-stat-label">On Server</span>`;
    statGrid.createDiv({ cls: "sn-stat" }).innerHTML = `<span class="sn-stat-value">${totalLocal}</span><span class="sn-stat-label">Downloaded</span>`;
    statGrid.createDiv({ cls: "sn-stat" }).innerHTML = `<span class="sn-stat-value">${excludeCount}</span><span class="sn-stat-label">Excluded Paths</span>`;

    // Exclude list
    const excludeSection = container.createDiv({ cls: "sn-exclude-section" });
    excludeSection.createEl("h3", { text: "Excluded from Sync" });
    excludeSection.createEl("p", {
      text: "Files and folders matching these patterns will not be synced to ServiceNow.",
      cls: "sn-exclude-desc",
    });

    // Add exclusion input
    const addRow = excludeSection.createDiv({ cls: "sn-exclude-add" });
    const addInput = addRow.createEl("input", {
      type: "text",
      placeholder: "Folder path or pattern (e.g., Templates/ or *.canvas)",
      cls: "sn-exclude-input",
    });
    const addBtn = addRow.createEl("button", { text: "Add", cls: "sn-action-btn mod-cta" });
    addBtn.addEventListener("click", async () => {
      const value = addInput.value.trim();
      if (!value) return;
      if (!this.plugin.settings.excludePaths.includes(value)) {
        this.plugin.settings.excludePaths.push(value);
        await this.plugin.saveSettings();
      }
      addInput.value = "";
      this.render();
    });

    // List existing exclusions
    const list = excludeSection.createDiv({ cls: "sn-exclude-list" });
    if (this.plugin.settings.excludePaths.length === 0) {
      list.createEl("p", { text: "No exclusions configured.", cls: "sn-exclude-empty" });
    } else {
      for (const path of this.plugin.settings.excludePaths) {
        const row = list.createDiv({ cls: "sn-exclude-row" });
        row.createEl("span", { text: path, cls: "sn-exclude-path" });
        const removeBtn = row.createEl("button", { text: "✕", cls: "sn-exclude-remove" });
        removeBtn.addEventListener("click", async () => {
          this.plugin.settings.excludePaths = this.plugin.settings.excludePaths.filter((p) => p !== path);
          await this.plugin.saveSettings();
          this.render();
        });
      }
    }
  }
```

- [ ] **Step 2: Add settings tab styles**

```css
.sn-sync-stats {
  margin-bottom: 20px;
}

.sn-stat-grid {
  display: flex;
  gap: 16px;
  margin-top: 8px;
}

.sn-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 20px;
  background: var(--background-secondary);
  border-radius: 8px;
}

.sn-stat-value {
  font-size: 1.5em;
  font-weight: 700;
}

.sn-stat-label {
  font-size: 0.8em;
  color: var(--text-muted);
  margin-top: 2px;
}

.sn-exclude-section {
  margin-top: 16px;
}

.sn-exclude-desc {
  font-size: 0.85em;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.sn-exclude-add {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.sn-exclude-input {
  flex: 1;
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
}

.sn-exclude-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sn-exclude-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--background-secondary);
  border-radius: 4px;
}

.sn-exclude-path {
  font-family: var(--font-monospace);
  font-size: 0.85em;
}

.sn-exclude-remove {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 0.9em;
  padding: 2px 6px;
  border-radius: 4px;
}

.sn-exclude-remove:hover {
  color: var(--text-error);
  background: var(--background-modifier-error);
}

.sn-exclude-empty {
  font-size: 0.85em;
  color: var(--text-faint);
  font-style: italic;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Manual test**

Open SN Browser → Sync Settings tab. Should see:
- Sync overview stats (server count, downloaded count, excluded count)
- Add exclusion input + button
- List of exclusions with remove buttons

- [ ] **Step 5: Commit**

```bash
git add src/sn-browser-view.ts styles.css
git commit -m "feat: add Sync Settings tab with exclude list management and sync stats"
```

---

### Task 9: Context menu — right-click to exclude

**Files:**
- Modify: `src/sn-browser-view.ts`

- [ ] **Step 1: Add right-click handler to tree project nodes**

In the `renderTree` method, after `projHeader.addEventListener("click", ...)`, add:

```typescript
      projHeader.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const menu = new (require("obsidian").Menu)();
        menu.addItem((item: any) => {
          item.setTitle(`Exclude "${project}" from sync`);
          item.onClick(async () => {
            const pattern = `${project}/`;
            if (!this.plugin.settings.excludePaths.includes(pattern)) {
              this.plugin.settings.excludePaths.push(pattern);
              await this.plugin.saveSettings();
              new Notice(`Excluded "${project}" from sync`);
            }
          });
        });
        menu.showAtMouseEvent(e);
      });
```

- [ ] **Step 2: Add Menu import**

At the top of `src/sn-browser-view.ts`, update the import:

```typescript
import { ItemView, WorkspaceLeaf, Notice, Menu } from "obsidian";
```

Then replace `new (require("obsidian").Menu)()` with `new Menu()` and type `item` properly:

```typescript
      projHeader.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const menu = new Menu();
        menu.addItem((item) => {
          item.setTitle(`Exclude "${project}" from sync`);
          item.onClick(async () => {
            const pattern = `${project}/`;
            if (!this.plugin.settings.excludePaths.includes(pattern)) {
              this.plugin.settings.excludePaths.push(pattern);
              await this.plugin.saveSettings();
              new Notice(`Excluded "${project}" from sync`);
            }
          });
        });
        menu.showAtMouseEvent(e);
      });
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/sn-browser-view.ts
git commit -m "feat: add right-click context menu to exclude projects from sync"
```

---

### Task 10: Run tests + deploy + integration test

**Files:**
- No new files

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All 18 tests pass.

- [ ] **Step 2: Build production bundle**

Run: `npm run build`

- [ ] **Step 3: Deploy to vault**

```bash
cp main.js styles.css "/Users/caleb/Obsidian/Ethos Vault/Ethos/.obsidian/plugins/sn-obsidian-sync/"
```

- [ ] **Step 4: Integration test**

Reload Obsidian. Test:
1. Cmd+P → "Open SN Browser" — view opens as a tab
2. Browse tab loads documents from SN, shows tree + doc list
3. Filters work (project, category, status, search)
4. Click tree nodes to navigate
5. Select docs with checkboxes, "Download Selected" creates local files
6. "Download All Not Synced" downloads all non-local docs
7. Double-click a synced doc opens it in editor
8. Sync Settings tab shows stats and exclude list
9. Add an exclusion, verify it persists
10. Right-click a project in tree → "Exclude from sync"

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for SN Browser view"
```

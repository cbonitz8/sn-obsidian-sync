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
  private selectedProject = "";
  private selectedCategory = "";
  private selectedStatus = "";
  private searchQuery = "";
  private selectedDocIds: Set<string> = new Set();
  private selectedTreeNode: string = "";
  private expandedNodes: Set<string> = new Set();

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

    const statusSelect = filterBar.createEl("select", { cls: "sn-filter-select" });
    statusSelect.createEl("option", { text: "All Status", value: "" });
    statusSelect.createEl("option", { text: "Synced", value: "synced" });
    statusSelect.createEl("option", { text: "Not Downloaded", value: "not-downloaded" });
    statusSelect.value = this.selectedStatus;
    statusSelect.addEventListener("change", () => {
      this.selectedStatus = statusSelect.value;
      this.render();
    });

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

  private renderSettingsTab(container: HTMLElement) {
    container.createEl("p", { text: "Sync settings will appear here." });
  }

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

  private renderDocList(container: HTMLElement) {
    const listPane = container.createDiv({ cls: "sn-list-pane" });
    listPane.createEl("p", { text: "Select a node in the tree" });
  }
}

import type { AuthManager } from "./auth-manager";
import type { SNDocument, SNMetadata } from "./types";

interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

export class ApiClient {
  private authManager: AuthManager;
  private instanceUrl: string;
  private apiPath: string;
  private metadataPath: string;

  constructor(authManager: AuthManager, instanceUrl: string, apiPath: string, metadataPath: string) {
    this.authManager = authManager;
    this.instanceUrl = instanceUrl;
    this.apiPath = apiPath;
    this.metadataPath = metadataPath;
  }

  updateConfig(instanceUrl: string, apiPath: string, metadataPath: string) {
    this.instanceUrl = instanceUrl;
    this.apiPath = apiPath;
    this.metadataPath = metadataPath;
  }

  private url(path: string): string {
    return `${this.instanceUrl}${this.apiPath}${path}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.authManager.authenticatedFetch(this.url(path), {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response) {
        return { ok: false, status: 0, data: null };
      }

      const json = response.json as Record<string, unknown>;
      console.log(`SN Sync API [${method} ${path}]:`, JSON.stringify(json).slice(0, 500));
      // SN scripted REST wraps in { result: ... }. If the script also uses
      // response.setBody({ result: ... }), we get double-nesting: { result: { result: ... } }
      let data = json.result as T;
      if (data && typeof data === "object" && "result" in (data as Record<string, unknown>)) {
        data = (data as Record<string, unknown>).result as T;
      }
      return { ok: response.status >= 200 && response.status < 300, status: response.status, data };
    } catch (e: unknown) {
      const err = e as { status?: number };
      return { ok: false, status: err.status ?? 0, data: null };
    }
  }

  /** Get all documents */
  async getDocuments(): Promise<ApiResponse<SNDocument[]>> {
    return this.request<SNDocument[]>("GET", "/documents");
  }

  /** Get a single document by ID */
  async getDocument(id: string): Promise<ApiResponse<SNDocument>> {
    return this.request<SNDocument>("GET", `/documents/${id}`);
  }

  /** Get documents changed since a timestamp */
  async getChanges(since: string): Promise<ApiResponse<SNDocument[]>> {
    return this.request<SNDocument[]>("GET", `/documents/changes?since=${encodeURIComponent(since)}`);
  }

  /** Create a new document */
  async createDocument(doc: {
    title: string;
    content: string;
    category: string;
    project: string;
    tags: string;
  }): Promise<ApiResponse<SNDocument>> {
    return this.request<SNDocument>("POST", "/documents", doc);
  }

  /** Update an existing document */
  async updateDocument(
    id: string,
    doc: { title?: string; content?: string; category?: string; project?: string; tags?: string }
  ): Promise<ApiResponse<SNDocument>> {
    return this.request<SNDocument>("PUT", `/documents/${id}`, doc);
  }

  /** Delete a document */
  async deleteDocument(id: string): Promise<ApiResponse<void>> {
    return this.request<void>("DELETE", `/documents/${id}`);
  }

  /** Check out (lock) a document */
  async checkout(id: string): Promise<ApiResponse<SNDocument>> {
    return this.request<SNDocument>("POST", `/documents/${id}/checkout`);
  }

  /** Check in (unlock) a document */
  async checkin(id: string): Promise<ApiResponse<SNDocument>> {
    return this.request<SNDocument>("POST", `/documents/${id}/checkin`);
  }

  /** Force check in a document (admin override) */
  async forceCheckin(id: string): Promise<ApiResponse<SNDocument>> {
    return this.request<SNDocument>("POST", `/documents/${id}/force-checkin`);
  }

  /** Get available categories, projects, and tags from SN */
  async getMetadata(): Promise<ApiResponse<SNMetadata>> {
    return this.request<SNMetadata>("GET", this.metadataPath);
  }
}

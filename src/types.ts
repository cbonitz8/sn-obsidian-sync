/** Document record as returned by the SN REST API */
export interface SNDocument {
  sys_id: string;
  title: string;
  content: string;
  category: string;
  project: string;
  tags: string;
  sys_updated_on: string;
  checked_out_by: string;
}

/** Metadata from SN — available categories, projects, tags */
export interface SNMetadata {
  categories: { value: string; label: string }[];
  projects: { value: string; label: string }[];
  tags: string[];
}

/** Maps a sys_id to its local vault file path */
export interface DocMapEntry {
  sysId: string;
  path: string;
  lastServerTimestamp: string;
}

/** Plugin-level sync tracking, persisted in data.json alongside settings */
export interface SyncState {
  lastSyncTimestamp: string;
  ignoredIds: string[];
  docMap: Record<string, DocMapEntry>;
}

/** Frontmatter fields managed by the plugin */
export interface SNFrontmatter {
  sys_id?: string;
  category?: string;
  project?: string;
  tags?: string;
  synced?: boolean;
}

/** Category folder mapping — simple string or structured with subfolders */
export type CategoryMapping = string | {
  root: string;
  subfolders: string[];
};

/** Custom tag-to-folder mapping */
export interface CustomFolderMapping {
  path: string;
  tag: string;
}

/** Full folder mapping configuration */
export interface FolderMapping {
  projects: boolean;
  categories: Record<string, CategoryMapping>;
  custom: CustomFolderMapping[];
}

/** Sync mode */
export type SyncMode = "interval" | "manual";

/** What to do when a local file is deleted */
export type LocalDeleteBehavior = "ignore" | "re-pull" | "archive";

/** What to do when a remote doc is deleted */
export type RemoteDeleteBehavior = "delete local" | "keep local";

/** Plugin settings */
export interface SNSyncSettings {
  instanceUrl: string;
  apiPath: string;
  metadataPath: string;
  oauthRedirectUri: string;
  oauthClientId: string;
  oauthClientSecret: string;
  syncMode: SyncMode;
  syncIntervalSeconds: number;
  frontmatterPrefix: string;
  checkoutOnEdit: boolean;
  localDeleteBehavior: LocalDeleteBehavior;
  remoteDeleteBehavior: RemoteDeleteBehavior;
  folderMapping: FolderMapping;
  excludePaths: string[];
}

/** Persisted plugin data (settings + sync state + auth tokens) */
export interface PluginData {
  settings: SNSyncSettings;
  syncState: SyncState;
  auth: AuthTokens;
}

/** OAuth tokens */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** Result of a sync cycle for reporting */
export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: number;
  errors: string[];
}

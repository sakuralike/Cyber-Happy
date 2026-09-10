import { http } from "./client";

export type ConfigScope =
  | "SITE"
  | "DOWNLOAD"
  | "BANNER"
  | "LANDING"
  | "USER_PAGE";
export type ModuleType =
  | "HERO"
  | "FEATURE_GRID"
  | "SCENE_STATS"
  | "TESTIMONIAL"
  | "FAQ"
  | "CTA"
  | "FOOTER"
  | "CUSTOM";
export type RevisionStatus = "DRAFT" | "PENDING" | "PUBLISHED" | "ROLLED_BACK";

export interface SettingItem {
  key: string;
  value: unknown;
  draftValue: unknown | null;
  changed: boolean;
  updatedAt: string;
}

export interface SettingsPayload {
  scope: "SITE" | "USER_PAGE";
  values: Record<string, unknown>;
  drafts: Record<string, unknown>;
  draftCount: number;
  items: SettingItem[];
}

export interface DownloadLink {
  id: string;
  platform: "ANDROID" | "IOS" | "HARMONY";
  channel: string;
  versionName: string | null;
  minVersion: number | null;
  mode: "UPLOAD" | "URL";
  url: string | null;
  fileId: string | null;
  enabled: boolean;
  sortOrder: number;
  remark: string | null;
  downloadUrl: string | null;
  file?: { originalName: string; size: number; url: string };
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageFileId: string | null;
  imageUrl: string | null;
  resolvedImageUrl: string | null;
  linkType: "INTERNAL" | "EXTERNAL" | "NONE";
  linkUrl: string | null;
  platform: "ALL" | "ANDROID" | "IOS" | "HARMONY";
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  sortOrder: number;
  status: "active" | "scheduled" | "expired" | "disabled";
}

export interface LandingModule {
  id: string;
  type: ModuleType;
  enabled: boolean;
  sortOrder: number;
  content: Record<string, any>;
  hasDraft: boolean;
  updatedAt?: string;
}

export interface ConfigChange {
  scope: ConfigScope;
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface ConfigRevision {
  id: string;
  version: number;
  scopes: ConfigScope[];
  status: RevisionStatus;
  effectiveAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  note: string | null;
  changes: ConfigChange[];
  snapshot: Record<ConfigScope, unknown>;
  publishedBy?: { id: string; displayName: string } | null;
  rolledBackBy?: { id: string; displayName: string } | null;
}

export interface CurrentConfigVersion {
  version: number;
  publishedAt: string | null;
  scopes: ConfigScope[];
  draftCount: number;
  draftScopes: ConfigScope[];
}

export interface PublicConfigAll {
  version: number;
  publishedAt?: string | null;
  scopes: {
    SITE: Record<string, unknown>;
    USER_PAGE: Record<string, unknown>;
    DOWNLOAD: DownloadLink[];
    BANNER: Banner[];
    LANDING: LandingModule[];
  };
}

export const getSettings = (scope: "SITE" | "USER_PAGE") =>
  http.get(`/admin/settings/${scope}`) as Promise<SettingsPayload>;
export const saveSettings = (
  scope: "SITE" | "USER_PAGE",
  values: Record<string, unknown>,
) =>
  http.put(`/admin/settings/${scope}/items`, {
    items: Object.entries(values).map(([key, value]) => ({ key, value })),
  }) as Promise<SettingsPayload>;
export const discardSettings = (scope: "SITE" | "USER_PAGE") =>
  http.post(`/admin/settings/${scope}/discard`, {}) as Promise<SettingsPayload>;

export const getCurrentVersion = () =>
  http.get("/admin/settings/current-version") as Promise<CurrentConfigVersion>;
export const getDraftChanges = () =>
  http.get("/admin/settings/changes") as Promise<ConfigChange[]>;
export const listRevisions = () =>
  http.get("/admin/settings/revisions") as Promise<ConfigRevision[]>;
export const getRevision = (id: string) =>
  http.get(`/admin/settings/revisions/${id}`) as Promise<ConfigRevision>;
export const publishSettings = (input: {
  scopes: ConfigScope[];
  note?: string;
  effectiveAt?: string | null;
}) => http.post("/admin/settings/publish", input) as Promise<ConfigRevision>;
export const rollbackRevision = (id: string) =>
  http.post(
    `/admin/settings/revisions/${id}/rollback`,
    {},
  ) as Promise<ConfigRevision>;

export const listDownloadLinks = (params?: Record<string, unknown>) =>
  http.get("/admin/download-links", { params }) as Promise<DownloadLink[]>;
export const createDownloadLink = (
  input: Omit<DownloadLink, "id" | "downloadUrl" | "file">,
) => http.post("/admin/download-links", input) as Promise<DownloadLink>;
export const updateDownloadLink = (id: string, input: Partial<DownloadLink>) =>
  http.patch(`/admin/download-links/${id}`, input) as Promise<DownloadLink>;
export const deleteDownloadLink = (id: string) =>
  http.delete(`/admin/download-links/${id}`) as Promise<{ deleted: boolean }>;
export const reorderDownloadLinks = (orderedIds: string[]) =>
  http.post("/admin/download-links/reorder", { orderedIds }) as Promise<
    DownloadLink[]
  >;
export const createDownloadQr = (id: string) =>
  http.post(`/admin/download-links/${id}/qr`, {}) as Promise<{
    target: string;
  }>;

export const listBanners = (params?: Record<string, unknown>) =>
  http.get("/admin/banners", { params }) as Promise<Banner[]>;
export const createBanner = (
  input: Omit<Banner, "id" | "resolvedImageUrl" | "status">,
) => http.post("/admin/banners", input) as Promise<Banner>;
export const updateBanner = (id: string, input: Partial<Banner>) =>
  http.patch(`/admin/banners/${id}`, input) as Promise<Banner>;
export const deleteBanner = (id: string) =>
  http.delete(`/admin/banners/${id}`) as Promise<{ deleted: boolean }>;
export const reorderBanners = (orderedIds: string[]) =>
  http.post("/admin/banners/reorder", { orderedIds }) as Promise<Banner[]>;

export const listLandingModules = () =>
  http.get("/admin/landing-modules") as Promise<LandingModule[]>;
export const createLandingModule = (
  input: Omit<LandingModule, "id" | "hasDraft" | "updatedAt">,
) => http.post("/admin/landing-modules", input) as Promise<LandingModule>;
export const updateLandingModule = (
  id: string,
  input: Partial<LandingModule>,
) =>
  http.patch(`/admin/landing-modules/${id}`, input) as Promise<LandingModule>;
export const deleteLandingModule = (id: string) =>
  http.delete(`/admin/landing-modules/${id}`) as Promise<{ deleted: boolean }>;
export const reorderLandingModules = (orderedIds: string[]) =>
  http.post("/admin/landing-modules/reorder", { orderedIds }) as Promise<
    LandingModule[]
  >;

export const getPublicConfigAll = () =>
  http.get("/public/config/all") as Promise<PublicConfigAll>;

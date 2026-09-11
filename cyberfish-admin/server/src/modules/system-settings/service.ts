import crypto from "node:crypto";
import fs from "node:fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { resolveStoredFile } from "../../lib/storage";
import { parseJson } from "../../lib/serialize";
import {
  ConfigScope,
  DownloadMode,
  LinkType,
  ModuleType,
  RevisionStatus,
  type ConfigScope as ConfigScopeValue,
} from "../../lib/enums";
import { publishConfigEvent } from "../../lib/config-stream";
import {
  bannerSchema,
  downloadLinkSchema,
  landingContentSchemas,
  siteSettingSchemas,
  userPageSettingSchemas,
  type BannerInput,
  type BulkSettingsInput,
  type DownloadLinkInput,
  type LandingModuleInput,
  type PublishInput,
} from "./schema";

type Snapshot = Record<ConfigScopeValue, unknown>;
type ConfigChange = {
  scope: ConfigScopeValue;
  key: string;
  oldValue: unknown;
  newValue: unknown;
};

export const SITE_DEFAULTS: Record<string, unknown> = {
  "site.name": "赛博鱼乐",
  "site.logoFileId": null,
  "site.faviconFileId": null,
  "site.icpNo": "沪ICP备2026000000号",
  "site.copyright": "2026 赛博鱼乐 · 保留所有权利",
  "seo.title": "赛博鱼乐 · 智能鱼漂识别与抬竿提醒",
  "seo.keywords": ["鱼漂识别", "抬竿提醒", "钓鱼 APP"],
  "seo.description":
    "赛博鱼乐用端侧 AI 识别漂相，支持野钓、夜钓与塘口场景，离线可用，画面默认不上传。",
  "seo.ogImageFileId": null,
  "seo.ogTitle": "看得懂鱼漂，才懂什么时候提竿",
  "seo.ogDescription": "AI 识别漂相 · 抬竿提醒 · 离线可用",
  "feature.showIcp": true,
  "feature.maintenance": false,
  "feature.maintenanceMessage": "系统维护中，请稍后再试。",
};

export const USER_PAGE_DEFAULTS: Record<string, unknown> = {
  "user.welcome.template": "{nickname}，本周已识别 {weekCount} 次",
  "user.avatar.defaultFileId": null,
  "user.emptyState.text": "还没有记录，去提交一次误报反馈吧",
  "user.nav.dashboard": true,
  "user.nav.profile": true,
  "user.nav.misreports": true,
  "user.nav.notifications": true,
  "user.nav.security": true,
  "user.nav.devices": false,
  "user.dashboard.showTotal": true,
  "user.dashboard.showActivity": true,
  "user.dashboard.showRecent": true,
  "auth.brandTitle": "鱼漂识别的运营与技术中枢",
  "auth.brandSubtitle":
    "一个后台，管住 APP 发版、YOLO 模型下发、误报闭环与数据观测。",
  "auth.methods.phone": true,
  "auth.methods.wechat": true,
  "auth.methods.email": false,
  "auth.privacyRequired": true,
  "auth.bgImageFileId": null,
  "auth.footer": "2026 赛博鱼乐 · 仅限授权账号访问",
  "support.feedback.title": "意见反馈",
  "support.feedback.placeholder": "请描述遇到的问题或建议",
  "support.feedback.contactHint": "可留下邮箱或手机号，方便我们联系你",
  "support.help.title": "使用帮助",
  "support.help.content": "误报请在记录详情中直接标记，系统会附带必要的识别信息供复核。钓场收藏可在“我的”页统一查看和导航。",
  "about.title": "关于赛博鱼乐",
  "about.content": "赛博鱼乐提供端侧 AI 鱼漂识别与上鱼提醒服务，识别默认在设备本地完成。",
  "about.privacy": "只有你确认提交的误报结构化数据，以及主动选择上传的媒体，才会进入同步流程。记录导出文件保存在应用私有目录，由你选择分享目标。",
};

const DEFAULT_LANDING_MODULES: Array<{
  id: string;
  type: string;
  sortOrder: number;
  content: Record<string, unknown>;
}> = [
  {
    id: "default-hero",
    type: ModuleType.HERO,
    sortOrder: 10,
    content: {
      eyebrow: "端侧 AI · 漂相识别",
      h1: "看得懂鱼漂，才懂什么时候提竿",
      sub: "顶漂、顿口、走漂一屏掌握，抬竿时机自动提醒。",
      primaryCta: { label: "免费下载", href: "#download" },
      secondaryCta: { label: "查看功能演示", href: "#features" },
      trustLine: "已有 12,846 位钓友在用，累计识别 126 万次",
    },
  },
  {
    id: "default-features",
    type: ModuleType.FEATURE_GRID,
    sortOrder: 20,
    content: {
      sectionTitle: "核心功能模块",
      sectionSub:
        "从识别到复盘，一条链路覆盖出钓全流程；所有识别在手机本地完成，不上传画面。",
      items: [
        {
          icon: "float",
          title: "漂相实时识别",
          desc: "端侧 YOLO 模型逐帧分析，识别顶漂、斜口和走漂。",
        },
        {
          icon: "alert",
          title: "抬竿时机提醒",
          desc: "结合下沉幅度与抖动频率判断，震动和语音双通道提醒。",
        },
        {
          icon: "history",
          title: "出钓记录复盘",
          desc: "自动记录每次咬钩的时间、漂相与结果。",
        },
        {
          icon: "feedback",
          title: "误报一键反馈",
          desc: "识别不准随手标记误报，进入复核和训练闭环。",
        },
        {
          icon: "offline",
          title: "离线可用",
          desc: "模型本地运行，无信号也能识别。",
        },
        {
          icon: "scene",
          title: "多场景模式",
          desc: "野钓、夜钓和塘口等场景预设一键切换。",
        },
      ],
    },
  },
  {
    id: "default-scenes",
    type: ModuleType.SCENE_STATS,
    sortOrder: 30,
    content: {
      sectionTitle: "一套系统，四种钓场",
      sectionSub:
        "不同水域、光线与漂型差异巨大，赛博鱼乐为每一类场景预设识别参数。",
      stats: [
        { value: "98.6%", label: "漂相识别准确率" },
        { value: "18ms", label: "端侧推理延迟" },
        { value: "126万+", label: "累计识别次数" },
        { value: "每周", label: "模型迭代频率" },
      ],
      scenes: [
        {
          icon: "lake",
          title: "野钓 · 湖库",
          desc: "远距离有漂精准提醒，支持大段水面和复杂光线。",
        },
        {
          icon: "night",
          title: "夜钓 · 光线弱",
          desc: "弱光中依旧保留漂相轨迹，配合电子漂实时提醒。",
        },
        {
          icon: "pond",
          title: "塘口 · 高频口",
          desc: "高频顿口不漏判，适配黑坑与塘口快速换位。",
        },
      ],
    },
  },
  {
    id: "default-testimonials",
    type: ModuleType.TESTIMONIAL,
    sortOrder: 40,
    content: {
      sectionTitle: "钓友们怎么说",
      sectionSub: "来自应用内与社群的真实评价",
      items: [
        {
          quote: "以前靠感觉，现在看提示。上周野钓一天，中鱼率明显比以前高。",
          name: "老李",
          meta: "野钓爱好者 · 使用 4 个月",
        },
        {
          quote: "夜钓也能看得清，震动提醒很稳，不会漏口。",
          name: "夜钓老王",
          meta: "夜钓玩家 · 使用 1 年",
        },
        {
          quote: "误报能反馈，模型更新后确实准了。",
          name: "塘口小陈",
          meta: "黑坑钓友 · 使用 8 个月",
        },
      ],
    },
  },
  {
    id: "default-faq",
    type: ModuleType.FAQ,
    sortOrder: 50,
    content: {
      sectionTitle: "常见问题",
      sectionSub: "关于识别、隐私与设备的高频疑问",
      items: [
        {
          question: "识别需要联网吗？",
          answer:
            "不需要。模型在手机本地运行，仅在下载新模型与同步记录时需要网络。",
        },
        {
          question: "我的画面会被上传吗？",
          answer: "不会。所有识别在本地完成，画面默认不会离开设备。",
        },
        {
          question: "手机发热或耗电严重怎么办？",
          answer: "可在设置中选择省电模式，降低采样频率并暂停后台同步。",
        },
        {
          question: "支持哪些手机？",
          answer: "Android 9 及以上、4GB 以上内存的机型均可运行。",
        },
        {
          question: "识别不准可以反馈吗？",
          answer: "可以。在记录详情中标记误报，结构化数据会进入复核队列。",
        },
      ],
    },
  },
  {
    id: "default-cta",
    type: ModuleType.CTA,
    sortOrder: 60,
    content: {
      title: "下一次出钓，让鱼漂自己说话",
      sub: "下载赛博鱼乐，开启端侧智能识别",
      primary: { label: "Android 版下载", href: "#download" },
      secondary: { label: "iOS · 敬请期待", href: "#" },
    },
  },
  {
    id: "default-footer",
    type: ModuleType.FOOTER,
    sortOrder: 70,
    content: {
      brandText: "端侧 AI 漂相识别，让每一次咬钩都被读懂。",
      copyright: "2026 赛博鱼乐 · 请理性钓鱼，遵守当地垂钓规定",
      icp: "沪ICP备2026000000号",
    },
  },
];

function json(value: unknown): string {
  return JSON.stringify(value);
}

function defaultsFor(scope: ConfigScopeValue): Record<string, unknown> {
  if (scope === ConfigScope.SITE) return SITE_DEFAULTS;
  if (scope === ConfigScope.USER_PAGE) return USER_PAGE_DEFAULTS;
  return {};
}

function assetUrl(fileId: string | null | undefined): string | null {
  return fileId ? `/api/v1/public/assets/${fileId}` : null;
}

let defaultsReady: Promise<void> | null = null;

export function ensureDefaults(): Promise<void> {
  if (!defaultsReady)
    defaultsReady = ensureDefaultsInner().catch((error) => {
      defaultsReady = null;
      throw error;
    });
  return defaultsReady;
}

async function ensureDefaultsInner(): Promise<void> {
  const legacy = await prisma.siteConfig.findUnique({
    where: { id: "default" },
  });
  const siteDefaults = {
    ...SITE_DEFAULTS,
    ...(legacy?.title
      ? {
          "site.name":
            legacy.title === "赛博鱼乐"
              ? legacy.title
              : SITE_DEFAULTS["site.name"],
        }
      : {}),
    ...(legacy?.content ? { "seo.description": legacy.content } : {}),
  };
  await prisma.$transaction([
    ...Object.entries(siteDefaults).map(([key, value]) =>
      prisma.siteSetting.upsert({
        where: { scope_key: { scope: ConfigScope.SITE, key } },
        create: {
          id: `${ConfigScope.SITE}:${key}`,
          scope: ConfigScope.SITE,
          key,
          value: json(value),
        },
        update: {},
      }),
    ),
    ...Object.entries(USER_PAGE_DEFAULTS).map(([key, value]) =>
      prisma.siteSetting.upsert({
        where: { scope_key: { scope: ConfigScope.USER_PAGE, key } },
        create: {
          id: `${ConfigScope.USER_PAGE}:${key}`,
          scope: ConfigScope.USER_PAGE,
          key,
          value: json(value),
        },
        update: {},
      }),
    ),
  ]);

  if ((await prisma.landingModule.count()) === 0) {
    await prisma.landingModule.createMany({
      data: DEFAULT_LANDING_MODULES.map((item) => ({
        id: item.id,
        type: item.type,
        sortOrder: item.sortOrder,
        contentJson: json(item.content),
      })),
    });
  }
  if (
    (await prisma.downloadLink.count()) === 0 &&
    (legacy?.apkFileId || legacy?.apkUrl)
  ) {
    await prisma.downloadLink.create({
      data: {
        platform: "ANDROID",
        channel: "official",
        versionName: null,
        mode: legacy.apkFileId ? DownloadMode.UPLOAD : DownloadMode.URL,
        fileId: legacy.apkFileId,
        url: legacy.apkFileId ? null : legacy.apkUrl,
        enabled: true,
        sortOrder: 0,
        remark: "迁移自首页配置",
      },
    });
  }
  if ((await prisma.configRevision.count()) === 0) {
    const [settings, downloads, banners, modules] = await Promise.all([
      prisma.siteSetting.findMany(),
      prisma.downloadLink.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          file: { select: { originalName: true, size: true, url: true } },
        },
      }),
      prisma.banner.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.landingModule.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    const settingValues = (scope: ConfigScopeValue) =>
      Object.fromEntries(
        settings
          .filter((row) => row.scope === scope)
          .map((row) => [
            row.key,
            parseJson(row.value, defaultsFor(scope)[row.key]),
          ]),
      );
    const snapshot: Snapshot = {
      SITE: settingValues(ConfigScope.SITE),
      USER_PAGE: settingValues(ConfigScope.USER_PAGE),
      DOWNLOAD: downloads.map(
        ({
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          file: _file,
          ...row
        }) => normalizeDownload(row),
      ),
      BANNER: banners.map(
        ({ createdAt: _createdAt, updatedAt: _updatedAt, ...row }) =>
          normalizeBanner(row),
      ),
      LANDING: modules.map((row) => {
        const {
          updatedAt: _updatedAt,
          hasDraft: _hasDraft,
          ...item
        } = normalizeLanding(row, false);
        return item;
      }),
    };
    await prisma.configRevision.create({
      data: {
        version: 1,
        scopes: Object.values(ConfigScope).join(","),
        snapshotJson: json(snapshot),
        changesJson: "[]",
        status: RevisionStatus.PUBLISHED,
        publishedAt: new Date(),
        note: "系统设置初始化",
      },
    });
  }
}

function settingValidators(
  scope: ConfigScopeValue,
): Record<string, { parse: (value: unknown) => unknown }> {
  return scope === ConfigScope.SITE
    ? siteSettingSchemas
    : userPageSettingSchemas;
}

async function validateImageFile(value: unknown): Promise<void> {
  if (value == null || value === "") return;
  const file = await prisma.fileAsset.findUnique({
    where: { id: String(value) },
    select: { bizType: true },
  });
  if (!file) throw AppError.notFound("图片文件不存在");
  if (file.bizType !== "IMAGE")
    throw AppError.badRequest("该字段必须选择图片文件");
}

export async function getSettings(scope: ConfigScopeValue) {
  await ensureDefaults();
  const rows = await prisma.siteSetting.findMany({
    where: { scope },
    orderBy: { key: "asc" },
  });
  const values: Record<string, unknown> = {};
  const drafts: Record<string, unknown> = {};
  for (const row of rows) {
    values[row.key] = parseJson(row.value, defaultsFor(scope)[row.key]);
    if (row.draftValue !== null)
      drafts[row.key] = parseJson(row.draftValue, values[row.key]);
  }
  return {
    scope,
    values,
    drafts,
    draftCount: Object.keys(drafts).length,
    items: rows.map((row) => ({
      key: row.key,
      value: values[row.key],
      draftValue: row.draftValue === null ? null : drafts[row.key],
      changed: row.draftValue !== null,
      updatedAt: row.updatedAt,
    })),
  };
}

export async function saveSettings(
  scope: ConfigScopeValue,
  input: BulkSettingsInput,
  operatorId?: string,
) {
  await ensureDefaults();
  const validators = settingValidators(scope);
  const parsed: Array<{ key: string; value: unknown }> = [];
  for (const item of input.items) {
    if (item.value === undefined) continue;
    const validator = validators[item.key];
    if (!validator) throw AppError.badRequest(`不支持的配置字段：${item.key}`);
    const value = validator.parse(item.value);
    if (item.key.endsWith("FileId")) await validateImageFile(value);
    parsed.push({ key: item.key, value });
  }
  await prisma.$transaction(
    parsed.map((item) =>
      prisma.siteSetting.upsert({
        where: { scope_key: { scope, key: item.key } },
        create: {
          id: `${scope}:${item.key}`,
          scope,
          key: item.key,
          value: json(defaultsFor(scope)[item.key] ?? item.value),
          draftValue: json(item.value),
          updatedById: operatorId ?? null,
        },
        update: {
          draftValue: json(item.value),
          updatedById: operatorId ?? null,
        },
      }),
    ),
  );
  const rows = await prisma.siteSetting.findMany({
    where: { scope, key: { in: parsed.map((item) => item.key) } },
  });
  await prisma.$transaction(
    rows
      .filter((row) => row.draftValue === row.value)
      .map((row) =>
        prisma.siteSetting.update({
          where: { id: row.id },
          data: { draftValue: null },
        }),
      ),
  );
  return getSettings(scope);
}

export async function discardSettings(scope: ConfigScopeValue) {
  await prisma.siteSetting.updateMany({
    where: { scope, draftValue: { not: null } },
    data: { draftValue: null },
  });
  return getSettings(scope);
}

async function validateDownloadFile(input: DownloadLinkInput): Promise<void> {
  if (input.mode !== DownloadMode.UPLOAD || !input.fileId) return;
  const file = await prisma.fileAsset.findUnique({
    where: { id: input.fileId },
    select: { bizType: true },
  });
  if (!file) throw AppError.notFound("下载文件不存在");
  if (file.bizType !== "APK")
    throw AppError.badRequest("Android 上传模式必须选择 APK 文件");
}

function normalizeDownload(row: {
  id: string;
  platform: string;
  channel: string;
  versionName: string | null;
  minVersion: number | null;
  mode: string;
  url: string | null;
  fileId: string | null;
  qrFileId: string | null;
  enabled: boolean;
  sortOrder: number;
  remark: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  file?: { originalName: string; size: bigint; url: string } | null;
}) {
  return {
    ...row,
    file: row.file ? { ...row.file, size: Number(row.file.size) } : undefined,
    downloadUrl:
      row.mode === DownloadMode.UPLOAD && row.fileId
        ? `/api/v1/public/download/apk/${row.id}`
        : row.url,
  };
}

export async function listDownloadLinks(
  query: { platform?: string; channel?: string; enabled?: string } = {},
) {
  await ensureDefaults();
  const rows = await prisma.downloadLink.findMany({
    where: {
      platform: query.platform,
      channel: query.channel,
      enabled:
        query.enabled === undefined ? undefined : query.enabled === "true",
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      file: { select: { originalName: true, size: true, url: true } },
    },
  });
  return rows.map(normalizeDownload);
}

export async function createDownloadLink(input: DownloadLinkInput) {
  await validateDownloadFile(input);
  if (
    await prisma.downloadLink.findUnique({
      where: {
        platform_channel: { platform: input.platform, channel: input.channel },
      },
    })
  )
    throw AppError.conflict("该平台与渠道已存在下载项");
  const row = await prisma.downloadLink.create({
    data: input,
    include: {
      file: { select: { originalName: true, size: true, url: true } },
    },
  });
  return normalizeDownload(row);
}

export async function updateDownloadLink(
  id: string,
  input: Partial<DownloadLinkInput>,
) {
  const found = await prisma.downloadLink.findUnique({ where: { id } });
  if (!found) throw AppError.notFound("下载项不存在");
  const merged = downloadLinkSchema.parse({ ...found, ...input });
  await validateDownloadFile(merged);
  const duplicate = await prisma.downloadLink.findUnique({
    where: {
      platform_channel: { platform: merged.platform, channel: merged.channel },
    },
    select: { id: true },
  });
  if (duplicate && duplicate.id !== id)
    throw AppError.conflict("该平台与渠道已存在下载项");
  const row = await prisma.downloadLink.update({
    where: { id },
    data: merged,
    include: {
      file: { select: { originalName: true, size: true, url: true } },
    },
  });
  return normalizeDownload(row);
}

export async function deleteDownloadLink(id: string) {
  const found = await prisma.downloadLink.findUnique({ where: { id } });
  if (!found) throw AppError.notFound("下载项不存在");
  await prisma.downloadLink.delete({ where: { id } });
  return found;
}

async function reorderRows(
  model: "downloadLink" | "banner" | "landingModule",
  orderedIds: string[],
): Promise<void> {
  const client = prisma[model] as unknown as {
    count(args: unknown): Promise<number>;
    update(args: unknown): Prisma.PrismaPromise<unknown>;
  };
  const count = await client.count({ where: { id: { in: orderedIds } } });
  if (count !== orderedIds.length)
    throw AppError.badRequest("排序列表包含不存在或重复的记录");
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      client.update({
        where: { id },
        data:
          model === "landingModule"
            ? { draftSortOrder: index * 10 }
            : { sortOrder: index * 10 },
      }),
    ),
  );
}

export async function reorderDownloadLinks(orderedIds: string[]) {
  await reorderRows("downloadLink", orderedIds);
  return listDownloadLinks();
}

export async function downloadQr(id: string) {
  const row = await prisma.downloadLink.findUnique({
    where: { id },
    include: {
      file: { select: { originalName: true, size: true, url: true } },
    },
  });
  if (!row) throw AppError.notFound("下载项不存在");
  const normalized = normalizeDownload(row);
  if (!normalized.downloadUrl)
    throw AppError.badRequest("下载项尚未配置可用链接");
  return { target: normalized.downloadUrl };
}

function bannerState(
  row: { enabled: boolean; startAt: Date | null; endAt: Date | null },
  now = new Date(),
): "active" | "scheduled" | "expired" | "disabled" {
  if (!row.enabled) return "disabled";
  if (row.startAt && row.startAt > now) return "scheduled";
  if (row.endAt && row.endAt <= now) return "expired";
  return "active";
}

function normalizeBanner(row: {
  id: string;
  title: string;
  subtitle: string | null;
  imageFileId: string | null;
  imageUrl: string | null;
  linkType: string;
  linkUrl: string | null;
  platform: string;
  enabled: boolean;
  startAt: Date | null;
  endAt: Date | null;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    ...row,
    resolvedImageUrl: row.imageFileId
      ? assetUrl(row.imageFileId)
      : row.imageUrl,
    status: bannerState(row),
  };
}

export async function listBanners(
  query: { status?: string; platform?: string } = {},
) {
  const rows = await prisma.banner.findMany({
    where: { platform: query.platform === "ALL" ? undefined : query.platform },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const normalized = rows.map(normalizeBanner);
  return query.status
    ? normalized.filter((row) => row.status === query.status)
    : normalized;
}

async function validateBannerImage(input: BannerInput): Promise<void> {
  if (input.imageFileId) await validateImageFile(input.imageFileId);
}

function bannerData(input: BannerInput) {
  return {
    ...input,
    startAt: input.startAt ? new Date(input.startAt) : null,
    endAt: input.endAt ? new Date(input.endAt) : null,
  };
}

export async function createBanner(input: BannerInput) {
  await validateBannerImage(input);
  return normalizeBanner(
    await prisma.banner.create({ data: bannerData(input) }),
  );
}

export async function updateBanner(id: string, input: Partial<BannerInput>) {
  const found = await prisma.banner.findUnique({ where: { id } });
  if (!found) throw AppError.notFound("轮播图不存在");
  const merged = bannerSchema.parse({
    ...found,
    ...input,
    startAt:
      input.startAt === undefined
        ? (found.startAt?.toISOString() ?? null)
        : input.startAt,
    endAt:
      input.endAt === undefined
        ? (found.endAt?.toISOString() ?? null)
        : input.endAt,
  });
  await validateBannerImage(merged);
  return normalizeBanner(
    await prisma.banner.update({ where: { id }, data: bannerData(merged) }),
  );
}

export async function deleteBanner(id: string) {
  const found = await prisma.banner.findUnique({ where: { id } });
  if (!found) throw AppError.notFound("轮播图不存在");
  await prisma.banner.delete({ where: { id } });
  return found;
}

export async function reorderBanners(orderedIds: string[]) {
  await reorderRows("banner", orderedIds);
  return listBanners();
}

function validateLandingContent(
  type: string,
  content: Record<string, unknown>,
): Record<string, unknown> {
  if (type === ModuleType.CUSTOM) return content;
  const validator =
    landingContentSchemas[type as keyof typeof landingContentSchemas];
  if (!validator) throw AppError.badRequest(`不支持的落地页模块：${type}`);
  return validator.parse(content) as Record<string, unknown>;
}

function normalizeLanding(
  row: {
    id: string;
    type: string;
    enabled: boolean;
    sortOrder: number;
    contentJson: string;
    draftContentJson: string | null;
    draftSortOrder: number | null;
    createdAt?: Date;
    updatedAt?: Date;
  },
  useDraft = true,
) {
  const content = parseJson<Record<string, unknown>>(
    useDraft && row.draftContentJson ? row.draftContentJson : row.contentJson,
    {},
  );
  return {
    id: row.id,
    type: row.type,
    enabled: row.enabled,
    sortOrder: useDraft ? (row.draftSortOrder ?? row.sortOrder) : row.sortOrder,
    content,
    hasDraft: row.draftContentJson !== null || row.draftSortOrder !== null,
    updatedAt: row.updatedAt,
  };
}

export async function listLandingModules(useDraft = true) {
  await ensureDefaults();
  const rows = await prisma.landingModule.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows
    .map((row) => normalizeLanding(row, useDraft))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createLandingModule(
  input: LandingModuleInput,
  operatorId?: string,
) {
  const content = validateLandingContent(input.type, input.content);
  const row = await prisma.landingModule.create({
    data: {
      type: input.type,
      enabled: input.enabled,
      sortOrder: input.sortOrder,
      contentJson: json(content),
      draftContentJson: json(content),
      updatedById: operatorId ?? null,
    },
  });
  return normalizeLanding(row);
}

export async function updateLandingModule(
  id: string,
  input: Partial<LandingModuleInput>,
  operatorId?: string,
) {
  const found = await prisma.landingModule.findUnique({ where: { id } });
  if (!found) throw AppError.notFound("落地页模块不存在");
  const type = input.type ?? found.type;
  const current = parseJson<Record<string, unknown>>(
    found.draftContentJson ?? found.contentJson,
    {},
  );
  const content = validateLandingContent(type, input.content ?? current);
  const serialized = json(content);
  const row = await prisma.landingModule.update({
    where: { id },
    data: {
      type,
      enabled: input.enabled,
      draftSortOrder:
        input.sortOrder === undefined
          ? undefined
          : input.sortOrder === found.sortOrder
            ? null
            : input.sortOrder,
      draftContentJson: serialized === found.contentJson ? null : serialized,
      updatedById: operatorId ?? null,
    },
  });
  return normalizeLanding(row);
}

export async function deleteLandingModule(id: string) {
  const found = await prisma.landingModule.findUnique({ where: { id } });
  if (!found) throw AppError.notFound("落地页模块不存在");
  await prisma.landingModule.delete({ where: { id } });
  return found;
}

export async function reorderLandingModules(orderedIds: string[]) {
  await reorderRows("landingModule", orderedIds);
  return listLandingModules();
}

async function settingsSnapshot(
  scope: ConfigScopeValue,
  useDraft: boolean,
): Promise<Record<string, unknown>> {
  const settings = await getSettings(scope);
  return Object.fromEntries(
    Object.keys(settings.values).map((key) => [
      key,
      useDraft && key in settings.drafts
        ? settings.drafts[key]
        : settings.values[key],
    ]),
  );
}

async function scopeSnapshot(
  scope: ConfigScopeValue,
  useDraft: boolean,
): Promise<unknown> {
  if (scope === ConfigScope.SITE || scope === ConfigScope.USER_PAGE)
    return settingsSnapshot(scope, useDraft);
  if (scope === ConfigScope.DOWNLOAD)
    return (await listDownloadLinks()).map(
      ({ createdAt: _createdAt, updatedAt: _updatedAt, file: _file, ...row }) =>
        row,
    );
  if (scope === ConfigScope.BANNER)
    return (await listBanners()).map(
      ({
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        status: _status,
        ...row
      }) => row,
    );
  return (await listLandingModules(useDraft)).map(
    ({ updatedAt: _updatedAt, hasDraft: _hasDraft, ...row }) => row,
  );
}

async function latestPublishedRevision() {
  return prisma.configRevision.findFirst({
    where: { status: RevisionStatus.PUBLISHED },
    orderBy: { version: "desc" },
  });
}

async function baselineSnapshot(): Promise<Snapshot> {
  const latest = await latestPublishedRevision();
  const stored = latest
    ? parseJson<Partial<Snapshot>>(latest.snapshotJson, {})
    : {};
  const result = {} as Snapshot;
  for (const scope of Object.values(ConfigScope))
    result[scope] = stored[scope] ?? (await scopeSnapshot(scope, false));
  return result;
}

function flatten(value: unknown, prefix = ""): Map<string, unknown> {
  const result = new Map<string, unknown>();
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const key =
        typeof item === "object" && item !== null && "id" in item
          ? String((item as { id: unknown }).id)
          : String(index);
      for (const [childKey, child] of flatten(
        item,
        prefix ? `${prefix}.${key}` : key,
      ))
        result.set(childKey, child);
    });
  } else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (
        [
          "updatedById",
          "createdAt",
          "updatedAt",
          "hasDraft",
          "contentJson",
          "draftContentJson",
          "draftSortOrder",
        ].includes(key)
      )
        continue;
      for (const [childKey, child] of flatten(
        item,
        prefix ? `${prefix}.${key}` : key,
      ))
        result.set(childKey, child);
    }
  } else result.set(prefix || "value", value);
  return result;
}

function diffScope(
  scope: ConfigScopeValue,
  oldValue: unknown,
  newValue: unknown,
): ConfigChange[] {
  const oldFlat = flatten(oldValue);
  const newFlat = flatten(newValue);
  return [...new Set([...oldFlat.keys(), ...newFlat.keys()])]
    .filter((key) => json(oldFlat.get(key)) !== json(newFlat.get(key)))
    .map((key) => ({
      scope,
      key,
      oldValue: oldFlat.get(key),
      newValue: newFlat.get(key),
    }));
}

export async function draftChanges(
  scopes = Object.values(ConfigScope),
): Promise<ConfigChange[]> {
  const baseline = await baselineSnapshot();
  const changes: ConfigChange[] = [];
  for (const scope of scopes)
    changes.push(
      ...diffScope(scope, baseline[scope], await scopeSnapshot(scope, true)),
    );
  return changes;
}

async function candidateSnapshot(
  scopes: ConfigScopeValue[],
): Promise<Snapshot> {
  const snapshot = await baselineSnapshot();
  for (const scope of scopes)
    snapshot[scope] = await scopeSnapshot(scope, true);
  return snapshot;
}

function mapDownloadForCreate(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    platform: String(row.platform),
    channel: String(row.channel),
    versionName: row.versionName == null ? null : String(row.versionName),
    minVersion: row.minVersion == null ? null : Number(row.minVersion),
    mode: String(row.mode),
    url: row.url == null ? null : String(row.url),
    fileId: row.fileId == null ? null : String(row.fileId),
    qrFileId: row.qrFileId == null ? null : String(row.qrFileId),
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sortOrder),
    remark: row.remark == null ? null : String(row.remark),
  };
}

function mapBannerForCreate(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    title: String(row.title),
    subtitle: row.subtitle == null ? null : String(row.subtitle),
    imageFileId: row.imageFileId == null ? null : String(row.imageFileId),
    imageUrl: row.imageUrl == null ? null : String(row.imageUrl),
    linkType: String(row.linkType),
    linkUrl: row.linkUrl == null ? null : String(row.linkUrl),
    platform: String(row.platform),
    enabled: Boolean(row.enabled),
    startAt: row.startAt ? new Date(String(row.startAt)) : null,
    endAt: row.endAt ? new Date(String(row.endAt)) : null,
    sortOrder: Number(row.sortOrder),
  };
}

function mapLandingForCreate(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    type: String(row.type),
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sortOrder),
    contentJson: json(row.content ?? {}),
  };
}

async function applySnapshot(
  tx: Prisma.TransactionClient,
  snapshot: Snapshot,
  scopes: ConfigScopeValue[],
): Promise<void> {
  for (const scope of scopes) {
    const value = snapshot[scope];
    if (scope === ConfigScope.SITE || scope === ConfigScope.USER_PAGE) {
      for (const [key, item] of Object.entries(
        value as Record<string, unknown>,
      )) {
        await tx.siteSetting.upsert({
          where: { scope_key: { scope, key } },
          create: { id: `${scope}:${key}`, scope, key, value: json(item) },
          update: { value: json(item), draftValue: null },
        });
      }
    } else if (scope === ConfigScope.DOWNLOAD) {
      await tx.downloadLink.deleteMany();
      const rows = (value as Record<string, unknown>[]).map(
        mapDownloadForCreate,
      );
      if (rows.length) await tx.downloadLink.createMany({ data: rows });
    } else if (scope === ConfigScope.BANNER) {
      await tx.banner.deleteMany();
      const rows = (value as Record<string, unknown>[]).map(mapBannerForCreate);
      if (rows.length) await tx.banner.createMany({ data: rows });
    } else {
      await tx.landingModule.deleteMany();
      const rows = (value as Record<string, unknown>[]).map(
        mapLandingForCreate,
      );
      if (rows.length) await tx.landingModule.createMany({ data: rows });
    }
  }

  const site = snapshot[ConfigScope.SITE] as Record<string, unknown>;
  const downloads = snapshot[ConfigScope.DOWNLOAD] as Record<string, unknown>[];
  const android = downloads.find(
    (item) =>
      item.platform === "ANDROID" &&
      item.channel === "official" &&
      item.enabled,
  );
  await tx.siteConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      title: String(site["site.name"] ?? "赛博鱼乐"),
      content: String(site["seo.description"] ?? ""),
      apkUrl: android?.downloadUrl == null ? null : String(android.downloadUrl),
      apkFileId: android?.fileId == null ? null : String(android.fileId),
    },
    update: {
      title: String(site["site.name"] ?? "赛博鱼乐"),
      content: String(site["seo.description"] ?? ""),
      apkUrl: android?.downloadUrl == null ? null : String(android.downloadUrl),
      apkFileId: android?.fileId == null ? null : String(android.fileId),
    },
  });
}

let publishQueue: Promise<void> = Promise.resolve();

export function publish(input: PublishInput, operatorId?: string) {
  const operation = publishQueue.then(() => publishInternal(input, operatorId));
  publishQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

async function publishInternal(input: PublishInput, operatorId?: string) {
  await ensureDefaults();
  const effectiveAt = input.effectiveAt ? new Date(input.effectiveAt) : null;
  if (effectiveAt && effectiveAt <= new Date())
    throw AppError.badRequest("定时发布时间必须晚于当前时间");
  const snapshot = await candidateSnapshot(input.scopes);
  const baseline = await baselineSnapshot();
  const changes = input.scopes.flatMap((scope) =>
    diffScope(scope, baseline[scope], snapshot[scope]),
  );
  const previous = await prisma.configRevision.findFirst({
    orderBy: { version: "desc" },
  });
  if (changes.length === 0 && previous)
    throw AppError.invalidState("没有可发布的草稿变更");
  const version = (previous?.version ?? 0) + 1;
  const status = effectiveAt
    ? RevisionStatus.PENDING
    : RevisionStatus.PUBLISHED;
  const revision = await prisma.$transaction(async (tx) => {
    await tx.configRevision.updateMany({
      where: { status: RevisionStatus.PENDING },
      data: {
        status: RevisionStatus.ROLLED_BACK,
        rolledBackById: operatorId ?? null,
        rolledBackAt: new Date(),
      },
    });
    const created = await tx.configRevision.create({
      data: {
        version,
        scopes: input.scopes.join(","),
        snapshotJson: json(snapshot),
        changesJson: json(changes),
        status,
        effectiveAt,
        publishedById: operatorId ?? null,
        publishedAt: effectiveAt ? null : new Date(),
        note: input.note,
      },
    });
    if (!effectiveAt) await applySnapshot(tx, snapshot, input.scopes);
    return created;
  });
  if (!effectiveAt)
    publishConfigEvent({
      scopes: input.scopes,
      version,
      at: revision.publishedAt!.toISOString(),
    });
  return normalizeRevision(revision);
}

function normalizeRevision<
  T extends {
    snapshotJson: string;
    changesJson: string | null;
    scopes: string;
  },
>(row: T) {
  const { snapshotJson, changesJson, scopes, ...rest } = row;
  return {
    ...rest,
    scopes: scopes.split(",").filter(Boolean),
    snapshot: parseJson(snapshotJson, {}),
    changes: parseJson<ConfigChange[]>(changesJson, []),
  };
}

export async function listRevisions(
  query: { status?: string; from?: string; to?: string } = {},
) {
  const rows = await prisma.configRevision.findMany({
    where: {
      status: query.status,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    },
    orderBy: { version: "desc" },
    include: {
      publishedBy: { select: { id: true, displayName: true } },
      rolledBackBy: { select: { id: true, displayName: true } },
    },
  });
  return rows.map(normalizeRevision);
}

export async function revisionDetail(id: string) {
  const row = await prisma.configRevision.findUnique({
    where: { id },
    include: {
      publishedBy: { select: { id: true, displayName: true } },
      rolledBackBy: { select: { id: true, displayName: true } },
    },
  });
  if (!row) throw AppError.notFound("配置版本不存在");
  return normalizeRevision(row);
}

async function snapshotAtVersion(version: number): Promise<Snapshot> {
  if (version === 0) return baselineSnapshot();
  const row = await prisma.configRevision.findUnique({ where: { version } });
  if (!row) throw AppError.notFound(`配置版本 v${version} 不存在`);
  return parseJson<Snapshot>(row.snapshotJson, {} as Snapshot);
}

export async function revisionDiff(fromVersion: number, toVersion: number) {
  const [from, to] = await Promise.all([
    snapshotAtVersion(fromVersion),
    snapshotAtVersion(toVersion),
  ]);
  return {
    fromVersion,
    toVersion,
    changes: Object.values(ConfigScope).flatMap((scope) =>
      diffScope(scope, from[scope], to[scope]),
    ),
  };
}

export async function currentVersion() {
  const current = await latestPublishedRevision();
  const changes = await draftChanges();
  return current
    ? {
        version: current.version,
        publishedAt: current.publishedAt,
        scopes: current.scopes.split(","),
        draftCount: changes.length,
        draftScopes: [...new Set(changes.map((item) => item.scope))],
      }
    : {
        version: 0,
        publishedAt: null,
        scopes: [],
        draftCount: changes.length,
        draftScopes: [...new Set(changes.map((item) => item.scope))],
      };
}

export async function rollback(id: string, operatorId?: string) {
  const target = await prisma.configRevision.findUnique({ where: { id } });
  if (!target) throw AppError.notFound("配置版本不存在");
  if (target.status === RevisionStatus.PENDING)
    throw AppError.invalidState("待生效版本不能作为回滚目标");
  const snapshot = parseJson<Snapshot>(target.snapshotJson, {} as Snapshot);
  const current = await baselineSnapshot();
  const changes = Object.values(ConfigScope).flatMap((scope) =>
    diffScope(scope, current[scope], snapshot[scope]),
  );
  const last = await prisma.configRevision.findFirst({
    orderBy: { version: "desc" },
  });
  const version = (last?.version ?? 0) + 1;
  const created = await prisma.$transaction(async (tx) => {
    await applySnapshot(tx, snapshot, Object.values(ConfigScope));
    await tx.configRevision.update({
      where: { id: target.id },
      data: {
        status: RevisionStatus.ROLLED_BACK,
        rolledBackById: operatorId ?? null,
        rolledBackAt: new Date(),
      },
    });
    return tx.configRevision.create({
      data: {
        version,
        scopes: Object.values(ConfigScope).join(","),
        snapshotJson: json(snapshot),
        changesJson: json(changes),
        status: RevisionStatus.PUBLISHED,
        publishedById: operatorId ?? null,
        publishedAt: new Date(),
        note: `回滚到 v${target.version}`,
      },
    });
  });
  publishConfigEvent({
    scopes: Object.values(ConfigScope),
    version,
    at: created.publishedAt!.toISOString(),
  });
  return normalizeRevision(created);
}

export async function publishScheduled(): Promise<number> {
  const rows = await prisma.configRevision.findMany({
    where: { status: RevisionStatus.PENDING, effectiveAt: { lte: new Date() } },
    orderBy: { version: "asc" },
  });
  let published = 0;
  for (const row of rows) {
    const scopes = row.scopes
      .split(",")
      .filter((scope): scope is ConfigScopeValue =>
        Object.values(ConfigScope).includes(scope as ConfigScopeValue),
      );
    const snapshot = parseJson<Snapshot>(row.snapshotJson, {} as Snapshot);
    const activated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.configRevision.updateMany({
        where: { id: row.id, status: RevisionStatus.PENDING },
        data: { status: RevisionStatus.PUBLISHED, publishedAt: new Date() },
      });
      if (claimed.count === 0) return false;
      await applySnapshot(tx, snapshot, scopes);
      return true;
    });
    if (activated) {
      published += 1;
      publishConfigEvent({
        scopes,
        version: row.version,
        at: new Date().toISOString(),
      });
    }
  }
  return published;
}

export async function publicConfig(scope: ConfigScopeValue) {
  const revision = await latestPublishedRevision();
  const snapshot = revision
    ? parseJson<Partial<Snapshot>>(revision.snapshotJson, {})
    : {};
  const value = withSettingDefaults(
    scope,
    snapshot[scope] ?? (await scopeSnapshot(scope, false)),
  );
  return scope === ConfigScope.SITE || scope === ConfigScope.USER_PAGE
    ? {
        scope,
        version: revision?.version ?? 0,
        publishedAt: revision?.publishedAt ?? null,
        data: value,
      }
    : {
        scope,
        version: revision?.version ?? 0,
        publishedAt: revision?.publishedAt ?? null,
        items: value,
      };
}

export async function publicConfigAll() {
  const revision = await latestPublishedRevision();
  const snapshot = revision
    ? parseJson<Partial<Snapshot>>(revision.snapshotJson, {})
    : {};
  const scopes = {} as Snapshot;
  for (const scope of Object.values(ConfigScope))
    scopes[scope] = withSettingDefaults(
      scope,
      snapshot[scope] ?? (await scopeSnapshot(scope, false)),
    ) as never;
  return {
    version: revision?.version ?? 0,
    publishedAt: revision?.publishedAt ?? null,
    scopes,
  };
}

function withSettingDefaults(scope: ConfigScopeValue, value: unknown): unknown {
  if (scope !== ConfigScope.SITE && scope !== ConfigScope.USER_PAGE) return value;
  const published = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return { ...defaultsFor(scope), ...published };
}

export function etagFor(
  scope: string,
  value: unknown,
  version: number,
): string {
  const hash = crypto
    .createHash("sha256")
    .update(json({ scope, value, version }))
    .digest("hex")
    .slice(0, 12);
  return `W/"v${version}-${hash}"`;
}

export async function publicDownload(platform: string, channel: string) {
  const data = await publicConfig(ConfigScope.DOWNLOAD);
  const items = ("items" in data ? data.items : []) as Array<
    Record<string, unknown>
  >;
  const enabled = items.filter(
    (item) => item.platform === platform && item.enabled,
  );
  const item =
    enabled.find((candidate) => candidate.channel === channel) ??
    enabled.find((candidate) => candidate.channel === "official");
  return item ?? null;
}

export async function publicBanners(platform: string, now = new Date()) {
  const data = await publicConfig(ConfigScope.BANNER);
  const items = ("items" in data ? data.items : []) as Array<
    Record<string, unknown>
  >;
  return items.filter(
    (item) =>
      item.enabled &&
      (item.platform === "ALL" || item.platform === platform) &&
      (!item.startAt || new Date(String(item.startAt)) <= now) &&
      (!item.endAt || new Date(String(item.endAt)) > now),
  );
}

export async function publicLanding() {
  const data = await publicConfig(ConfigScope.LANDING);
  const items = ("items" in data ? data.items : []) as Array<
    Record<string, unknown>
  >;
  return items
    .filter((item) => item.enabled)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
}

export async function openPublicDownload(id: string) {
  const config = await publicConfig(ConfigScope.DOWNLOAD);
  const published = ("items" in config ? config.items : []) as Array<
    Record<string, unknown>
  >;
  const publishedItem = published.find(
    (item) => item.id === id && item.enabled,
  );
  if (
    !publishedItem ||
    publishedItem.mode !== DownloadMode.UPLOAD ||
    !publishedItem.fileId
  )
    throw AppError.notFound("下载文件不存在");
  const file = await prisma.fileAsset.findUnique({
    where: { id: String(publishedItem.fileId) },
  });
  if (!file || file.bizType !== "APK")
    throw AppError.notFound("下载文件不存在");
  const full = resolveStoredFile(file.url);
  if (!full || !fs.existsSync(full)) throw AppError.notFound("下载文件已丢失");
  return { full, mimeType: file.mimeType, originalName: file.originalName };
}

export async function openPublicAsset(id: string) {
  const file = await prisma.fileAsset.findUnique({ where: { id } });
  if (!file || file.bizType !== "IMAGE") throw AppError.notFound("图片不存在");
  const full = resolveStoredFile(file.url);
  if (!full || !fs.existsSync(full)) throw AppError.notFound("图片文件已丢失");
  return { full, mimeType: file.mimeType, originalName: file.originalName };
}

export async function touchSubscriber(clientId: string, scopes: string) {
  return prisma.configSubscriber.upsert({
    where: { clientId },
    create: { clientId, scopes },
    update: { scopes, lastSeenAt: new Date() },
  });
}

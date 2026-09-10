import { z } from "zod";
import {
  ConfigScope,
  DownloadMode,
  LinkType,
  ModuleType,
  Platform,
  RevisionStatus,
} from "../../lib/enums";

export const configurableScopeSchema = z.enum([
  ConfigScope.SITE,
  ConfigScope.USER_PAGE,
]);
export const configScopeSchema = z.nativeEnum(ConfigScope);

export const siteSettingSchemas = {
  "site.name": z.string().trim().min(1).max(60),
  "site.logoFileId": z.string().trim().min(1).nullable().optional(),
  "site.faviconFileId": z.string().trim().min(1).nullable().optional(),
  "site.icpNo": z.string().trim().max(50),
  "site.copyright": z.string().trim().max(200),
  "seo.title": z.string().trim().min(1).max(60),
  "seo.keywords": z.array(z.string().trim().min(1).max(20)).max(10),
  "seo.description": z.string().trim().min(1).max(160),
  "seo.ogImageFileId": z.string().trim().min(1).nullable().optional(),
  "seo.ogTitle": z.string().trim().max(60),
  "seo.ogDescription": z.string().trim().max(160),
  "feature.showIcp": z.boolean(),
  "feature.maintenance": z.boolean(),
  "feature.maintenanceMessage": z.string().trim().max(200),
} as const;

export const userPageSettingSchemas = {
  "user.welcome.template": z.string().trim().min(1).max(120),
  "user.avatar.defaultFileId": z.string().trim().min(1).nullable().optional(),
  "user.emptyState.text": z.string().trim().min(1).max(80),
  "user.nav.dashboard": z.literal(true),
  "user.nav.profile": z.boolean(),
  "user.nav.misreports": z.boolean(),
  "user.nav.notifications": z.boolean(),
  "user.nav.security": z.boolean(),
  "user.nav.devices": z.boolean(),
  "user.dashboard.showTotal": z.boolean(),
  "user.dashboard.showActivity": z.boolean(),
  "user.dashboard.showRecent": z.boolean(),
  "auth.brandTitle": z.string().trim().min(1).max(40),
  "auth.brandSubtitle": z.string().trim().max(80),
  "auth.methods.phone": z.boolean(),
  "auth.methods.wechat": z.boolean(),
  "auth.methods.email": z.boolean(),
  "auth.privacyRequired": z.boolean(),
  "auth.bgImageFileId": z.string().trim().min(1).nullable().optional(),
  "auth.footer": z.string().trim().max(200),
} as const;

export const bulkSettingsSchema = z
  .object({
    items: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(100),
          value: z.unknown(),
        }),
      )
      .min(1)
      .max(50),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.items.map((item) => item.key)).size !== value.items.length
    )
      ctx.addIssue({
        code: "custom",
        message: "配置字段不能重复",
        path: ["items"],
      });
  });

export const publishSchema = z.object({
  scopes: z
    .array(configScopeSchema)
    .min(1)
    .max(5)
    .transform((items) => [...new Set(items)]),
  note: z.string().trim().max(300).optional(),
  effectiveAt: z.string().datetime({ offset: true }).optional().nullable(),
});

export const scopePublishSchema = publishSchema.omit({ scopes: true });
export const revisionListSchema = z.object({
  status: z.nativeEnum(RevisionStatus).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
export const revisionDiffSchema = z.object({
  fromVersion: z.coerce.number().int().min(0),
  toVersion: z.coerce.number().int().min(0),
});

const externalUrlSchema = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((value) => /^https?:\/\//i.test(value), "仅支持 HTTP 或 HTTPS 链接");

const downloadBaseSchema = z.object({
  platform: z.nativeEnum(Platform),
  channel: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9._-]+$/),
  versionName: z.string().trim().max(30).optional().nullable(),
  minVersion: z.number().int().min(0).optional().nullable(),
  mode: z.nativeEnum(DownloadMode),
  url: externalUrlSchema.optional().nullable(),
  fileId: z.string().trim().min(1).optional().nullable(),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  remark: z.string().trim().max(300).optional().nullable(),
});

export const downloadLinkSchema = downloadBaseSchema.superRefine(
  (value, ctx) => {
    if (value.mode === DownloadMode.URL && !value.url)
      ctx.addIssue({
        code: "custom",
        message: "外部链接模式必须填写下载链接",
        path: ["url"],
      });
    if (value.mode === DownloadMode.UPLOAD && !value.fileId)
      ctx.addIssue({
        code: "custom",
        message: "上传模式必须选择文件",
        path: ["fileId"],
      });
  },
);
export const updateDownloadLinkSchema = downloadBaseSchema.partial();
export const downloadQuerySchema = z.object({
  platform: z.nativeEnum(Platform).optional(),
  channel: z.string().trim().optional(),
  enabled: z.enum(["true", "false"]).optional(),
});

const safeLinkSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) =>
      /^https?:\/\//i.test(value) ||
      /^\/[A-Za-z0-9/_?=&.-]*$/.test(value) ||
      /^#[A-Za-z0-9_-]*$/.test(value),
    "链接仅支持 http(s)、站内绝对路径或页面锚点",
  );

const bannerBaseSchema = z.object({
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(160).optional().nullable(),
  imageFileId: z.string().trim().min(1).optional().nullable(),
  imageUrl: externalUrlSchema.optional().nullable(),
  linkType: z.nativeEnum(LinkType).default(LinkType.INTERNAL),
  linkUrl: safeLinkSchema.optional().nullable(),
  platform: z.union([z.nativeEnum(Platform), z.literal("ALL")]).default("ALL"),
  enabled: z.boolean().default(true),
  startAt: z.string().datetime({ offset: true }).optional().nullable(),
  endAt: z.string().datetime({ offset: true }).optional().nullable(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export const bannerSchema = bannerBaseSchema.superRefine((value, ctx) => {
  if (!value.imageFileId && !value.imageUrl)
    ctx.addIssue({
      code: "custom",
      message: "请上传轮播图或填写图片链接",
      path: ["imageFileId"],
    });
  if (value.linkType !== LinkType.NONE && !value.linkUrl)
    ctx.addIssue({
      code: "custom",
      message: "请填写跳转链接",
      path: ["linkUrl"],
    });
  if (
    value.startAt &&
    value.endAt &&
    new Date(value.startAt) >= new Date(value.endAt)
  )
    ctx.addIssue({
      code: "custom",
      message: "结束时间必须晚于开始时间",
      path: ["endAt"],
    });
});
export const updateBannerSchema = bannerBaseSchema.partial();
export const bannerQuerySchema = z.object({
  status: z.enum(["active", "scheduled", "expired", "disabled"]).optional(),
  platform: z.union([z.nativeEnum(Platform), z.literal("ALL")]).optional(),
});

const actionSchema = z.object({
  label: z.string().trim().min(1).max(20),
  href: safeLinkSchema,
});
const itemSchema = z.object({
  icon: z.string().trim().max(40).default(""),
  title: z.string().trim().min(1).max(40),
  desc: z.string().trim().max(120).default(""),
});
const quoteSchema = z.object({
  quote: z.string().trim().min(1).max(240),
  name: z.string().trim().min(1).max(40),
  meta: z.string().trim().max(80).default(""),
});
const faqSchema = z.object({
  question: z.string().trim().min(1).max(80),
  answer: z.string().trim().min(1).max(500),
});
const ModuleTypeSchema = z.nativeEnum(ModuleType);

export const landingContentSchemas: Record<
  Exclude<z.infer<typeof ModuleTypeSchema>, "CUSTOM">,
  z.ZodTypeAny
> = {
  HERO: z.object({
    eyebrow: z.string().max(40).default(""),
    h1: z.string().min(1).max(60),
    sub: z.string().max(200).default(""),
    primaryCta: actionSchema,
    secondaryCta: actionSchema.optional(),
    bgImageFileId: z.string().nullable().optional(),
    deviceImageFileId: z.string().nullable().optional(),
    trustLine: z.string().max(120).default(""),
  }),
  FEATURE_GRID: z.object({
    sectionTitle: z.string().min(1).max(40),
    sectionSub: z.string().max(120).default(""),
    items: z.array(itemSchema).max(12),
  }),
  SCENE_STATS: z.object({
    sectionTitle: z.string().min(1).max(40),
    sectionSub: z.string().max(120).default(""),
    stats: z
      .array(z.object({ value: z.string().max(20), label: z.string().max(40) }))
      .max(8),
    scenes: z.array(itemSchema).max(8),
  }),
  TESTIMONIAL: z.object({
    sectionTitle: z.string().min(1).max(40),
    sectionSub: z.string().max(120).default(""),
    items: z.array(quoteSchema).max(12),
  }),
  FAQ: z.object({
    sectionTitle: z.string().min(1).max(40),
    sectionSub: z.string().max(120).default(""),
    items: z.array(faqSchema).max(20),
  }),
  CTA: z.object({
    title: z.string().min(1).max(60),
    sub: z.string().max(200).default(""),
    primary: actionSchema,
    secondary: actionSchema.optional(),
  }),
  FOOTER: z.object({
    brandText: z.string().max(120).default(""),
    copyright: z.string().max(200).default(""),
    icp: z.string().max(80).default(""),
  }),
};

export const landingModuleSchema = z.object({
  type: ModuleTypeSchema,
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  content: z.record(z.unknown()),
});
export const updateLandingModuleSchema = landingModuleSchema.partial();

export const reorderSchema = z.object({
  orderedIds: z.array(z.string().trim().min(1)).min(1).max(200),
});
export const publicScopeQuerySchema = z.object({
  scope: configScopeSchema,
  v: z.coerce.number().int().min(0).optional(),
});
export const publicAllQuerySchema = z.object({
  v: z.coerce.number().int().min(0).optional(),
});
export const publicDownloadQuerySchema = z.object({
  platform: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.nativeEnum(Platform)),
  channel: z.string().trim().min(1).max(50).default("official"),
});
export const publicPlatformQuerySchema = z.object({
  platform: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.union([z.nativeEnum(Platform), z.literal("ALL")]))
    .default("ALL"),
  now: z.string().datetime({ offset: true }).optional(),
});
export const streamQuerySchema = z.object({
  clientId: z.string().uuid(),
  scopes: z.string().trim().max(100).default("ALL"),
});

export type BulkSettingsInput = z.infer<typeof bulkSettingsSchema>;
export type PublishInput = z.infer<typeof publishSchema>;
export type DownloadLinkInput = z.infer<typeof downloadLinkSchema>;
export type BannerInput = z.infer<typeof bannerSchema>;
export type LandingModuleInput = z.infer<typeof landingModuleSchema>;

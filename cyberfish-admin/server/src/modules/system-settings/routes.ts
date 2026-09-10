import fs from "node:fs";
import type { FastifyPluginAsync } from "fastify";
import { parseOrThrow, idParamSchema } from "../../lib/zod";
import { sendCreated, sendOk } from "../../lib/response";
import { ConfigScope } from "../../lib/enums";
import {
  configEvents,
  type ConfigPublishedEvent,
} from "../../lib/config-stream";
import {
  bannerQuerySchema,
  bannerSchema,
  bulkSettingsSchema,
  configurableScopeSchema,
  downloadLinkSchema,
  downloadQuerySchema,
  publishSchema,
  reorderSchema,
  revisionDiffSchema,
  revisionListSchema,
  scopePublishSchema,
  updateBannerSchema,
  updateDownloadLinkSchema,
  landingModuleSchema,
  updateLandingModuleSchema,
  publicScopeQuerySchema,
  publicAllQuerySchema,
  publicDownloadQuerySchema,
  publicPlatformQuerySchema,
  streamQuerySchema,
} from "./schema";
import * as service from "./service";

const routes: FastifyPluginAsync = async (app) => {
  await service.ensureDefaults();
  const readGuard = app.requirePermission("siteConfig:read");
  const writeGuard = app.requirePermission("siteConfig:write");
  const publishGuard = app.requirePermission("siteConfig:publish");

  app.get(
    "/admin/settings/current-version",
    { onRequest: [app.authenticate, readGuard] },
    async (_request, reply) => sendOk(reply, await service.currentVersion()),
  );
  app.get(
    "/admin/settings/changes",
    { onRequest: [app.authenticate, readGuard] },
    async (_request, reply) => sendOk(reply, await service.draftChanges()),
  );
  app.get(
    "/admin/settings/revisions/diff",
    { onRequest: [app.authenticate, readGuard] },
    async (request, reply) => {
      const query = parseOrThrow(revisionDiffSchema, request.query);
      return sendOk(
        reply,
        await service.revisionDiff(query.fromVersion, query.toVersion),
      );
    },
  );
  app.get(
    "/admin/settings/revisions",
    { onRequest: [app.authenticate, readGuard] },
    async (request, reply) =>
      sendOk(
        reply,
        await service.listRevisions(
          parseOrThrow(revisionListSchema, request.query),
        ),
      ),
  );
  app.get(
    "/admin/settings/revisions/:id",
    { onRequest: [app.authenticate, readGuard] },
    async (request, reply) =>
      sendOk(
        reply,
        await service.revisionDetail(
          parseOrThrow(idParamSchema, request.params).id,
        ),
      ),
  );
  app.post(
    "/admin/settings/revisions/:id/rollback",
    { onRequest: [app.authenticate, publishGuard] },
    async (request, reply) => {
      const { id } = parseOrThrow(idParamSchema, request.params);
      const result = await service.rollback(id, request.currentUser?.id);
      request.auditExtra = {
        action: "ROLLBACK",
        targetType: "ConfigRevision",
        targetId: result.id,
        targetName: `v${result.version}`,
        after: { rollbackTo: id, version: result.version },
      };
      return sendOk(reply, result);
    },
  );
  app.post(
    "/admin/settings/publish",
    { onRequest: [app.authenticate, publishGuard] },
    async (request, reply) => {
      const input = parseOrThrow(publishSchema, request.body);
      const result = await service.publish(input, request.currentUser?.id);
      request.auditExtra = {
        action: "PUBLISH",
        targetType: "ConfigRevision",
        targetId: result.id,
        targetName: `v${result.version}`,
        after: {
          scopes: result.scopes,
          effectiveAt: result.effectiveAt,
          changes: result.changes.length,
        },
      };
      return sendCreated(reply, result);
    },
  );

  app.get(
    "/admin/settings/:scope",
    { onRequest: [app.authenticate, readGuard] },
    async (request, reply) => {
      const scope = parseOrThrow(
        configurableScopeSchema,
        (request.params as { scope?: unknown }).scope,
      );
      return sendOk(reply, await service.getSettings(scope));
    },
  );
  app.put(
    "/admin/settings/:scope/items",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const scope = parseOrThrow(
        configurableScopeSchema,
        (request.params as { scope?: unknown }).scope,
      );
      const result = await service.saveSettings(
        scope,
        parseOrThrow(bulkSettingsSchema, request.body),
        request.currentUser?.id,
      );
      request.auditExtra = {
        targetType: "SiteSetting",
        targetName: scope,
        after: { draftCount: result.draftCount },
      };
      return sendOk(reply, result);
    },
  );
  app.post(
    "/admin/settings/:scope/discard",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const scope = parseOrThrow(
        configurableScopeSchema,
        (request.params as { scope?: unknown }).scope,
      );
      const result = await service.discardSettings(scope);
      request.auditExtra = {
        targetType: "SiteSetting",
        targetName: scope,
        after: { draftCount: 0 },
      };
      return sendOk(reply, result);
    },
  );
  app.post(
    "/admin/settings/:scope/publish",
    { onRequest: [app.authenticate, publishGuard] },
    async (request, reply) => {
      const scope = parseOrThrow(
        configurableScopeSchema,
        (request.params as { scope?: unknown }).scope,
      );
      const input = parseOrThrow(scopePublishSchema, request.body);
      const result = await service.publish(
        { ...input, scopes: [scope] },
        request.currentUser?.id,
      );
      request.auditExtra = {
        action: "PUBLISH",
        targetType: "ConfigRevision",
        targetId: result.id,
        targetName: `v${result.version}`,
        after: { scopes: result.scopes, effectiveAt: result.effectiveAt },
      };
      return sendCreated(reply, result);
    },
  );

  app.get(
    "/admin/download-links",
    { onRequest: [app.authenticate, readGuard] },
    async (request, reply) =>
      sendOk(
        reply,
        await service.listDownloadLinks(
          parseOrThrow(downloadQuerySchema, request.query),
        ),
      ),
  );
  app.post(
    "/admin/download-links/reorder",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const { orderedIds } = parseOrThrow(reorderSchema, request.body);
      const result = await service.reorderDownloadLinks(orderedIds);
      request.auditExtra = {
        targetType: "DownloadLink",
        targetName: "下载项排序",
        after: { orderedIds },
      };
      return sendOk(reply, result);
    },
  );
  app.post(
    "/admin/download-links",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const result = await service.createDownloadLink(
        parseOrThrow(downloadLinkSchema, request.body),
      );
      request.auditExtra = {
        targetType: "DownloadLink",
        targetId: result.id,
        targetName: `${result.platform}/${result.channel}`,
        after: result,
      };
      return sendCreated(reply, result);
    },
  );
  app.patch(
    "/admin/download-links/:id",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const { id } = parseOrThrow(idParamSchema, request.params);
      const result = await service.updateDownloadLink(
        id,
        parseOrThrow(updateDownloadLinkSchema, request.body),
      );
      request.auditExtra = {
        targetType: "DownloadLink",
        targetId: id,
        targetName: `${result.platform}/${result.channel}`,
        after: result,
      };
      return sendOk(reply, result);
    },
  );
  app.delete(
    "/admin/download-links/:id",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const { id } = parseOrThrow(idParamSchema, request.params);
      const result = await service.deleteDownloadLink(id);
      request.auditExtra = {
        targetType: "DownloadLink",
        targetId: id,
        targetName: `${result.platform}/${result.channel}`,
      };
      return sendOk(reply, { deleted: true });
    },
  );
  app.post(
    "/admin/download-links/:id/qr",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const { id } = parseOrThrow(idParamSchema, request.params);
      return sendOk(reply, await service.downloadQr(id));
    },
  );

  app.get(
    "/admin/banners",
    { onRequest: [app.authenticate, readGuard] },
    async (request, reply) =>
      sendOk(
        reply,
        await service.listBanners(
          parseOrThrow(bannerQuerySchema, request.query),
        ),
      ),
  );
  app.post(
    "/admin/banners/reorder",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const { orderedIds } = parseOrThrow(reorderSchema, request.body);
      const result = await service.reorderBanners(orderedIds);
      request.auditExtra = {
        targetType: "Banner",
        targetName: "轮播图排序",
        after: { orderedIds },
      };
      return sendOk(reply, result);
    },
  );
  app.post(
    "/admin/banners",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const result = await service.createBanner(
        parseOrThrow(bannerSchema, request.body),
      );
      request.auditExtra = {
        targetType: "Banner",
        targetId: result.id,
        targetName: result.title,
        after: result,
      };
      return sendCreated(reply, result);
    },
  );
  app.patch(
    "/admin/banners/:id",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const { id } = parseOrThrow(idParamSchema, request.params);
      const result = await service.updateBanner(
        id,
        parseOrThrow(updateBannerSchema, request.body),
      );
      request.auditExtra = {
        targetType: "Banner",
        targetId: id,
        targetName: result.title,
        after: result,
      };
      return sendOk(reply, result);
    },
  );
  app.delete(
    "/admin/banners/:id",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const { id } = parseOrThrow(idParamSchema, request.params);
      const result = await service.deleteBanner(id);
      request.auditExtra = {
        targetType: "Banner",
        targetId: id,
        targetName: result.title,
      };
      return sendOk(reply, { deleted: true });
    },
  );
  app.post(
    "/admin/banners/publish",
    { onRequest: [app.authenticate, publishGuard] },
    async (request, reply) => {
      const input = parseOrThrow(scopePublishSchema, request.body);
      const result = await service.publish(
        { ...input, scopes: [ConfigScope.BANNER] },
        request.currentUser?.id,
      );
      request.auditExtra = {
        action: "PUBLISH",
        targetType: "ConfigRevision",
        targetId: result.id,
        targetName: `v${result.version}`,
        after: { scopes: result.scopes },
      };
      return sendCreated(reply, result);
    },
  );

  app.get(
    "/admin/landing-modules",
    { onRequest: [app.authenticate, readGuard] },
    async (_request, reply) =>
      sendOk(reply, await service.listLandingModules()),
  );
  app.post(
    "/admin/landing-modules/reorder",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const { orderedIds } = parseOrThrow(reorderSchema, request.body);
      const result = await service.reorderLandingModules(orderedIds);
      request.auditExtra = {
        targetType: "LandingModule",
        targetName: "落地页模块排序",
        after: { orderedIds },
      };
      return sendOk(reply, result);
    },
  );
  app.post(
    "/admin/landing-modules",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const result = await service.createLandingModule(
        parseOrThrow(landingModuleSchema, request.body),
        request.currentUser?.id,
      );
      request.auditExtra = {
        targetType: "LandingModule",
        targetId: result.id,
        targetName: result.type,
        after: result,
      };
      return sendCreated(reply, result);
    },
  );
  app.patch(
    "/admin/landing-modules/:id",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const { id } = parseOrThrow(idParamSchema, request.params);
      const result = await service.updateLandingModule(
        id,
        parseOrThrow(updateLandingModuleSchema, request.body),
        request.currentUser?.id,
      );
      request.auditExtra = {
        targetType: "LandingModule",
        targetId: id,
        targetName: result.type,
        after: result,
      };
      return sendOk(reply, result);
    },
  );
  app.delete(
    "/admin/landing-modules/:id",
    { onRequest: [app.authenticate, writeGuard] },
    async (request, reply) => {
      const { id } = parseOrThrow(idParamSchema, request.params);
      const result = await service.deleteLandingModule(id);
      request.auditExtra = {
        targetType: "LandingModule",
        targetId: id,
        targetName: result.type,
      };
      return sendOk(reply, { deleted: true });
    },
  );
  app.post(
    "/admin/landing-modules/publish",
    { onRequest: [app.authenticate, publishGuard] },
    async (request, reply) => {
      const input = parseOrThrow(scopePublishSchema, request.body);
      const result = await service.publish(
        { ...input, scopes: [ConfigScope.LANDING] },
        request.currentUser?.id,
      );
      request.auditExtra = {
        action: "PUBLISH",
        targetType: "ConfigRevision",
        targetId: result.id,
        targetName: `v${result.version}`,
        after: { scopes: result.scopes },
      };
      return sendCreated(reply, result);
    },
  );

  app.get("/public/config/stream", async (request, reply) => {
    const query = parseOrThrow(streamQuerySchema, request.query);
    await service.touchSubscriber(query.clientId, query.scopes);
    const selected =
      query.scopes === "ALL"
        ? null
        : new Set(query.scopes.split(",").filter(Boolean));
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const current = await service.currentVersion();
    reply.raw.write(
      `event: hello\ndata: ${JSON.stringify({ version: current.version })}\n\n`,
    );
    const onPublished = (payload: ConfigPublishedEvent) => {
      if (!selected || payload.scopes.some((scope) => selected.has(scope)))
        reply.raw.write(
          `event: config.published\ndata: ${JSON.stringify(payload)}\n\n`,
        );
    };
    configEvents.on("published", onPublished);
    const heartbeat = setInterval(
      () => reply.raw.write(":keepalive\n\n"),
      30_000,
    );
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      configEvents.off("published", onPublished);
    });
  });
  app.get("/public/config/all", async (request, reply) => {
    parseOrThrow(publicAllQuerySchema, request.query);
    const result = await service.publicConfigAll();
    const etag = service.etagFor("ALL", result.scopes, result.version);
    reply
      .header("ETag", etag)
      .header("Cache-Control", "public, max-age=30, s-maxage=120");
    if (result.publishedAt)
      reply.header("Last-Modified", result.publishedAt.toUTCString());
    if (request.headers["if-none-match"] === etag)
      return reply.code(304).send();
    return sendOk(reply, result);
  });
  app.get("/public/config", async (request, reply) => {
    const { scope } = parseOrThrow(publicScopeQuerySchema, request.query);
    const result = await service.publicConfig(scope);
    const etag = service.etagFor(scope, result, result.version);
    reply
      .header("ETag", etag)
      .header("Cache-Control", "public, max-age=60, s-maxage=300");
    if (result.publishedAt)
      reply.header("Last-Modified", result.publishedAt.toUTCString());
    if (request.headers["if-none-match"] === etag)
      return reply.code(304).send();
    return sendOk(reply, result);
  });
  app.get("/public/download", async (request, reply) => {
    const query = parseOrThrow(publicDownloadQuerySchema, request.query);
    return sendOk(
      reply,
      await service.publicDownload(query.platform, query.channel),
    );
  });
  app.get("/public/download/apk/:id", async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const file = await service.openPublicDownload(id);
    reply
      .header("Content-Type", file.mimeType || "application/octet-stream")
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      );
    return reply.send(fs.createReadStream(file.full));
  });
  app.get("/public/banners", async (request, reply) => {
    const query = parseOrThrow(publicPlatformQuerySchema, request.query);
    reply.header("Cache-Control", "public, max-age=60, s-maxage=300");
    return sendOk(
      reply,
      await service.publicBanners(
        query.platform,
        query.now ? new Date(query.now) : undefined,
      ),
    );
  });
  app.get("/public/landing", async (_request, reply) => {
    reply.header("Cache-Control", "public, max-age=60, s-maxage=600");
    return sendOk(reply, await service.publicLanding());
  });
  app.get("/public/assets/:id", async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const file = await service.openPublicAsset(id);
    reply
      .header("Content-Type", file.mimeType)
      .header("Cache-Control", "public, max-age=3600, immutable");
    return reply.send(fs.createReadStream(file.full));
  });
};

export default routes;

import { useEffect, useMemo, useState } from "react";
import { Avatar, Button, Carousel, Spin } from "antd";
import {
  ArrowUpOutlined,
  DownloadOutlined,
  MenuOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { getSiteConfig } from "../api/siteConfig";
import {
  getPublicConfigAll,
  type Banner,
  type DownloadLink,
  type LandingModule,
} from "../api/systemSettings";
import { SiteBrandMark } from "../components/SiteBrandMark";
import { useConfigStream } from "../hooks/useConfigStream";

const fallbackModules: LandingModule[] = [
  {
    id: "fallback-hero",
    type: "HERO",
    enabled: true,
    sortOrder: 10,
    hasDraft: false,
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
    id: "fallback-features",
    type: "FEATURE_GRID",
    enabled: true,
    sortOrder: 20,
    hasDraft: false,
    content: {
      sectionTitle: "核心功能模块",
      sectionSub:
        "从识别到复盘，一条链路覆盖出钓全流程；所有识别在手机本地完成，不上传画面。",
      items: [
        ["漂相实时识别", "端侧 YOLO 模型逐帧分析，识别顶漂、斜口和走漂。"],
        ["抬竿时机提醒", "结合下沉幅度与抖动频率判断，震动和语音双通道提醒。"],
        ["出钓记录复盘", "自动记录每次咬钩的时间、漂相与结果。"],
        ["误报一键反馈", "识别不准随手标记误报，进入复核和训练闭环。"],
        ["离线可用", "模型本地运行，无信号也能识别。"],
        ["多场景模式", "野钓、夜钓和塘口等场景预设一键切换。"],
      ].map(([title, desc]) => ({ title, desc, icon: "" })),
    },
  },
  {
    id: "fallback-scenes",
    type: "SCENE_STATS",
    enabled: true,
    sortOrder: 30,
    hasDraft: false,
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
          title: "野钓 · 湖库",
          desc: "远距离有漂精准提醒，支持大段水面和复杂光线。",
        },
        {
          title: "夜钓 · 光线弱",
          desc: "弱光中依旧保留漂相轨迹，配合电子漂实时提醒。",
        },
        {
          title: "塘口 · 高频口",
          desc: "高频顿口不漏判，适配黑坑与塘口快速换位。",
        },
      ],
    },
  },
  {
    id: "fallback-testimonials",
    type: "TESTIMONIAL",
    enabled: true,
    sortOrder: 40,
    hasDraft: false,
    content: {
      sectionTitle: "钓友们怎么说",
      sectionSub: "来自应用内与社群的真实评价",
      items: [
        {
          quote: "以前靠感觉，现在看提示。上周野钓一天，中鱼率明显比以前高。",
          name: "老李",
          meta: "野钓爱好者",
        },
        {
          quote: "夜钓也能看得清，震动提醒很稳，不会漏口。",
          name: "夜钓老王",
          meta: "夜钓玩家",
        },
        {
          quote: "误报能反馈，模型更新后确实准了。",
          name: "塘口小陈",
          meta: "黑坑钓友",
        },
      ],
    },
  },
  {
    id: "fallback-faq",
    type: "FAQ",
    enabled: true,
    sortOrder: 50,
    hasDraft: false,
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
      ],
    },
  },
  {
    id: "fallback-cta",
    type: "CTA",
    enabled: true,
    sortOrder: 60,
    hasDraft: false,
    content: {
      title: "下一次出钓，让鱼漂自己说话",
      sub: "下载赛博鱼乐，开启端侧智能识别",
      primary: { label: "Android 版下载", href: "#download" },
      secondary: { label: "iOS · 敬请期待", href: "#" },
    },
  },
  {
    id: "fallback-footer",
    type: "FOOTER",
    enabled: true,
    sortOrder: 70,
    hasDraft: false,
    content: {
      brandText: "端侧 AI 漂相识别，让每一次咬钩都被读懂。",
      copyright: "2026 赛博鱼乐 · 请理性钓鱼，遵守当地垂钓规定",
      icp: "沪ICP备2026000000号",
    },
  },
];

export function HomePage() {
  const legacyQuery = useQuery({
    queryKey: ["site-config", "public"],
    queryFn: getSiteConfig,
  });
  const configQuery = useQuery({
    queryKey: ["public-config"],
    queryFn: getPublicConfigAll,
    retry: 1,
  });
  const [openFaq, setOpenFaq] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  useConfigStream(["SITE", "DOWNLOAD", "BANNER", "LANDING"]);

  const site = configQuery.data?.scopes.SITE ?? {};
  const modules = useMemo(
    () =>
      (configQuery.data?.scopes.LANDING?.length
        ? configQuery.data.scopes.LANDING
        : fallbackModules
      )
        .filter((item) => item.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [configQuery.data],
  );
  const banners = useMemo(
    () => activeBanners(configQuery.data?.scopes.BANNER ?? []),
    [configQuery.data],
  );
  const download = useMemo(
    () => selectDownload(configQuery.data?.scopes.DOWNLOAD ?? []),
    [configQuery.data],
  );
  const downloadUrl =
    download?.downloadUrl ?? legacyQuery.data?.downloadUrl ?? null;
  const brandName = String(site["site.name"] ?? "赛博鱼乐");
  const logoFileId = site["site.logoFileId"];
  const copyright = String(site["site.copyright"] ?? "");
  const icp = String(site["site.icpNo"] ?? "");
  const showIcp = site["feature.showIcp"] !== false;

  useEffect(() => {
    const title = String(site["seo.title"] ?? brandName);
    const description = String(
      site["seo.description"] ?? "智能鱼漂识别与上鱼提醒。",
    );
    const setMeta = (selector: string, attribute: "name" | "property", key: string, value: string) => {
      let element = document.querySelector<HTMLMetaElement>(selector);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
      }
      element.content = value;
    };
    document.title = title;
    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[name="keywords"]', "name", "keywords", Array.isArray(site["seo.keywords"]) ? site["seo.keywords"].join(",") : "");
    setMeta('meta[property="og:title"]', "property", "og:title", String(site["seo.ogTitle"] ?? title));
    setMeta('meta[property="og:description"]', "property", "og:description", String(site["seo.ogDescription"] ?? description));
    const ogImageId = site["seo.ogImageFileId"];
    if (typeof ogImageId === "string" && ogImageId) setMeta('meta[property="og:image"]', "property", "og:image", `${window.location.origin}/api/v1/public/assets/${ogImageId}`);
    const faviconId = site["site.faviconFileId"];
    if (typeof faviconId === "string" && faviconId) {
      let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!favicon) { favicon = document.createElement("link"); favicon.rel = "icon"; document.head.appendChild(favicon); }
      favicon.href = `/api/v1/public/assets/${faviconId}`;
    }
  }, [brandName, site]);

  const scrollTo = (id: string) =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  const sectionLink =
    (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      scrollTo(id);
    };
  const resolveAction = (href?: string) =>
    href === "#download" && downloadUrl ? downloadUrl : (href ?? "#");

  if (site["feature.maintenance"] === true)
    return (
      <main className="maintenance-page">
        <SiteBrandMark fileId={logoFileId} size={40} />
        <h1>{brandName}</h1>
        <p>
          {String(
            site["feature.maintenanceMessage"] ?? "系统维护中，请稍后再试。",
          )}
        </p>
        <Button href="#/login">后台登录</Button>
      </main>
    );

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a href="#top" className="landing-brand" onClick={sectionLink("top")}>
          <SiteBrandMark fileId={logoFileId} size={22} />
          {brandName}
        </a>
        <nav className="landing-links">
          <a href="#features" onClick={sectionLink("features")}>
            产品能力
          </a>
          <a href="#scenarios" onClick={sectionLink("scenarios")}>
            使用场景
          </a>
          <a href="#faq" onClick={sectionLink("faq")}>
            常见问题
          </a>
          <a href="#/account/login" className="brand-link">
            登录
          </a>
        </nav>
        <div className="landing-actions">
          <Button
            type="primary"
            href={downloadUrl ?? "#download"}
            onClick={
              downloadUrl
                ? undefined
                : (event) => {
                    event.preventDefault();
                    scrollTo("download");
                  }
            }
            icon={<DownloadOutlined />}
          >
            免费下载
          </Button>
          <button
            type="button"
            className="landing-mobile-menu"
            aria-label="打开菜单"
            onClick={() => setMobileOpen((value) => !value)}
          >
            <MenuOutlined />
          </button>
        </div>
        {mobileOpen && (
          <nav className="mobile-nav">
            <a
              href="#features"
              onClick={(event) => {
                sectionLink("features")(event);
                setMobileOpen(false);
              }}
            >
              产品能力
            </a>
            <a
              href="#scenarios"
              onClick={(event) => {
                sectionLink("scenarios")(event);
                setMobileOpen(false);
              }}
            >
              使用场景
            </a>
            <a
              href="#faq"
              onClick={(event) => {
                sectionLink("faq")(event);
                setMobileOpen(false);
              }}
            >
              常见问题
            </a>
            <a href="#/account/login">登录</a>
          </nav>
        )}
      </header>
      {modules.map((module, index) => (
        <div key={module.id}>
          {renderModule(module, {
            brandName,
            logoFileId,
            downloadUrl,
            openFaq,
            setOpenFaq,
            resolveAction,
            scrollTo,
            showIcp,
            copyright,
            icp,
          })}
          {index === 0 && banners.length > 0 && (
            <BannerCarousel banners={banners} scrollTo={scrollTo} />
          )}
        </div>
      ))}
      {(configQuery.isLoading || legacyQuery.isLoading) && (
        <Spin className="landing-loading" />
      )}
    </div>
  );
}

function renderModule(
  module: LandingModule,
  context: {
    brandName: string;
    logoFileId: unknown;
    downloadUrl: string | null;
    openFaq: number;
    setOpenFaq: (value: number) => void;
    resolveAction: (href?: string) => string;
    scrollTo: (id: string) => void;
    showIcp: boolean;
    copyright: string;
    icp: string;
  },
) {
  const c = module.content;
  if (module.type === "HERO")
    return (
      <>
        <section id="top" className="landing-hero">
          <div>
            <span className="eyebrow">{c.eyebrow}</span>
            <h1>{c.h1}</h1>
            <div className="landing-hero-copy">{c.sub}</div>
            <div className="landing-hero-buttons">
              <Button
                type="primary"
                href={context.resolveAction(c.primaryCta?.href)}
                icon={<DownloadOutlined />}
              >
                {c.primaryCta?.label ?? "免费下载"}
              </Button>
              {c.secondaryCta && (
                <Button
                  href={c.secondaryCta.href}
                  onClick={
                    c.secondaryCta.href?.startsWith("#")
                      ? (event) => {
                          event.preventDefault();
                          document
                            .querySelector(c.secondaryCta.href)
                            ?.scrollIntoView({ behavior: "smooth" });
                        }
                      : undefined
                  }
                  icon={<PlayCircleOutlined />}
                >
                  {c.secondaryCta.label}
                </Button>
              )}
            </div>
            <div className="trust-row">
              <div className="trust-avatars">
                <Avatar>李</Avatar>
                <Avatar>王</Avatar>
                <Avatar>陈</Avatar>
              </div>
              <span>{c.trustLine}</span>
            </div>
          </div>
          {c.deviceImageFileId ? (
            <img
              className="hero-device-image"
              src={`/api/v1/public/assets/${c.deviceImageFileId}`}
              alt="赛博鱼乐识别界面"
            />
          ) : (
            <ProductMock />
          )}
        </section>
      </>
    );
  if (module.type === "FEATURE_GRID")
    return (
      <section id="features" className="landing-section alt">
        <div className="landing-inner">
          <h2 className="section-title">{c.sectionTitle}</h2>
          <p className="section-lead">{c.sectionSub}</p>
          <div className="feature-grid">
            {(c.items ?? []).map((item: any, index: number) => (
              <article className="feature-card" key={`${item.title}-${index}`}>
                <span className="feature-icon">
                  <ArrowUpOutlined />
                </span>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  if (module.type === "SCENE_STATS")
    return (
      <section id="scenarios" className="landing-section">
        <div className="landing-inner">
          <h2 className="section-title">{c.sectionTitle}</h2>
          <p className="section-lead">{c.sectionSub}</p>
          <div className="metric-strip">
            {(c.stats ?? []).map((item: any) => (
              <div className="metric-item" key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <div className="scenario-grid">
            {(c.scenes ?? []).map((item: any) => (
              <div className="scenario-card" key={item.title}>
                <div className="scenario-banner">{item.title}</div>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  if (module.type === "TESTIMONIAL")
    return (
      <section className="landing-section alt">
        <div className="landing-inner">
          <h2 className="section-title">{c.sectionTitle}</h2>
          <p className="section-lead">{c.sectionSub}</p>
          <div className="testimonial-grid">
            {(c.items ?? []).map((item: any) => (
              <article className="testimonial-card" key={item.name}>
                “{item.quote}”
                <div className="testimonial-author">
                  <Avatar>{String(item.name).slice(0, 1)}</Avatar>
                  <div>
                    {item.name}
                    <small>{item.meta}</small>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  if (module.type === "FAQ")
    return (
      <section id="faq" className="landing-section">
        <div className="landing-inner">
          <h2 className="section-title">{c.sectionTitle}</h2>
          <p className="section-lead">{c.sectionSub}</p>
          <div className="faq-list">
            {(c.items ?? []).map((item: any, index: number) => (
              <article
                className="faq-item"
                key={item.question}
                onClick={() =>
                  context.setOpenFaq(context.openFaq === index ? -1 : index)
                }
              >
                <div className="faq-question">
                  <span>{item.question}</span>
                  <span>{context.openFaq === index ? "−" : "+"}</span>
                </div>
                {context.openFaq === index && (
                  <div className="faq-answer">{item.answer}</div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  if (module.type === "CTA")
    return (
      <section id="download" className="landing-cta">
        <h2>{c.title}</h2>
        <p>{c.sub}</p>
        <Button
          href={context.resolveAction(c.primary?.href)}
          icon={<DownloadOutlined />}
        >
          {c.primary?.label ?? "Android 版下载"}
        </Button>
        {c.secondary && (
          <Button ghost href={c.secondary.href}>
            {c.secondary.label}
          </Button>
        )}
      </section>
    );
  if (module.type === "FOOTER")
    return (
      <footer className="landing-footer">
        <div className="footer-grid">
          <div>
            <div className="landing-brand">
              <SiteBrandMark fileId={context.logoFileId} size={22} />
              {context.brandName}
            </div>
            <p>{c.brandText}</p>
          </div>
          <div>
            <h4>产品</h4>
            <a href="#features" onClick={(event) => { event.preventDefault(); context.scrollTo("features"); }}>产品能力</a>
            <a href="#scenarios" onClick={(event) => { event.preventDefault(); context.scrollTo("scenarios"); }}>使用场景</a>
          </div>
          <div>
            <h4>支持</h4>
            <a href="#faq" onClick={(event) => { event.preventDefault(); context.scrollTo("faq"); }}>常见问题</a>
            <a href="#faq" onClick={(event) => { event.preventDefault(); context.scrollTo("faq"); }}>意见反馈</a>
          </div>
          <div>
            <h4>关于</h4>
            <a href="#/account">用户中心</a>
            <a href="#/account/login">登录</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>{context.copyright || c.copyright}</span>
          {context.showIcp && <span>{context.icp || c.icp}</span>}
        </div>
      </footer>
    );
  return null;
}

function ProductMock() {
  return (
    <div className="product-mock" aria-label="赛博鱼乐识别界面预览">
      <div className="mock-float left">
        当前漂相<strong>顶漂</strong>
      </div>
      <div className="mock-screen">
        <div className="mock-status">LiteRT · 检测中</div>
        <div className="mock-dot" />
        <div className="mock-title">漂浮稳定</div>
        <div className="mock-wave" />
        <div className="mock-confidence">
          <strong>置信度 92%</strong>
          <span>抬竿时机</span>下沉 3.2 px · 抖动 1.4 Hz
        </div>
      </div>
      <div className="mock-float right">
        今日识别<strong>1,284</strong>
      </div>
    </div>
  );
}

function BannerCarousel({ banners, scrollTo }: { banners: Banner[]; scrollTo: (id: string) => void }) {
  return (
    <section className="landing-banner-band">
      <Carousel autoplay autoplaySpeed={5000}>
        {banners.map((banner) => (
          <a
            className="landing-banner-slide"
            href={
              banner.linkType === "NONE"
                ? undefined
                : (banner.linkUrl ?? undefined)
            }
            onClick={banner.linkType === "INTERNAL" && banner.linkUrl?.startsWith("/") ? (event) => { const target = banner.linkUrl!.slice(1); if (["features", "scenarios", "faq", "download"].includes(target)) { event.preventDefault(); scrollTo(target); } } : undefined}
            key={banner.id}
          >
            <img src={banner.resolvedImageUrl ?? ""} alt={banner.title} />
            <div>
              <strong>{banner.title}</strong>
              {banner.subtitle && <span>{banner.subtitle}</span>}
            </div>
          </a>
        ))}
      </Carousel>
    </section>
  );
}


function activeBanners(items: Banner[]): Banner[] {
  const now = Date.now();
  return items
    .filter(
      (item) =>
        item.enabled &&
        (!item.startAt || new Date(item.startAt).getTime() <= now) &&
        (!item.endAt || new Date(item.endAt).getTime() > now),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function selectDownload(items: DownloadLink[]): DownloadLink | undefined {
  return (
    items.find(
      (item) =>
        item.enabled &&
        item.platform === "ANDROID" &&
        item.channel === "official",
    ) ?? items.find((item) => item.enabled && item.platform === "ANDROID")
  );
}

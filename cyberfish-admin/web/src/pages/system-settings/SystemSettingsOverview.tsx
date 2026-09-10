import {
  AppstoreOutlined,
  CloudUploadOutlined,
  DownloadOutlined,
  PictureOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { PublishStatusBar, SettingsHeader } from "./SettingsShared";

const domains = [
  {
    key: "site",
    title: "站点与 SEO",
    scope: "SITE",
    icon: <SearchOutlined />,
    model: "SiteSetting (JSON)",
    path: "/admin/settings/SITE",
    detail: "页面标题、meta 关键词与描述、OG 分享图、备案与版权信息。",
  },
  {
    key: "downloads",
    title: "应用下载管理",
    scope: "DOWNLOAD",
    icon: <DownloadOutlined />,
    model: "DownloadLink",
    path: "/admin/download-links",
    detail: "Android、iOS、HarmonyOS 下载链接、版本与渠道。",
  },
  {
    key: "banners",
    title: "首页轮播图",
    scope: "BANNER",
    icon: <PictureOutlined />,
    model: "Banner",
    path: "/admin/banners",
    detail: "轮播图片、排序、启停、生效时段与点击跳转。",
  },
  {
    key: "landing",
    title: "落地页内容编排",
    scope: "LANDING",
    icon: <AppstoreOutlined />,
    model: "LandingModule",
    path: "/admin/landing-modules",
    detail: "Hero、功能卡、场景、口碑、FAQ、CTA 与页脚。",
  },
  {
    key: "user-page",
    title: "用户页面设置",
    scope: "USER_PAGE",
    icon: <UserOutlined />,
    model: "SiteSetting (JSON)",
    path: "/admin/settings/USER_PAGE",
    detail: "个人中心与登录页的展示项、文案、默认头像和空态提示。",
  },
];

export function SystemSettingsOverview() {
  const navigate = useNavigate();
  return (
    <div className="settings-page">
      <SettingsHeader
        title="配置域总览"
        description="5 个配置域共用一套草稿、发布、快照、定时生效与回滚链路。"
        actions={
          <button
            className="settings-primary-command"
            onClick={() => navigate("/settings/publish")}
          >
            <CloudUploadOutlined />
            发布配置
          </button>
        }
      />
      <PublishStatusBar />
      <div className="settings-domain-grid">
        {domains.map((item) => (
          <button
            key={item.key}
            className="settings-domain-card"
            onClick={() => navigate(`/settings/${item.key}`)}
          >
            <span className="settings-domain-icon">{item.icon}</span>
            <strong>{item.title}</strong>
            <b>scope = {item.scope}</b>
            <p>{item.detail}</p>
            <dl>
              <dt>数据模型</dt>
              <dd>{item.model}</dd>
              <dt>读写接口</dt>
              <dd>{item.path}</dd>
            </dl>
          </button>
        ))}
      </div>
      <section className="settings-flow">
        <h2>配置生效链路</h2>
        <p>
          编辑只写草稿，发布后生成不可变快照，公开接口按统一版本向官网和用户页面提供配置。
        </p>
        <div className="settings-flow-steps">
          {[
            "后台编辑",
            "校验与保存",
            "发布 / 定时",
            "公开读接口",
            "前端生效",
          ].map((label, index) => (
            <div key={label}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <strong>{label}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

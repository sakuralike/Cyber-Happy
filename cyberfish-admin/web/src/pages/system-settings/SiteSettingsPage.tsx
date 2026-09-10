import { useEffect } from "react";
import { Button, Form, Input, message, Select, Switch } from "antd";
import {
  CloudUploadOutlined,
  SaveOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  discardSettings,
  getSettings,
  publishSettings,
  saveSettings,
} from "../../api/systemSettings";
import { notifyError } from "../../api/client";
import { useAuth } from "../../store/auth";
import {
  PublishStatusBar,
  SectionTitle,
  SettingSwitchRow,
  SettingsHeader,
  UploadTile,
} from "./SettingsShared";

type SiteValues = Record<string, any>;

export function SiteSettingsPage() {
  const [form] = Form.useForm<SiteValues>();
  const queryClient = useQueryClient();
  const { hasPerm } = useAuth();
  const canWrite = hasPerm("siteConfig:write");
  const canPublish = hasPerm("siteConfig:publish");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "settings", "SITE"],
    queryFn: () => getSettings("SITE"),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["admin", "settings", "SITE"],
      }),
      queryClient.invalidateQueries({ queryKey: ["admin", "config-version"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "config-changes"] }),
      queryClient.invalidateQueries({ queryKey: ["public-config"] }),
    ]);
  const saveMutation = useMutation({
    mutationFn: (values: SiteValues) => saveSettings("SITE", values),
    onSuccess: async () => {
      message.success("站点配置草稿已保存");
      await refresh();
    },
    onError: notifyError,
  });
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (canWrite) {
        const values = await form.validateFields();
        await saveSettings("SITE", values);
      }
      return publishSettings({ scopes: ["SITE"], note: "发布站点与 SEO 配置" });
    },
    onSuccess: async (revision) => {
      message.success(`配置 v${revision.version} 已发布`);
      await refresh();
    },
    onError: notifyError,
  });
  const discardMutation = useMutation({
    mutationFn: () => discardSettings("SITE"),
    onSuccess: async (result) => {
      form.setFieldsValue(result.values);
      message.success("草稿已放弃");
      await refresh();
    },
    onError: notifyError,
  });

  useEffect(() => {
    if (data) form.setFieldsValue({ ...data.values, ...data.drafts });
  }, [data, form]);

  const previewTitle =
    Form.useWatch("seo.title", form) ?? "赛博鱼乐 · 智能鱼漂识别与抬竿提醒";
  const previewDescription = Form.useWatch("seo.description", form) ?? "";
  const watchedOgTitle = Form.useWatch("seo.ogTitle", form);
  const watchedSiteName = Form.useWatch("site.name", form);
  const watchedOgDescription = Form.useWatch("seo.ogDescription", form);
  const ogTitle = watchedOgTitle || watchedSiteName || "赛博鱼乐";
  const ogDescription = watchedOgDescription || previewDescription;

  const actions = (
    <>
      {canWrite && (
        <Button
          icon={<UndoOutlined />}
          disabled={!data?.draftCount}
          loading={discardMutation.isPending}
          onClick={() => discardMutation.mutate()}
        >
          放弃草稿
        </Button>
      )}
      {canWrite && (
        <Button
          icon={<SaveOutlined />}
          loading={saveMutation.isPending}
          onClick={() => form.submit()}
        >
          保存草稿
        </Button>
      )}
      {canPublish && (
        <Button
          type="primary"
          icon={<CloudUploadOutlined />}
          loading={publishMutation.isPending}
          onClick={() => publishMutation.mutate()}
        >
          发布到前端
        </Button>
      )}
    </>
  );

  return (
    <div className="settings-page">
      <SettingsHeader
        title="站点与 SEO"
        description="控制站点基础信息、搜索摘要、社交分享卡片与展示状态；保存为草稿，发布后生效。"
        actions={actions}
      />
      <PublishStatusBar />
      <Form
        form={form}
        layout="vertical"
        disabled={isLoading || !canWrite}
        onFinish={(values) => saveMutation.mutate(values)}
      >
        <div className="settings-two-column">
          <div className="settings-stack">
            <section className="settings-panel">
              <SectionTitle>基础信息</SectionTitle>
              <Form.Item
                name="site.name"
                label="站点名称"
                rules={[{ required: true, message: "请输入站点名称" }]}
              >
                <Input maxLength={60} showCount />
              </Form.Item>
              <Form.Item name="site.logoFileId" label="站点 Logo">
                <UploadTile hint="建议 240 × 240 · PNG 透明底" />
              </Form.Item>
              <Form.Item name="site.faviconFileId" label="浏览器图标">
                <UploadTile hint="建议 64 × 64 · PNG / WebP" />
              </Form.Item>
              <Form.Item name="site.icpNo" label="ICP备案号">
                <Input maxLength={50} />
              </Form.Item>
              <Form.Item name="site.copyright" label="页脚版权文字">
                <Input maxLength={200} />
              </Form.Item>
            </section>
            <section className="settings-panel">
              <SectionTitle>SEO 与分享</SectionTitle>
              <Form.Item
                name="seo.title"
                label="页面标题（title）"
                rules={[{ required: true, max: 60 }]}
                extra={`${String(previewTitle).length}/60 字符 · 建议 6-20 字，核心关键词放前面`}
              >
                <Input maxLength={60} />
              </Form.Item>
              <Form.Item
                name="seo.keywords"
                label="meta 关键词（keywords）"
                extra="建议 3-6 个，输入后回车添加"
              >
                <Select
                  mode="tags"
                  tokenSeparators={[",", "，"]}
                  maxCount={10}
                  placeholder="输入关键词后回车"
                />
              </Form.Item>
              <Form.Item
                name="seo.description"
                label="meta 描述（description）"
                rules={[{ required: true, max: 160 }]}
                extra={`${String(previewDescription).length}/160 字符`}
              >
                <Input.TextArea rows={4} maxLength={160} />
              </Form.Item>
              <Form.Item name="seo.ogTitle" label="OG 标题">
                <Input maxLength={60} />
              </Form.Item>
              <Form.Item name="seo.ogDescription" label="OG 描述">
                <Input.TextArea rows={3} maxLength={160} />
              </Form.Item>
              <Form.Item name="seo.ogImageFileId" label="OG 分享图">
                <UploadTile hint="建议 1200 × 630 · JPG / PNG · ≤2MB" />
              </Form.Item>
            </section>
            <section className="settings-panel">
              <SectionTitle>展示开关</SectionTitle>
              <SettingSwitchRow
                title="显示备案与版权信息"
                description="关闭后页脚仅保留品牌名与导航"
                control={
                  <Form.Item
                    name="feature.showIcp"
                    valuePropName="checked"
                    noStyle
                  >
                    <Switch />
                  </Form.Item>
                }
              />
              <SettingSwitchRow
                title="站点维护模式"
                description="开启后前台展示维护公告，保留登录入口"
                control={
                  <Form.Item
                    name="feature.maintenance"
                    valuePropName="checked"
                    noStyle
                  >
                    <Switch />
                  </Form.Item>
                }
              />
              <Form.Item name="feature.maintenanceMessage" label="维护公告">
                <Input maxLength={200} />
              </Form.Item>
            </section>
          </div>
          <aside className="settings-preview-stack">
            <section className="settings-panel settings-sticky-preview">
              <SectionTitle>搜索结果预览</SectionTitle>
              <div className="search-preview">
                <strong>{previewTitle}</strong>
                <span>https://cyberfish.app</span>
                <p>{previewDescription}</p>
              </div>
              <SectionTitle>社交分享卡片预览</SectionTitle>
              <div className="share-preview">
                <div className="share-preview-image" />
                <strong>{ogTitle}</strong>
                <span>{ogDescription}</span>
              </div>
            </section>
          </aside>
        </div>
      </Form>
    </div>
  );
}

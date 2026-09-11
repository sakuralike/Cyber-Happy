import { useEffect, useState } from "react";
import { Button, Form, Input, message, Segmented, Switch } from "antd";
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

type UserPageValues = Record<string, any>;

export function UserPageSettingsPage() {
  const [form] = Form.useForm<UserPageValues>();
  const [tab, setTab] = useState<"profile" | "auth">("profile");
  const queryClient = useQueryClient();
  const { hasPerm } = useAuth();
  const canWrite = hasPerm("siteConfig:write");
  const canPublish = hasPerm("siteConfig:publish");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "settings", "USER_PAGE"],
    queryFn: () => getSettings("USER_PAGE"),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["admin", "settings", "USER_PAGE"],
      }),
      queryClient.invalidateQueries({ queryKey: ["admin", "config-version"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "config-changes"] }),
      queryClient.invalidateQueries({ queryKey: ["public-config"] }),
    ]);
  const saveMutation = useMutation({
    mutationFn: (values: UserPageValues) => saveSettings("USER_PAGE", values),
    onSuccess: async () => {
      message.success("用户页面草稿已保存");
      await refresh();
    },
    onError: notifyError,
  });
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (canWrite) {
        const values = await form.validateFields();
        await saveSettings("USER_PAGE", values);
      }
      return publishSettings({
        scopes: ["USER_PAGE"],
        note: "发布用户页面配置",
      });
    },
    onSuccess: async (revision) => {
      message.success(`配置 v${revision.version} 已发布`);
      await refresh();
    },
    onError: notifyError,
  });
  const discardMutation = useMutation({
    mutationFn: () => discardSettings("USER_PAGE"),
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
  const welcome =
    Form.useWatch("user.welcome.template", form) ??
    "{nickname}，本周已识别 {weekCount} 次";
  const emptyText = Form.useWatch("user.emptyState.text", form) ?? "";
  const showProfile = Form.useWatch("user.nav.profile", form) ?? true;
  const showReports = Form.useWatch("user.nav.misreports", form) ?? true;
  const showNotifications =
    Form.useWatch("user.nav.notifications", form) ?? true;
  const showSecurity = Form.useWatch("user.nav.security", form) ?? true;
  const showDevices = Form.useWatch("user.nav.devices", form) ?? false;
  const brandTitle =
    Form.useWatch("auth.brandTitle", form) ?? "鱼漂识别的运营与技术中枢";
  const brandSubtitle = Form.useWatch("auth.brandSubtitle", form) ?? "";
  const actions = (
    <>
      {canWrite && (
        <Button
          icon={<UndoOutlined />}
          disabled={!data?.draftCount}
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
          保存并发布
        </Button>
      )}
    </>
  );

  return (
    <div className="settings-page">
      <SettingsHeader
        title="用户页面设置"
        description="配置个人中心与注册登录页的展示项和文案，发布后对新会话生效。"
        actions={actions}
      />
      <PublishStatusBar />
      <Segmented
        className="settings-segmented"
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
        options={[
          { value: "profile", label: "个人中心" },
          { value: "auth", label: "注册登录页" },
        ]}
      />
      <Form
        form={form}
        layout="vertical"
        disabled={isLoading || !canWrite}
        onFinish={(values) => saveMutation.mutate(values)}
      >
        <div className="settings-two-column">
          <div className="settings-stack">
            {tab === "profile" ? (
              <>
                <section className="settings-panel">
                  <SectionTitle>概览与文案</SectionTitle>
                  <Form.Item
                    name="user.welcome.template"
                    label="欢迎语模板"
                    rules={[{ required: true }]}
                    extra="支持变量：{nickname} · {weekCount} · {fishCount}"
                  >
                    <Input maxLength={120} />
                  </Form.Item>
                  <Form.Item name="user.avatar.defaultFileId" label="默认头像">
                    <UploadTile hint="建议 240 × 240 · 未上传时使用品牌首字母头像" />
                  </Form.Item>
                  <Form.Item
                    name="user.emptyState.text"
                    label="空状态提示文案"
                    rules={[{ required: true }]}
                  >
                    <Input maxLength={80} />
                  </Form.Item>
                </section>
                <section className="settings-panel">
                  <SectionTitle>侧栏菜单显示</SectionTitle>
                  <SettingSwitchRow
                    title="账号概览"
                    description="默认首页，不可关闭"
                    control={
                      <Form.Item
                        name="user.nav.dashboard"
                        valuePropName="checked"
                        noStyle
                      >
                        <Switch disabled />
                      </Form.Item>
                    }
                  />
                  <SettingSwitchRow
                    title="个人资料"
                    description="关闭后用户无法自助修改昵称与邮箱"
                    control={
                      <Form.Item
                        name="user.nav.profile"
                        valuePropName="checked"
                        noStyle
                      >
                        <Switch />
                      </Form.Item>
                    }
                  />
                  <SettingSwitchRow
                    title="误报记录"
                    description="显示当前账号可见的误报复核记录"
                    control={
                      <Form.Item
                        name="user.nav.misreports"
                        valuePropName="checked"
                        noStyle
                      >
                        <Switch />
                      </Form.Item>
                    }
                  />
                  <SettingSwitchRow
                    title="消息通知"
                    description="显示误报状态更新"
                    control={
                      <Form.Item
                        name="user.nav.notifications"
                        valuePropName="checked"
                        noStyle
                      >
                        <Switch />
                      </Form.Item>
                    }
                  />
                  <SettingSwitchRow
                    title="安全设置"
                    description="显示账号安全信息"
                    control={
                      <Form.Item
                        name="user.nav.security"
                        valuePropName="checked"
                        noStyle
                      >
                        <Switch />
                      </Form.Item>
                    }
                  />
                  <SettingSwitchRow
                    title="设备管理"
                    description="功能开放前建议保持关闭"
                    control={
                      <Form.Item
                        name="user.nav.devices"
                        valuePropName="checked"
                        noStyle
                      >
                        <Switch />
                      </Form.Item>
                    }
                  />
                </section>
                <section className="settings-panel">
                  <SectionTitle>数据卡与模块显示</SectionTitle>
                  <SettingSwitchRow
                    title="展示累计数据卡"
                    description="关闭后概览区仅显示欢迎横幅"
                    control={
                      <Form.Item
                        name="user.dashboard.showTotal"
                        valuePropName="checked"
                        noStyle
                      >
                        <Switch />
                      </Form.Item>
                    }
                  />
                  <SettingSwitchRow
                    title="展示活动摘要"
                    description="控制概览活动信息"
                    control={
                      <Form.Item
                        name="user.dashboard.showActivity"
                        valuePropName="checked"
                        noStyle
                      >
                        <Switch />
                      </Form.Item>
                    }
                  />
                  <SettingSwitchRow
                    title="展示最近动态"
                    description="关闭后概览页更紧凑"
                    control={
                      <Form.Item
                        name="user.dashboard.showRecent"
                        valuePropName="checked"
                        noStyle
                      >
                        <Switch />
                      </Form.Item>
                    }
                  />
                </section>
                <section className="settings-panel">
                  <SectionTitle>反馈、帮助与关于</SectionTitle>
                  <Form.Item name="support.feedback.title" label="反馈标题" rules={[{ required: true }]}><Input maxLength={40} /></Form.Item>
                  <Form.Item name="support.feedback.placeholder" label="反馈输入提示" rules={[{ required: true }]}><Input maxLength={120} /></Form.Item>
                  <Form.Item name="support.feedback.contactHint" label="联系方式提示"><Input maxLength={200} /></Form.Item>
                  <Form.Item name="support.help.title" label="帮助标题" rules={[{ required: true }]}><Input maxLength={40} /></Form.Item>
                  <Form.Item name="support.help.content" label="帮助内容" rules={[{ required: true }]}><Input.TextArea rows={5} maxLength={2000} /></Form.Item>
                  <Form.Item name="about.title" label="关于标题" rules={[{ required: true }]}><Input maxLength={40} /></Form.Item>
                  <Form.Item name="about.content" label="产品介绍" rules={[{ required: true }]}><Input.TextArea rows={4} maxLength={2000} /></Form.Item>
                  <Form.Item name="about.privacy" label="隐私说明" rules={[{ required: true }]}><Input.TextArea rows={5} maxLength={2000} /></Form.Item>
                </section>
              </>
            ) : (
              <>
                <section className="settings-panel">
                  <SectionTitle>品牌文案</SectionTitle>
                  <Form.Item
                    name="auth.brandTitle"
                    label="登录页标题"
                    rules={[{ required: true }]}
                  >
                    <Input maxLength={40} />
                  </Form.Item>
                  <Form.Item name="auth.brandSubtitle" label="登录页副标题">
                    <Input.TextArea rows={3} maxLength={80} />
                  </Form.Item>
                  <Form.Item name="auth.bgImageFileId" label="背景图片">
                    <UploadTile hint="建议 1440 × 900 · JPG / PNG / WebP" />
                  </Form.Item>
                  <Form.Item name="auth.footer" label="页脚文字">
                    <Input maxLength={200} />
                  </Form.Item>
                </section>
                <section className="settings-panel">
                  <SectionTitle>登录方式与隐私</SectionTitle>
                  <SettingSwitchRow
                    title="手机号登录"
                    description="保留手机号登录入口"
                    control={
                      <Form.Item
                        name="auth.methods.phone"
                        valuePropName="checked"
                        noStyle
                      >
                        <Switch />
                      </Form.Item>
                    }
                  />
                  <SettingSwitchRow
                    title="微信登录"
                    description="保留微信登录入口"
                    control={
                      <Form.Item
                        name="auth.methods.wechat"
                        valuePropName="checked"
                        noStyle
                      >
                        <Switch />
                      </Form.Item>
                    }
                  />
                  <SettingSwitchRow
                    title="邮箱登录"
                    description="开启邮箱登录入口"
                    control={
                      <Form.Item
                        name="auth.methods.email"
                        valuePropName="checked"
                        noStyle
                      >
                        <Switch />
                      </Form.Item>
                    }
                  />
                  <SettingSwitchRow
                    title="必须同意隐私条款"
                    description="登录前要求确认用户协议与隐私政策"
                    control={
                      <Form.Item
                        name="auth.privacyRequired"
                        valuePropName="checked"
                        noStyle
                      >
                        <Switch />
                      </Form.Item>
                    }
                  />
                </section>
              </>
            )}
          </div>
          <aside className="settings-preview-stack">
            <section className="settings-panel settings-sticky-preview">
              <SectionTitle>
                {tab === "profile"
                  ? "用户中心 · 侧栏预览"
                  : "登录页 · 品牌预览"}
              </SectionTitle>
              {tab === "profile" ? (
                <div className="user-page-preview">
                  <strong>陈钓友</strong>
                  <span>
                    {String(welcome)
                      .replace("{nickname}", "陈钓友")
                      .replace("{weekCount}", "1,284")
                      .replace("{fishCount}", "36")}
                  </span>
                  <b>账号概览</b>
                  {showProfile && <i>个人资料</i>}
                  {showReports && <i>误报记录</i>}
                  {showNotifications && <i>消息通知</i>}
                  {showSecurity && <i>安全设置</i>}
                  {showDevices && <i>设备管理</i>}
                  <small>{emptyText}</small>
                </div>
              ) : (
                <div className="auth-page-preview">
                  <strong>{brandTitle}</strong>
                  <p>{brandSubtitle}</p>
                  <span>账号</span>
                  <span>密码</span>
                  <button type="button">登录</button>
                </div>
              )}
            </section>
          </aside>
        </div>
      </Form>
    </div>
  );
}

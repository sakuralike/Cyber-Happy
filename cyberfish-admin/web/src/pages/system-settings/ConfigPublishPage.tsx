import { useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import {
  Button,
  Checkbox,
  DatePicker,
  Drawer,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Tag,
} from "antd";
import {
  CloudUploadOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCurrentVersion,
  getDraftChanges,
  listRevisions,
  publishSettings,
  rollbackRevision,
  type ConfigChange,
  type ConfigRevision,
  type ConfigScope,
} from "../../api/systemSettings";
import { notifyError } from "../../api/client";
import { useAuth } from "../../store/auth";
import { formatConfigValue, SettingsHeader } from "./SettingsShared";

const scopeLabel: Record<ConfigScope, string> = {
  SITE: "站点与 SEO",
  DOWNLOAD: "应用下载",
  BANNER: "首页轮播",
  LANDING: "落地页",
  USER_PAGE: "用户页面",
};
const statusLabel = {
  PUBLISHED: ["已发布", "green"],
  PENDING: ["待生效", "orange"],
  ROLLED_BACK: ["已回滚", "default"],
  DRAFT: ["草稿", "cyan"],
} as const;

export function ConfigPublishPage() {
  const [form] = Form.useForm<{
    scopes: ConfigScope[];
    note?: string;
    effectiveAt?: Dayjs;
  }>();
  const queryClient = useQueryClient();
  const { hasPerm } = useAuth();
  const canPublish = hasPerm("siteConfig:publish");
  const [publishOpen, setPublishOpen] = useState(false);
  const [detail, setDetail] = useState<ConfigRevision | null>(null);
  const currentQuery = useQuery({
    queryKey: ["admin", "config-version"],
    queryFn: getCurrentVersion,
  });
  const changesQuery = useQuery({
    queryKey: ["admin", "config-changes"],
    queryFn: getDraftChanges,
  });
  const historyQuery = useQuery({
    queryKey: ["admin", "config-revisions"],
    queryFn: listRevisions,
  });
  const current = currentQuery.data;
  const changes = changesQuery.data ?? [];
  const history = historyQuery.data ?? [];
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "config-version"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "config-changes"] }),
      queryClient.invalidateQueries({
        queryKey: ["admin", "config-revisions"],
      }),
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "download-links"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "banners"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "landing-modules"] }),
      queryClient.invalidateQueries({ queryKey: ["public-config"] }),
    ]);
  const publishMutation = useMutation({
    mutationFn: (values: {
      scopes: ConfigScope[];
      note?: string;
      effectiveAt?: Dayjs;
    }) =>
      publishSettings({
        scopes: values.scopes,
        note: values.note,
        effectiveAt: values.effectiveAt?.toISOString() ?? null,
      }),
    onSuccess: async (revision) => {
      setPublishOpen(false);
      message.success(
        revision.status === "PENDING"
          ? `v${revision.version} 已安排定时生效`
          : `v${revision.version} 已发布`,
      );
      await refresh();
    },
    onError: notifyError,
  });
  const rollbackMutation = useMutation({
    mutationFn: rollbackRevision,
    onSuccess: async (revision) => {
      message.success(`已生成回滚版本 v${revision.version}`);
      await refresh();
    },
    onError: notifyError,
  });
  const openPublish = (scheduled = false) => {
    const scopes = current?.draftScopes?.length
      ? current.draftScopes
      : [...new Set(changes.map((item) => item.scope))];
    form.resetFields();
    form.setFieldsValue({
      scopes,
      effectiveAt: scheduled ? dayjs().add(1, "hour") : undefined,
    });
    setPublishOpen(true);
  };
  const actions = canPublish ? (
    <span className="publish-actions">
      <Button
        icon={<ClockCircleOutlined />}
        disabled={!changes.length}
        onClick={() => openPublish(true)}
      >
        定时发布
      </Button>
      <Button
        type="primary"
        icon={<CloudUploadOutlined />}
        disabled={!changes.length}
        onClick={() => openPublish(false)}
      >
        立即发布
      </Button>
    </span>
  ) : undefined;

  return (
    <div className="settings-page">
      <SettingsHeader
        title="配置发布与生效机制"
        description="所有配置域共用统一版本号；发布生成不可变快照，支持定时生效与历史回滚。"
      />
      <section className="settings-release-hero">
        <div>
          <span>当前线上版本</span>
          <strong>v{current?.version ?? 0} · 已发布</strong>
          <small>
            {current?.publishedAt
              ? new Date(current.publishedAt).toLocaleString("zh-CN")
              : "尚未发布"}
          </small>
        </div>
        <div className="settings-release-actions">
          <Button
            icon={<EyeOutlined />}
            disabled={!changes.length}
            onClick={() =>
              setDetail({
                id: "draft",
                version: (current?.version ?? 0) + 1,
                scopes: [...new Set(changes.map((item) => item.scope))],
                status: "DRAFT",
                effectiveAt: null,
                publishedAt: null,
                createdAt: new Date().toISOString(),
                note: "待发布草稿",
                changes,
                snapshot: {} as Record<ConfigScope, unknown>,
              })
            }
          >
            查看差异
          </Button>
          {actions}
        </div>
        <div className="settings-release-summary">
          <span className="settings-status-dot" />
          {changes.length
            ? `草稿中有 ${changes.length} 项变更 · 涉及 ${new Set(changes.map((item) => item.scope)).size} 个配置域`
            : "当前草稿与线上版本一致"}
        </div>
      </section>
      <section className="settings-panel settings-change-panel">
        <div className="settings-section-title">
          <div>
            <h2>待发布变更集</h2>
            <span>与线上 v{current?.version ?? 0} 的逐字段对比</span>
          </div>
        </div>
        {changes.length ? (
          changes
            .slice(0, 100)
            .map((change) => (
              <ChangeRow
                key={`${change.scope}:${change.key}`}
                change={change}
              />
            ))
        ) : (
          <div className="settings-empty">暂无待发布变更</div>
        )}
      </section>
      <section className="settings-panel settings-history">
        <h2>发布历史与回滚</h2>
        {history.map((revision) => {
          const [label, color] = statusLabel[revision.status];
          return (
            <div className="settings-history-row" key={revision.id}>
              <div>
                <strong>
                  v{revision.version}
                  {revision.version === current?.version
                    ? " · 当前线上版本"
                    : ""}
                </strong>
                <span>
                  {revision.publishedAt
                    ? new Date(revision.publishedAt).toLocaleString("zh-CN")
                    : revision.effectiveAt
                      ? `${new Date(revision.effectiveAt).toLocaleString("zh-CN")} 生效`
                      : "未生效"}{" "}
                  · {revision.publishedBy?.displayName ?? "系统"} ·{" "}
                  {revision.changes.length} 项变更
                </span>
              </div>
              <Tag color={color}>{label}</Tag>
              <Button type="link" onClick={() => setDetail(revision)}>
                查看快照
              </Button>
              {canPublish &&
                revision.version !== current?.version &&
                revision.status !== "PENDING" && (
                  <Popconfirm
                    title={`回滚到 v${revision.version}？`}
                    description="回滚会生成一个新的线上版本。"
                    onConfirm={() => rollbackMutation.mutate(revision.id)}
                  >
                    <Button type="link" icon={<RollbackOutlined />}>
                      回滚到此版本
                    </Button>
                  </Popconfirm>
                )}
            </div>
          );
        })}
        {!history.length && <div className="settings-empty">暂无发布记录</div>}
      </section>
      <div className="settings-mode-grid">
        <div>
          <CloudUploadOutlined />
          <strong>实时推送</strong>
          <span>发布后通过 SSE 通知在线页面刷新配置。</span>
        </div>
        <div>
          <EyeOutlined />
          <strong>按需拉取</strong>
          <span>页面进入时按 ETag 与版本号读取公开快照。</span>
        </div>
        <div>
          <ClockCircleOutlined />
          <strong>定时生效</strong>
          <span>计划版本到点后以幂等任务切换为线上版本。</span>
        </div>
      </div>
      <Modal
        title="发布配置"
        open={publishOpen}
        onCancel={() => setPublishOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={publishMutation.isPending}
        okText="确认发布"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => publishMutation.mutate(values)}
        >
          <Form.Item
            name="scopes"
            label="发布范围"
            rules={[{ required: true, message: "至少选择一个配置域" }]}
          >
            <Checkbox.Group
              options={Object.entries(scopeLabel).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="effectiveAt"
            label="生效时间"
            extra="不填写则立即生效"
          >
            <DatePicker
              showTime
              style={{ width: "100%" }}
              disabledDate={(date) => date.endOf("day").valueOf() < Date.now()}
            />
          </Form.Item>
          <Form.Item name="note" label="发布说明">
            <Input.TextArea rows={3} maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>
      <Drawer
        title={
          detail?.id === "draft"
            ? "待发布差异"
            : `配置快照 v${detail?.version ?? ""}`
        }
        open={!!detail}
        width={620}
        onClose={() => setDetail(null)}
      >
        {detail?.changes.length ? (
          detail.changes.map((change) => (
            <ChangeRow key={`${change.scope}:${change.key}`} change={change} />
          ))
        ) : (
          <div className="settings-empty">该版本无字段变更</div>
        )}
      </Drawer>
    </div>
  );
}

function ChangeRow({ change }: { change: ConfigChange }) {
  return (
    <div className="settings-change-row">
      <Tag>{scopeLabel[change.scope]}</Tag>
      <strong>{change.key}</strong>
      <span>{formatConfigValue(change.oldValue)}</span>
      <b>→</b>
      <em>{formatConfigValue(change.newValue)}</em>
    </div>
  );
}

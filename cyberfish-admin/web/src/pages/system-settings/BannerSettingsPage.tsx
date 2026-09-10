import { useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import {
  Button,
  DatePicker,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import {
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBanner,
  deleteBanner,
  listBanners,
  publishSettings,
  reorderBanners,
  updateBanner,
  type Banner,
} from "../../api/systemSettings";
import { notifyError } from "../../api/client";
import { useAuth } from "../../store/auth";
import { PublishStatusBar, SettingsHeader, UploadTile } from "./SettingsShared";

const statusLabel = {
  active: ["生效中", "green"],
  scheduled: ["待生效", "orange"],
  expired: ["已过期", "default"],
  disabled: ["已停用", "default"],
} as const;
const platformOptions = [
  { value: "ALL", label: "全部平台" },
  { value: "ANDROID", label: "Android" },
  { value: "IOS", label: "iOS" },
  { value: "HARMONY", label: "HarmonyOS" },
];

export function BannerSettingsPage() {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const { hasPerm } = useAuth();
  const canWrite = hasPerm("siteConfig:write");
  const canPublish = hasPerm("siteConfig:publish");
  const [filters, setFilters] = useState<{
    status?: string;
    platform?: string;
  }>({});
  const [editing, setEditing] = useState<Banner | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "banners", filters],
    queryFn: () => listBanners(filters),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "banners"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "config-version"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "config-changes"] }),
    ]);
  const saveMutation = useMutation({
    mutationFn: (values: any) => {
      const period = values.period as [Dayjs, Dayjs] | undefined;
      const payload = {
        ...values,
        period: undefined,
        startAt: period?.[0]?.toISOString() ?? null,
        endAt: period?.[1]?.toISOString() ?? null,
      };
      return editing
        ? updateBanner(editing.id, payload)
        : createBanner(payload);
    },
    onSuccess: async () => {
      message.success(editing ? "轮播图草稿已更新" : "轮播图已加入草稿");
      setModalOpen(false);
      await refresh();
    },
    onError: notifyError,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<Banner> }) =>
      updateBanner(id, values),
    onSuccess: refresh,
    onError: notifyError,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteBanner,
    onSuccess: async () => {
      message.success("轮播图已删除");
      await refresh();
    },
    onError: notifyError,
  });
  const reorderMutation = useMutation({
    mutationFn: reorderBanners,
    onSuccess: refresh,
    onError: notifyError,
  });
  const publishMutation = useMutation({
    mutationFn: () =>
      publishSettings({ scopes: ["BANNER"], note: "发布首页轮播配置" }),
    onSuccess: async (revision) => {
      message.success(`配置 v${revision.version} 已发布`);
      await refresh();
    },
    onError: notifyError,
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      linkType: "INTERNAL",
      platform: "ALL",
      enabled: true,
      sortOrder: Math.max(-10, ...data.map((item) => item.sortOrder)) + 10,
    });
    setModalOpen(true);
  };
  const openEdit = (row: Banner) => {
    setEditing(row);
    form.setFieldsValue({
      ...row,
      period:
        row.startAt && row.endAt
          ? [dayjs(row.startAt), dayjs(row.endAt)]
          : undefined,
    });
    setModalOpen(true);
  };
  const moveBefore = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const next = [...data];
    const from = next.findIndex((item) => item.id === draggedId);
    const to = next.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    reorderMutation.mutate(next.map((item) => item.id));
    setDraggedId(null);
  };

  const linkType = Form.useWatch("linkType", form);
  const canReorder = canWrite && !filters.status && !filters.platform;
  const actions = (
    <>
      {canWrite && (
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建轮播图
        </Button>
      )}
      {canPublish && (
        <Button
          icon={<CloudUploadOutlined />}
          loading={publishMutation.isPending}
          onClick={() => publishMutation.mutate()}
        >
          发布轮播配置
        </Button>
      )}
    </>
  );
  return (
    <div className="settings-page">
      <SettingsHeader
        title="首页轮播图"
        description="拖拽调整顺序，设置平台、启停与生效时段；发布后前端才会读取新快照。"
        actions={actions}
      />
      <PublishStatusBar />
      <div className="settings-toolbar">
        <Select
          allowClear
          placeholder="全部状态"
          value={filters.status}
          options={Object.entries(statusLabel).map(([value, [label]]) => ({
            value,
            label,
          }))}
          onChange={(status) => setFilters((value) => ({ ...value, status }))}
        />
        <Select
          allowClear
          placeholder="全部平台"
          value={filters.platform}
          options={platformOptions}
          onChange={(platform) =>
            setFilters((value) => ({ ...value, platform }))
          }
        />
        <span>
          共 {data.length} 张 · 已启用{" "}
          {data.filter((item) => item.enabled).length} 张
        </span>
      </div>
      <section
        className="settings-panel settings-sort-list"
        aria-busy={isLoading}
      >
        {data.map((row) => {
          const [label, color] = statusLabel[row.status];
          return (
            <div
              key={row.id}
              className={`settings-sort-row ${draggedId === row.id ? "dragging" : ""}`}
              draggable={canReorder}
              onDragStart={() => setDraggedId(row.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => moveBefore(row.id)}
            >
              <HolderOutlined className="drag-handle" />
              <div
                className="settings-row-thumb"
                style={
                  row.resolvedImageUrl
                    ? { backgroundImage: `url(${row.resolvedImageUrl})` }
                    : undefined
                }
              />
              <div className="settings-sort-copy">
                <strong>{row.title}</strong>
                <span>
                  {row.linkType === "NONE" ? "无跳转" : `跳转 ${row.linkUrl}`} ·{" "}
                  {row.platform === "ALL" ? "全平台" : row.platform}
                </span>
              </div>
              <Tag color={color}>{label}</Tag>
              {canWrite ? (
                <Switch
                  size="small"
                  checked={row.enabled}
                  onChange={(enabled) =>
                    updateMutation.mutate({ id: row.id, values: { enabled } })
                  }
                />
              ) : null}
              <Tooltip title="编辑">
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  disabled={!canWrite}
                  onClick={() => openEdit(row)}
                />
              </Tooltip>
              <Popconfirm
                title="删除该轮播图？"
                onConfirm={() => deleteMutation.mutate(row.id)}
                disabled={!canWrite}
              >
                <Tooltip title="删除">
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={!canWrite}
                  />
                </Tooltip>
              </Popconfirm>
            </div>
          );
        })}
        {!isLoading && data.length === 0 && (
          <div className="settings-empty">暂无轮播图</div>
        )}
      </section>
      <section className="settings-rule-note">
        <strong>排序与生效规则</strong>
        <span>
          拖拽后保存草稿顺序；仅启用且处于生效时段内的轮播图会在发布后下发到前端。
        </span>
      </section>
      <Modal
        title={editing ? "编辑轮播图" : "新建轮播图"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={680}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => saveMutation.mutate(values)}
        >
          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="subtitle" label="副标题">
            <Input maxLength={160} />
          </Form.Item>
          <Form.Item name="imageFileId" label="轮播图片">
            <UploadTile hint="建议 1920 × 640 · JPG / PNG / WebP" />
          </Form.Item>
          <Form.Item name="imageUrl" label="或外部图片链接">
            <Input placeholder="https://" />
          </Form.Item>
          <div className="settings-form-grid">
            <Form.Item name="linkType" label="跳转类型">
              <Select
                options={[
                  { value: "INTERNAL", label: "站内链接" },
                  { value: "EXTERNAL", label: "外部链接" },
                  { value: "NONE", label: "不跳转" },
                ]}
              />
            </Form.Item>
            <Form.Item name="platform" label="展示平台">
              <Select options={platformOptions} />
            </Form.Item>
          </div>
          {linkType !== "NONE" && (
            <Form.Item
              name="linkUrl"
              label="跳转链接"
              rules={[{ required: true }]}
            >
              <Input placeholder="/download 或 https://" />
            </Form.Item>
          )}
          <Form.Item name="period" label="生效时段">
            <DatePicker.RangePicker showTime style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

import { useState } from "react";
import {
  Button,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Radio,
  QRCode,
  Select,
  Switch,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDownloadLink,
  createDownloadQr,
  deleteDownloadLink,
  listDownloadLinks,
  publishSettings,
  reorderDownloadLinks,
  updateDownloadLink,
  type DownloadLink,
} from "../../api/systemSettings";
import { notifyError } from "../../api/client";
import { FileUpload } from "../../components/FileUpload";
import { useAuth } from "../../store/auth";
import { PublishStatusBar, SettingsHeader } from "./SettingsShared";

const platformLabel = {
  ANDROID: "Android",
  IOS: "iOS",
  HARMONY: "HarmonyOS",
} as const;

export function DownloadSettingsPage() {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const { hasPerm } = useAuth();
  const canWrite = hasPerm("siteConfig:write");
  const canPublish = hasPerm("siteConfig:publish");
  const [editing, setEditing] = useState<DownloadLink | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [qr, setQr] = useState<{ target: string } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "download-links"],
    queryFn: () => listDownloadLinks(),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "download-links"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "config-version"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "config-changes"] }),
    ]);
  const saveMutation = useMutation({
    mutationFn: (values: any) =>
      editing
        ? updateDownloadLink(editing.id, values)
        : createDownloadLink(values),
    onSuccess: async () => {
      message.success(editing ? "下载项已更新到草稿" : "下载项已加入草稿");
      setModalOpen(false);
      await refresh();
    },
    onError: notifyError,
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Partial<DownloadLink>;
    }) => updateDownloadLink(id, values),
    onSuccess: refresh,
    onError: notifyError,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteDownloadLink,
    onSuccess: async () => {
      message.success("下载项已删除");
      await refresh();
    },
    onError: notifyError,
  });
  const reorderMutation = useMutation({
    mutationFn: reorderDownloadLinks,
    onSuccess: refresh,
    onError: notifyError,
  });
  const qrMutation = useMutation({
    mutationFn: createDownloadQr,
    onSuccess: setQr,
    onError: notifyError,
  });
  const publishMutation = useMutation({
    mutationFn: () =>
      publishSettings({ scopes: ["DOWNLOAD"], note: "发布应用下载配置" }),
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
      platform: "ANDROID",
      channel: "official",
      mode: "URL",
      enabled: true,
      sortOrder: Math.max(-10, ...data.map((item) => item.sortOrder)) + 10,
    });
    setModalOpen(true);
  };
  const openEdit = (row: DownloadLink) => {
    setEditing(row);
    form.setFieldsValue({
      platform: row.platform,
      channel: row.channel,
      versionName: row.versionName,
      minVersion: row.minVersion,
      mode: row.mode,
      url: row.url,
      fileId: row.fileId,
      enabled: row.enabled,
      sortOrder: row.sortOrder,
      remark: row.remark,
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

  const columns: ColumnsType<DownloadLink> = [
    {
      title: "",
      width: 38,
      render: () => <HolderOutlined className="drag-handle" />,
    },
    {
      title: "平台",
      dataIndex: "platform",
      width: 110,
      render: (value) => platformLabel[value as keyof typeof platformLabel],
    },
    { title: "渠道", dataIndex: "channel", width: 130 },
    {
      title: "版本",
      dataIndex: "versionName",
      width: 110,
      render: (value) => (value ? `v${value}` : "-"),
    },
    {
      title: "下载方式",
      dataIndex: "mode",
      width: 110,
      render: (value) => (value === "UPLOAD" ? "APK 上传" : "外部链接"),
    },
    {
      title: "文件 / 链接",
      render: (_, row) => (
        <span className="settings-link-cell">
          {row.file?.originalName ?? row.url ?? "未配置"}
        </span>
      ),
    },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 100,
      render: (value, row) =>
        canWrite ? (
          <Switch
            size="small"
            checked={value}
            onChange={(enabled) =>
              updateMutation.mutate({ id: row.id, values: { enabled } })
            }
          />
        ) : (
          <Tag color={value ? "green" : "default"}>
            {value ? "已启用" : "已停用"}
          </Tag>
        ),
    },
    {
      title: "操作",
      width: 150,
      render: (_, row) => (
        <div className="table-actions">
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              disabled={!canWrite}
              onClick={() => openEdit(row)}
            />
          </Tooltip>
          <Tooltip title="下载二维码">
            <Button
              type="text"
              size="small"
              icon={<QrcodeOutlined />}
              loading={qrMutation.isPending}
              onClick={() => qrMutation.mutate(row.id)}
            />
          </Tooltip>
          <Popconfirm
            title="删除该下载项？"
            onConfirm={() => deleteMutation.mutate(row.id)}
            disabled={!canWrite}
          >
            <Tooltip title="删除">
              <Button
                danger
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                disabled={!canWrite}
              />
            </Tooltip>
          </Popconfirm>
        </div>
      ),
    },
  ];

  const mode = Form.useWatch("mode", form);
  const platformCards = (["ANDROID", "IOS", "HARMONY"] as const).map(
    (platform) => ({
      platform,
      item: data.find((item) => item.platform === platform && item.enabled),
    }),
  );
  const actions = (
    <>
      {canWrite && (
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建下载项
        </Button>
      )}
      {canPublish && (
        <Button
          icon={<CloudUploadOutlined />}
          loading={publishMutation.isPending}
          onClick={() => publishMutation.mutate()}
        >
          发布下载配置
        </Button>
      )}
    </>
  );

  return (
    <div className="settings-page">
      <SettingsHeader
        title="应用下载管理"
        description="维护各平台和渠道的下载入口，可上传 APK 或指向应用商店，发布前不会影响前端。"
        actions={actions}
      />
      <PublishStatusBar />
      <div className="download-platform-grid">
        {platformCards.map(({ platform, item }) => (
          <div className="download-platform-card" key={platform}>
            <span>{platformLabel[platform]}</span>
            <strong>
              {item?.versionName
                ? `v${item.versionName}`
                : platform === "IOS"
                  ? "敬请期待"
                  : "未配置"}
            </strong>
            <b className={item ? "active" : ""}>
              {item
                ? `已启用 · ${item.mode === "UPLOAD" ? "APK 直链" : "商店外链"}`
                : "暂无启用渠道"}
            </b>
            <small>
              {item
                ? `${item.channel} · ${item.downloadUrl ?? "待补充链接"}`
                : "新建下载项后发布"}
            </small>
          </div>
        ))}
      </div>
      <section className="settings-panel settings-table-panel">
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={data}
          pagination={false}
          onRow={(row) => ({
            draggable: canWrite,
            onDragStart: () => setDraggedId(row.id),
            onDragOver: (event) => event.preventDefault(),
            onDrop: () => moveBefore(row.id),
            className: draggedId === row.id ? "settings-row-dragging" : "",
          })}
        />
        <div className="settings-table-footer">共 {data.length} 条</div>
      </section>
      <section className="settings-rule-note">
        <strong>兜底策略</strong>
        <span>
          未匹配渠道时自动回落到
          official；全部渠道停用时，前端下载按钮显示“敬请期待”。
        </span>
      </section>
      <Modal
        title={editing ? "编辑下载项" : "新建下载项"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => saveMutation.mutate(values)}
        >
          <div className="settings-form-grid">
            <Form.Item
              name="platform"
              label="平台"
              rules={[{ required: true }]}
            >
              <Select
                options={Object.entries(platformLabel).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
            </Form.Item>
            <Form.Item name="channel" label="渠道" rules={[{ required: true }]}>
              <Input placeholder="official" />
            </Form.Item>
            <Form.Item name="versionName" label="版本名称">
              <Input placeholder="1.3.0" />
            </Form.Item>
            <Form.Item name="minVersion" label="最低版本码">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </div>
          <Form.Item name="mode" label="下载方式" rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: "外部链接", value: "URL" },
                { label: "上传 APK", value: "UPLOAD" },
              ]}
            />
          </Form.Item>
          {mode === "UPLOAD" ? (
            <Form.Item
              name="fileId"
              label="APK 文件"
              rules={[{ required: true, message: "请上传 APK" }]}
            >
              <FileUpload bizType="APK" accept=".apk" />
            </Form.Item>
          ) : (
            <Form.Item
              name="url"
              label="下载链接"
              rules={[{ required: true }, { type: "url" }]}
            >
              <Input placeholder="https://" />
            </Form.Item>
          )}
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="下载二维码"
        open={!!qr}
        footer={null}
        onCancel={() => setQr(null)}
      >
        <div className="settings-qr-preview">
          {qr && (
            <>
              <QRCode
                value={new URL(qr.target, window.location.origin).href}
                size={240}
                bordered={false}
              />
              <span>{new URL(qr.target, window.location.origin).href}</span>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

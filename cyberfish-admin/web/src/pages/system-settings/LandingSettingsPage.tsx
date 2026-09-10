import { useEffect, useState } from "react";
import {
  Button,
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
  EyeOutlined,
  HolderOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLandingModule,
  deleteLandingModule,
  listLandingModules,
  publishSettings,
  reorderLandingModules,
  updateLandingModule,
  type LandingModule,
  type ModuleType,
} from "../../api/systemSettings";
import { notifyError } from "../../api/client";
import { useAuth } from "../../store/auth";
import { PublishStatusBar, SettingsHeader, UploadTile } from "./SettingsShared";

const moduleLabels: Record<ModuleType, string> = {
  HERO: "Hero 主视觉",
  FEATURE_GRID: "核心功能模块",
  SCENE_STATS: "使用场景与数据条",
  TESTIMONIAL: "用户口碑",
  FAQ: "常见问题",
  CTA: "下载 CTA",
  FOOTER: "页脚",
  CUSTOM: "自定义模块",
};
const moduleOptions = (Object.keys(moduleLabels) as ModuleType[])
  .filter((type) => type !== "CUSTOM")
  .map((value) => ({ value, label: moduleLabels[value] }));

function defaultContent(type: ModuleType): Record<string, any> {
  if (type === "HERO")
    return {
      eyebrow: "端侧 AI · 漂相识别",
      h1: "看得懂鱼漂，才懂什么时候提竿",
      sub: "",
      primaryCta: { label: "免费下载", href: "#download" },
      trustLine: "",
    };
  if (type === "FEATURE_GRID")
    return { sectionTitle: "核心功能模块", sectionSub: "", items: [] };
  if (type === "SCENE_STATS")
    return {
      sectionTitle: "一套系统，四种钓场",
      sectionSub: "",
      stats: [],
      scenes: [],
    };
  if (type === "TESTIMONIAL")
    return { sectionTitle: "钓友们怎么说", sectionSub: "", items: [] };
  if (type === "FAQ")
    return { sectionTitle: "常见问题", sectionSub: "", items: [] };
  if (type === "CTA")
    return {
      title: "下一次出钓，让鱼漂自己说话",
      sub: "",
      primary: { label: "Android 版下载", href: "#download" },
    };
  if (type === "FOOTER") return { brandText: "", copyright: "", icp: "" };
  return {};
}

export function LandingSettingsPage() {
  const [form] = Form.useForm<{ content: Record<string, any> }>();
  const [newForm] = Form.useForm<{ type: ModuleType }>();
  const queryClient = useQueryClient();
  const { hasPerm } = useAuth();
  const canWrite = hasPerm("siteConfig:write");
  const canPublish = hasPerm("siteConfig:publish");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "landing-modules"],
    queryFn: listLandingModules,
  });
  const selected = data.find((item) => item.id === selectedId) ?? data[0];
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "landing-modules"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "config-version"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "config-changes"] }),
    ]);
  const saveMutation = useMutation({
    mutationFn: (content: Record<string, any>) =>
      updateLandingModule(selected!.id, { content }),
    onSuccess: async () => {
      message.success("模块草稿已保存");
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
      values: Partial<LandingModule>;
    }) => updateLandingModule(id, values),
    onSuccess: refresh,
    onError: notifyError,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteLandingModule,
    onSuccess: async () => {
      setSelectedId(null);
      message.success("模块已删除");
      await refresh();
    },
    onError: notifyError,
  });
  const reorderMutation = useMutation({
    mutationFn: reorderLandingModules,
    onSuccess: refresh,
    onError: notifyError,
  });
  const addMutation = useMutation({
    mutationFn: ({ type }: { type: ModuleType }) =>
      createLandingModule({
        type,
        enabled: true,
        sortOrder: Math.max(-10, ...data.map((item) => item.sortOrder)) + 10,
        content: defaultContent(type),
      }),
    onSuccess: async (item) => {
      setAddOpen(false);
      setSelectedId(item.id);
      message.success("模块已加入草稿");
      await refresh();
    },
    onError: notifyError,
  });
  const publishMutation = useMutation({
    mutationFn: () =>
      publishSettings({ scopes: ["LANDING"], note: "发布落地页内容编排" }),
    onSuccess: async (revision) => {
      message.success(`配置 v${revision.version} 已发布`);
      await refresh();
    },
    onError: notifyError,
  });

  useEffect(() => {
    if (!selectedId && data[0]) setSelectedId(data[0].id);
  }, [data, selectedId]);
  useEffect(() => {
    if (selected) {
      form.resetFields();
      form.setFieldsValue({ content: selected.content });
    }
  }, [form, selected]);

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
  const actions = (
    <>
      {canWrite && (
        <Button
          icon={<PlusOutlined />}
          onClick={() => {
            newForm.setFieldsValue({ type: "HERO" });
            setAddOpen(true);
          }}
        >
          新增模块
        </Button>
      )}
      <Button icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)}>
        预览草稿
      </Button>
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
        title="落地页内容编排"
        description="左侧调整模块顺序与启停，右侧编辑当前模块；保存进入草稿，发布后官网按快照顺序渲染。"
        actions={actions}
      />
      <PublishStatusBar />
      <div className="landing-editor-layout">
        <section
          className="settings-panel settings-module-list"
          aria-busy={isLoading}
        >
          {data.map((item) => (
            <div
              key={item.id}
              className={`settings-module-row ${selected?.id === item.id ? "active" : ""} ${draggedId === item.id ? "dragging" : ""}`}
              draggable={canWrite}
              onDragStart={() => setDraggedId(item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => moveBefore(item.id)}
              onClick={() => setSelectedId(item.id)}
            >
              <HolderOutlined className="drag-handle" />
              <strong>{moduleLabels[item.type]}</strong>
              <Tag>{item.type}</Tag>
              {item.hasDraft && <Tag color="cyan">草稿</Tag>}
              <Switch
                size="small"
                checked={item.enabled}
                disabled={!canWrite}
                onClick={(_, event) => event.stopPropagation()}
                onChange={(enabled) =>
                  updateMutation.mutate({ id: item.id, values: { enabled } })
                }
              />
            </div>
          ))}
          {!isLoading && data.length === 0 && (
            <div className="settings-empty">暂无模块</div>
          )}
          <span className="settings-list-hint">
            拖拽调整顺序，开关状态在发布后生效
          </span>
        </section>
        <section className="settings-panel settings-module-editor">
          {selected ? (
            <>
              <div className="settings-section-title">
                <div>
                  <h2>{moduleLabels[selected.type]} · 模块配置</h2>
                  <span>字段随模块类型变化，保存后进入草稿</span>
                </div>
                <Popconfirm
                  title="删除当前模块？"
                  onConfirm={() => deleteMutation.mutate(selected.id)}
                  disabled={!canWrite}
                >
                  <Tooltip title="删除模块">
                    <Button
                      danger
                      type="text"
                      icon={<DeleteOutlined />}
                      disabled={!canWrite}
                    />
                  </Tooltip>
                </Popconfirm>
              </div>
              <Form
                form={form}
                layout="vertical"
                disabled={!canWrite}
                onFinish={(values) => saveMutation.mutate(values.content)}
              >
                {renderModuleFields(selected.type)}
                <div className="settings-editor-actions">
                  <Button
                    onClick={() =>
                      form.setFieldsValue({ content: selected.content })
                    }
                  >
                    放弃修改
                  </Button>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SaveOutlined />}
                    loading={saveMutation.isPending}
                  >
                    保存为草稿
                  </Button>
                </div>
              </Form>
            </>
          ) : (
            <div className="settings-empty">请选择模块</div>
          )}
        </section>
      </div>
      <Modal
        title="新增落地页模块"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => newForm.submit()}
        confirmLoading={addMutation.isPending}
      >
        <Form
          form={newForm}
          layout="vertical"
          onFinish={(values) => addMutation.mutate(values)}
        >
          <Form.Item name="type" label="模块类型" rules={[{ required: true }]}>
            <Select options={moduleOptions} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="落地页草稿预览"
        open={previewOpen}
        footer={null}
        onCancel={() => setPreviewOpen(false)}
        width={860}
      >
        <div className="landing-draft-preview">
          {data
            .filter((item) => item.enabled)
            .map((item) => (
              <div key={item.id}>
                <Tag>{item.type}</Tag>
                <strong>
                  {item.content.h1 ??
                    item.content.sectionTitle ??
                    item.content.title ??
                    moduleLabels[item.type]}
                </strong>
                <p>
                  {item.content.sub ??
                    item.content.sectionSub ??
                    item.content.brandText ??
                    ""}
                </p>
              </div>
            ))}
        </div>
      </Modal>
    </div>
  );
}

function renderModuleFields(type: ModuleType) {
  if (type === "HERO")
    return (
      <>
        <Form.Item name={["content", "eyebrow"]} label="Eyebrow 微标文字">
          <Input maxLength={40} />
        </Form.Item>
        <Form.Item
          name={["content", "h1"]}
          label="主标题 H1"
          rules={[{ required: true }]}
        >
          <Input maxLength={60} />
        </Form.Item>
        <Form.Item name={["content", "sub"]} label="副标题">
          <Input.TextArea rows={3} maxLength={200} />
        </Form.Item>
        <div className="settings-form-grid">
          <Form.Item
            name={["content", "primaryCta", "label"]}
            label="主按钮文案"
            rules={[{ required: true }]}
          >
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item
            name={["content", "primaryCta", "href"]}
            label="主按钮链接"
            rules={[{ required: true }]}
          >
            <Input maxLength={200} />
          </Form.Item>
        </div>
        <Form.Item name={["content", "deviceImageFileId"]} label="右侧样机图">
          <UploadTile hint="建议 720 × 1280 · App 识别页截图" />
        </Form.Item>
        <Form.Item name={["content", "trustLine"]} label="信任文案">
          <Input maxLength={120} />
        </Form.Item>
      </>
    );
  if (type === "CTA")
    return (
      <>
        <Form.Item
          name={["content", "title"]}
          label="标题"
          rules={[{ required: true }]}
        >
          <Input maxLength={60} />
        </Form.Item>
        <Form.Item name={["content", "sub"]} label="副标题">
          <Input.TextArea rows={3} maxLength={200} />
        </Form.Item>
        <div className="settings-form-grid">
          <Form.Item
            name={["content", "primary", "label"]}
            label="按钮文案"
            rules={[{ required: true }]}
          >
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item
            name={["content", "primary", "href"]}
            label="按钮链接"
            rules={[{ required: true }]}
          >
            <Input maxLength={200} />
          </Form.Item>
        </div>
      </>
    );
  if (type === "FOOTER")
    return (
      <>
        <Form.Item name={["content", "brandText"]} label="品牌说明">
          <Input.TextArea rows={3} maxLength={120} />
        </Form.Item>
        <Form.Item name={["content", "copyright"]} label="版权文字">
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name={["content", "icp"]} label="备案信息">
          <Input maxLength={80} />
        </Form.Item>
      </>
    );
  return (
    <>
      <Form.Item
        name={["content", "sectionTitle"]}
        label="模块标题"
        rules={[{ required: true }]}
      >
        <Input maxLength={40} />
      </Form.Item>
      <Form.Item name={["content", "sectionSub"]} label="模块说明">
        <Input.TextArea rows={2} maxLength={120} />
      </Form.Item>
      {type === "SCENE_STATS" && <SimpleList name="stats" kind="stats" />}
      {type === "SCENE_STATS" && <SimpleList name="scenes" kind="items" />}
      {type === "FEATURE_GRID" && <SimpleList name="items" kind="items" />}
      {type === "TESTIMONIAL" && <SimpleList name="items" kind="quotes" />}
      {type === "FAQ" && <SimpleList name="items" kind="faq" />}
    </>
  );
}

function SimpleList({
  name,
  kind,
}: {
  name: string;
  kind: "items" | "stats" | "quotes" | "faq";
}) {
  return (
    <Form.List name={["content", name]}>
      {(fields, { add, remove }) => (
        <div className="settings-form-list">
          <div className="settings-section-title">
            <h3>
              {kind === "stats"
                ? "数据项"
                : kind === "faq"
                  ? "问答项"
                  : kind === "quotes"
                    ? "口碑项"
                    : "内容项"}
            </h3>
            <Button size="small" icon={<PlusOutlined />} onClick={() => add()}>
              添加
            </Button>
          </div>
          {fields.map((field) => (
            <div className="settings-form-list-row" key={field.key}>
              {kind === "stats" && (
                <>
                  <Form.Item
                    {...field}
                    name={[field.name, "value"]}
                    label="数值"
                    rules={[{ required: true }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, "label"]}
                    label="说明"
                    rules={[{ required: true }]}
                  >
                    <Input />
                  </Form.Item>
                </>
              )}
              {kind === "items" && (
                <>
                  <Form.Item
                    {...field}
                    name={[field.name, "title"]}
                    label="标题"
                    rules={[{ required: true }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, "desc"]}
                    label="说明"
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, "icon"]}
                    label="图标标识"
                  >
                    <Input />
                  </Form.Item>
                </>
              )}
              {kind === "quotes" && (
                <>
                  <Form.Item
                    {...field}
                    name={[field.name, "quote"]}
                    label="口碑内容"
                    rules={[{ required: true }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, "name"]}
                    label="用户"
                    rules={[{ required: true }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, "meta"]}
                    label="身份"
                  >
                    <Input />
                  </Form.Item>
                </>
              )}
              {kind === "faq" && (
                <>
                  <Form.Item
                    {...field}
                    name={[field.name, "question"]}
                    label="问题"
                    rules={[{ required: true }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, "answer"]}
                    label="回答"
                    rules={[{ required: true }]}
                  >
                    <Input.TextArea rows={2} />
                  </Form.Item>
                </>
              )}
              <Button
                type="text"
                danger
                icon={<MinusCircleOutlined />}
                onClick={() => remove(field.name)}
              />
            </div>
          ))}
        </div>
      )}
    </Form.List>
  );
}

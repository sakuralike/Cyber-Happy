import { useMemo, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Input,
  Select,
  Form,
  Modal,
  InputNumber,
  message,
  Popconfirm,
  Tabs,
  Typography,
  Drawer,
  Descriptions,
  Progress,
  Tag,
} from 'antd';
import { PlusOutlined, ReloadOutlined, CloudDownloadOutlined, RollbackOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import * as modelApi from '../api/model';
import type { MlModel, ModelDispatch, DeviceDispatchLog, DispatchTargetType } from '../api/types';
import { FileUpload } from '../components/FileUpload';
import { EnumTag } from '../components/EnumTag';
import {
  MODEL_STATUS_MAP,
  QUANT_MAP,
  FRAMEWORK_MAP,
  DISPATCH_TARGET_MAP,
  DISPATCH_STATUS_MAP,
  DEVICE_DISPATCH_STATUS_MAP,
  enumOptions,
} from '../utils/constants';
import { formatDateTime, formatSize, formatNumber } from '../utils/format';
import { notifyError } from '../api/client';
import { useAuth } from '../store/auth';

export function ModelPage() {
  const { hasPerm } = useAuth();
  const [tab, setTab] = useState('models');
  const qc = useQueryClient();
  const [params, setParams] = useState<Record<string, unknown>>({ page: 1, pageSize: 10 });
  const [dispParams, setDispParams] = useState<Record<string, unknown>>({ page: 1, pageSize: 10 });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MlModel | null>(null);
  const [dispatchTarget, setDispatchTarget] = useState<MlModel | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<MlModel | null>(null);
  const [deviceDrawer, setDeviceDrawer] = useState<ModelDispatch | null>(null);
  const [form] = Form.useForm();
  const [dispatchForm] = Form.useForm();
  const [rollbackForm] = Form.useForm();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['models', params],
    queryFn: () => modelApi.listModels(params),
    enabled: tab === 'models',
  });
  const { data: dispData, isLoading: dispLoading } = useQuery({
    queryKey: ['dispatches', dispParams],
    queryFn: () => modelApi.listDispatches(dispParams),
    enabled: tab === 'dispatches',
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['models'] });
    qc.invalidateQueries({ queryKey: ['dispatches'] });
  };

  const createMut = useMutation({
    mutationFn: (v: modelApi.CreateModelInput) => modelApi.createModel(v),
    onSuccess: () => {
      message.success('创建成功');
      setModalOpen(false);
      invalidate();
    },
    onError: notifyError,
  });
  const updateMut = useMutation({
    mutationFn: ({ id, v }: { id: string; v: Partial<modelApi.CreateModelInput> }) => modelApi.updateModel(id, v),
    onSuccess: () => {
      message.success('保存成功');
      setModalOpen(false);
      invalidate();
    },
    onError: notifyError,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => modelApi.deleteModel(id),
    onSuccess: () => {
      message.success('已删除');
      invalidate();
    },
    onError: notifyError,
  });
  const dispatchMut = useMutation({
    mutationFn: ({ id, v }: { id: string; v: modelApi.DispatchInput }) => modelApi.dispatchModel(id, v),
    onSuccess: (d) => {
      message.success(`下发单已创建，命中 ${d.matchedDevices ?? d.totalDevices} 台设备`);
      setDispatchTarget(null);
      invalidate();
    },
    onError: notifyError,
  });
  const rollbackMut = useMutation({
    mutationFn: ({ id, v }: { id: string; v: { toModelId: string; reason: string; scope?: 'ALL' | 'FAILED_ONLY' } }) =>
      modelApi.rollbackModel(id, v),
    onSuccess: () => {
      message.success('回滚成功');
      setRollbackTarget(null);
      invalidate();
    },
    onError: notifyError,
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ arch: 'YOLO26n', quant: 'W8A32', framework: 'LiteRT', inputSize: 640, numClasses: 1, labels: ['鱼漂'] });
    setModalOpen(true);
  };
  const openEdit = (row: MlModel) => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue({
      modelVersion: row.modelVersion,
      name: row.name,
      arch: row.arch,
      quant: row.quant,
      framework: row.framework,
      inputSize: row.inputSize,
      numClasses: row.numClasses,
      labels: row.labels,
      map50: row.map50,
      map50_95: row.map50_95,
      precision: row.precision,
      recall: row.recall,
      avgLatencyMs: row.avgLatencyMs,
      minAppCode: row.minAppCode ?? undefined,
      maxAppCode: row.maxAppCode ?? undefined,
      remark: row.remark ?? undefined,
      signature: row.signature ?? undefined,
      signatureAlgorithm: row.signatureAlgorithm ?? undefined,
      publicKeyId: row.publicKeyId ?? undefined,
      signatureExpiresAt: row.signatureExpiresAt ?? undefined,
      runtimeSignatureName: row.runtimeSignatureName ?? undefined,
      inputName: row.inputName ?? undefined,
      inputLayout: row.inputLayout,
      outputName: row.outputName ?? undefined,
      coordinatesNormalized: row.coordinatesNormalized,
      valuesPerDetection: row.valuesPerDetection,
    });
    setModalOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    if (editing) {
      const { modelVersion: _ignore, ...rest } = v;
      updateMut.mutate({ id: editing.id, v: rest });
    } else {
      createMut.mutate(v);
    }
  };

  const openDispatch = (row: MlModel) => {
    setDispatchTarget(row);
    dispatchForm.resetFields();
    dispatchForm.setFieldsValue({ targetType: 'GLOBAL', grayPercent: 100 });
  };

  const submitDispatch = async () => {
    if (!dispatchTarget) return;
    const v = await dispatchForm.validateFields();
    const { targetType, grayPercent, remark, appCodes, groups, deviceIds } = v;
    let targetValue: Record<string, unknown> = {};
    if (targetType === 'APP_VERSION') targetValue = { appCodes };
    else if (targetType === 'DEVICE_GROUP') targetValue = { groups };
    else if (targetType === 'DEVICE_ID')
      targetValue = {
        deviceIds: String(deviceIds ?? '')
          .split(/[\n,]/)
          .map((s: string) => s.trim())
          .filter(Boolean),
      };
    dispatchMut.mutate({ id: dispatchTarget.id, v: { targetType, targetValue, grayPercent, remark } });
  };

  const openRollback = (row: MlModel) => {
    setRollbackTarget(row);
    rollbackForm.resetFields();
    rollbackForm.setFieldsValue({ scope: 'ALL' });
  };

  const modelColumns: ColumnsType<MlModel> = useMemo(
    () => [
      {
        title: '模型版本',
        key: 'modelVersion',
        render: (_, r) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{r.modelVersion}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.name}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: '架构',
        key: 'arch',
        width: 120,
        render: (_, r) => (
          <Space size={4} wrap>
            <Tag>{r.arch}</Tag>
            <EnumTag value={r.quant} map={QUANT_MAP} />
          </Space>
        ),
      },
      { title: '框架', dataIndex: 'framework', width: 90, render: (v) => <EnumTag value={v} map={FRAMEWORK_MAP} /> },
      { title: '状态', dataIndex: 'status', width: 100, render: (v) => <EnumTag value={v} map={MODEL_STATUS_MAP} /> },
      {
        title: 'mAP@50',
        dataIndex: 'map50',
        width: 90,
        sorter: true,
        render: (v: number) => (v ? v.toFixed(3) : '-'),
      },
      { title: '平均延迟', dataIndex: 'avgLatencyMs', width: 100, render: (v) => (v ? `${v} ms` : '-') },
      { title: '文件大小', dataIndex: 'fileSize', width: 100, render: (v) => formatSize(v) },
      {
        title: '适配版本',
        key: 'appRange',
        width: 130,
        render: (_, r) => `${r.minAppCode ?? '-'} ~ ${r.maxAppCode ?? '∞'}`,
      },
      { title: '创建时间', dataIndex: 'createdAt', width: 160, render: (v) => formatDateTime(v) },
      {
        title: '操作',
        key: 'actions',
        width: 260,
        fixed: 'right',
        render: (_, r) => (
          <Space>
            {hasPerm('model:write') && <Button size="small" disabled={r.status === 'ONLINE'} onClick={() => openEdit(r)}>
              编辑
            </Button>}
            {hasPerm('model:dispatch') && <Button
              size="small"
              type="primary"
              ghost
              icon={<CloudDownloadOutlined />}
              disabled={!r.fileUrl}
              onClick={() => openDispatch(r)}
            >
              下发
            </Button>}
            {hasPerm('model:rollback') && <Button
              size="small"
              icon={<RollbackOutlined />}
              disabled={!['ONLINE', 'GRAY'].includes(r.status)}
              onClick={() => openRollback(r)}
            >
              回滚
            </Button>}
            {hasPerm('model:write') && r.status === 'DRAFT' && (
              <Popconfirm title="确认删除该草稿？" onConfirm={() => deleteMut.mutate(r.id)}>
                <Button size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        ),
      },
    ],
    [hasPerm],
  );

  const dispatchColumns: ColumnsType<ModelDispatch> = useMemo(
    () => [
      {
        title: '模型',
        dataIndex: ['model', 'modelVersion'],
        width: 180,
        render: (v, r) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{r.model?.modelVersion ?? '-'}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.model?.arch} {r.model?.quant}
            </Typography.Text>
          </Space>
        ),
      },
      { title: '目标', dataIndex: 'targetType', width: 130, render: (v) => <EnumTag value={v} map={DISPATCH_TARGET_MAP} /> },
      {
        title: '灰度',
        dataIndex: 'grayPercent',
        width: 80,
        render: (v) => (v >= 100 ? '全量' : `${v}%`),
      },
      { title: '状态', dataIndex: 'status', width: 100, render: (v) => <EnumTag value={v} map={DISPATCH_STATUS_MAP} /> },
      {
        title: '进度',
        key: 'progress',
        width: 200,
        render: (_, r) => {
          const pct = r.totalDevices > 0 ? Math.round(((r.successDevices + r.failedDevices) / r.totalDevices) * 100) : 0;
          return (
            <Space direction="vertical" size={0} style={{ width: 160 }}>
              <Progress percent={pct} size="small" />
              <Typography.Text style={{ fontSize: 12 }} type="secondary">
                成功 {r.successDevices} / 失败 {r.failedDevices} / 共 {r.totalDevices}
              </Typography.Text>
            </Space>
          );
        },
      },
      { title: '备注', dataIndex: 'remark', ellipsis: true, render: (v) => v || '-' },
      { title: '创建时间', dataIndex: 'createdAt', width: 160, render: (v) => formatDateTime(v) },
      {
        title: '操作',
        key: 'actions',
        width: 150,
        fixed: 'right',
        render: (_, r) => (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => setDeviceDrawer(r)}>
              设备明细
            </Button>
            {['FAILED', 'PARTIAL'].includes(r.status) && (
              <Button size="small" onClick={() => retryMut.mutate(r.id)}>
                重试
              </Button>
            )}
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const retryMut = useMutation({
    mutationFn: (id: string) => modelApi.retryDispatch(id),
    onSuccess: (d) => {
      message.success(`已重试 ${d.retried} 台失败设备`);
      invalidate();
    },
    onError: notifyError,
  });

  return (
    <Card title="YOLO 模型管理">
      <Tabs
        activeKey={tab}
        onChange={setTab}
        tabBarExtraContent={
          tab === 'models' ? (
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
              {hasPerm('model:write') && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                新建模型
              </Button>}
            </Space>
          ) : undefined
        }
        items={[
          {
            key: 'models',
            label: '模型列表',
            children: (
              <>
                <Space style={{ marginBottom: 16 }} wrap>
                  <Input.Search
                    placeholder="搜索模型版本 / 名称 / 架构"
                    allowClear
                    style={{ width: 260 }}
                    onSearch={(v) => setParams((p) => ({ ...p, page: 1, keyword: v || undefined }))}
                  />
                  <Select
                    allowClear
                    placeholder="状态"
                    style={{ width: 130 }}
                    options={enumOptions(MODEL_STATUS_MAP)}
                    onChange={(v) => setParams((p) => ({ ...p, page: 1, status: v }))}
                  />
                  <Select
                    allowClear
                    placeholder="量化"
                    style={{ width: 120 }}
                    options={enumOptions(QUANT_MAP)}
                    onChange={(v) => setParams((p) => ({ ...p, page: 1, quant: v }))}
                  />
                </Space>
                <Table
                  rowKey="id"
                  loading={isLoading}
                  columns={modelColumns}
                  dataSource={data?.list ?? []}
                  scroll={{ x: 1200 }}
                  pagination={{
                    current: data?.pagination.page ?? 1,
                    pageSize: data?.pagination.pageSize ?? 10,
                    total: data?.pagination.total ?? 0,
                    showSizeChanger: true,
                    showTotal: (t) => `共 ${t} 条`,
                    onChange: (page, pageSize) => setParams((p) => ({ ...p, page, pageSize })),
                  }}
                />
              </>
            ),
          },
          {
            key: 'dispatches',
            label: '下发记录',
            children: (
              <>
                <Space style={{ marginBottom: 16 }} wrap>
                  <Select
                    allowClear
                    placeholder="下发状态"
                    style={{ width: 140 }}
                    options={enumOptions(DISPATCH_STATUS_MAP)}
                    onChange={(v) => setDispParams((p) => ({ ...p, page: 1, status: v }))}
                  />
                  <Select
                    allowClear
                    placeholder="目标类型"
                    style={{ width: 150 }}
                    options={enumOptions(DISPATCH_TARGET_MAP)}
                    onChange={(v) => setDispParams((p) => ({ ...p, page: 1, targetType: v }))}
                  />
                </Space>
                <Table
                  rowKey="id"
                  loading={dispLoading}
                  columns={dispatchColumns}
                  dataSource={dispData?.list ?? []}
                  scroll={{ x: 1100 }}
                  pagination={{
                    current: dispData?.pagination.page ?? 1,
                    pageSize: dispData?.pagination.pageSize ?? 10,
                    total: dispData?.pagination.total ?? 0,
                    showSizeChanger: true,
                    showTotal: (t) => `共 ${t} 条`,
                    onChange: (page, pageSize) => setDispParams((p) => ({ ...p, page, pageSize })),
                  }}
                />
              </>
            ),
          },
        ]}
      />

      {/* 新建/编辑模型 */}
      <Modal
        title={editing ? `编辑 ${editing.modelVersion}` : '新建模型'}
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={createMut.isPending || updateMut.isPending}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="modelVersion" label="模型版本" rules={[{ required: true, message: '请输入' }]} style={{ flex: 1 }}>
              <Input placeholder="yolo26n-w8a32-v4" disabled={!!editing} />
            </Form.Item>
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入' }]} style={{ flex: 1 }}>
              <Input placeholder="鱼漂识别 v4" />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="arch" label="架构" style={{ flex: 1 }}>
              <Input placeholder="YOLO26n" />
            </Form.Item>
            <Form.Item name="quant" label="量化" style={{ flex: 1 }}>
              <Select options={enumOptions(QUANT_MAP)} />
            </Form.Item>
            <Form.Item name="framework" label="框架" style={{ flex: 1 }}>
              <Select options={enumOptions(FRAMEWORK_MAP)} />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="inputSize" label="输入尺寸" style={{ flex: 1 }}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="numClasses" label="类别数" style={{ flex: 1 }}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="avgLatencyMs" label="平均延迟(ms)" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="map50" label="mAP@50" style={{ flex: 1 }}>
              <InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="map50_95" label="mAP@50:95" style={{ flex: 1 }}>
              <InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="precision" label="Precision" style={{ flex: 1 }}>
              <InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="recall" label="Recall" style={{ flex: 1 }}>
              <InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="minAppCode" label="适配最低版本 Code" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="maxAppCode" label="适配最高版本 Code" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="labels" label="标签">
            <Select mode="tags" placeholder="输入后回车" />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="signatureAlgorithm" label="签名算法" style={{ flex: 1 }}>
              <Input placeholder="ECDSA_P256_SHA256" />
            </Form.Item>
            <Form.Item name="publicKeyId" label="公钥标识" style={{ flex: 1 }}>
              <Input placeholder="model-key-1" />
            </Form.Item>
          </Space>
          <Form.Item name="signature" label="模型签名（Base64）">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="signatureExpiresAt" label="签名有效期（ISO 8601）">
            <Input placeholder="2027-01-01T00:00:00.000Z" />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="runtimeSignatureName" label="运行时签名名称" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="inputLayout" label="输入布局" style={{ flex: 1 }}>
              <Select options={[{ value: 'NCHW', label: 'NCHW' }, { value: 'NHWC', label: 'NHWC' }]} />
            </Form.Item>
            <Form.Item name="valuesPerDetection" label="每检测项列数" style={{ flex: 1 }}>
              <InputNumber min={6} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
          <Form.Item name="fileId" label="模型文件（LiteRT .tflite / .onnx）">
            <FileUpload
              bizType="MODEL"
              accept=".tflite,.onnx,.bin,.param"
              value={editing?.fileId ?? undefined}
              onChange={(id) => form.setFieldsValue({ fileId: id })}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 下发 */}
      <Modal
        title={`下发模型 ${dispatchTarget?.modelVersion ?? ''}`}
        open={!!dispatchTarget}
        onOk={submitDispatch}
        onCancel={() => setDispatchTarget(null)}
        confirmLoading={dispatchMut.isPending}
        width={520}
        destroyOnClose
      >
        <Form form={dispatchForm} layout="vertical">
          <Form.Item name="targetType" label="下发目标" rules={[{ required: true }]}>
            <Select options={enumOptions(DISPATCH_TARGET_MAP)} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.targetType !== b.targetType}>
            {({ getFieldValue }) => {
              const t = getFieldValue('targetType') as DispatchTargetType;
              if (t === 'APP_VERSION')
                return (
                  <Form.Item name="appCodes" label="APP 版本 Code（多选）">
                    <Select
                      mode="multiple"
                      options={[100, 110, 120, 130].map((c) => ({ value: c, label: `v1.${c % 10}.0 (${c})` }))}
                    />
                  </Form.Item>
                );
              if (t === 'DEVICE_GROUP')
                return (
                  <Form.Item name="groups" label="设备分组（channel，多选）">
                    <Select mode="tags" placeholder="official / beta / vip" />
                  </Form.Item>
                );
              if (t === 'DEVICE_ID')
                return (
                  <Form.Item name="deviceIds" label="设备 ID 白名单（每行一个）">
                    <Input.TextArea rows={4} placeholder="DEV00001" />
                  </Form.Item>
                );
              return null;
            }}
          </Form.Item>
          <Form.Item name="grayPercent" label="灰度比例（%）" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 回滚 */}
      <Modal
        title={`回滚 ${rollbackTarget?.modelVersion ?? ''}`}
        open={!!rollbackTarget}
        onOk={() => {
          rollbackForm.validateFields().then((v) => rollbackMut.mutate({ id: rollbackTarget!.id, v }));
        }}
        onCancel={() => setRollbackTarget(null)}
        confirmLoading={rollbackMut.isPending}
        width={480}
        destroyOnClose
      >
        <Form form={rollbackForm} layout="vertical">
          <Form.Item name="toModelId" label="回滚目标模型" rules={[{ required: true, message: '请选择' }]}>
            <Select
              placeholder="选择要回滚到的旧模型"
              options={(data?.list ?? [])
                .filter((m) => m.id !== rollbackTarget?.id)
                .map((m) => ({ value: m.id, label: `${m.modelVersion}（${m.name}）` }))}
            />
          </Form.Item>
          <Form.Item name="scope" label="回滚范围">
            <Select
              options={[
                { value: 'ALL', label: '全部设备' },
                { value: 'FAILED_ONLY', label: '仅失败设备' },
              ]}
            />
          </Form.Item>
          <Form.Item name="reason" label="回滚原因" rules={[{ required: true, message: '请填写回滚原因' }]}>
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 设备明细 */}
      <DeviceLogDrawer dispatch={deviceDrawer} onClose={() => setDeviceDrawer(null)} />
    </Card>
  );
}

function DeviceLogDrawer({ dispatch, onClose }: { dispatch: ModelDispatch | null; onClose: () => void }) {
  const [params, setParams] = useState<Record<string, unknown>>({ page: 1, pageSize: 10 });
  const { data, isLoading } = useQuery({
    queryKey: ['deviceLogs', dispatch?.id, params],
    queryFn: () => modelApi.listDeviceLogs(dispatch!.id, params),
    enabled: !!dispatch?.id,
  });

  const columns: ColumnsType<DeviceDispatchLog> = [
    { title: '设备 ID', dataIndex: 'deviceId' },
    { title: '原模型', dataIndex: 'fromModelVersion', render: (v) => v || '-' },
    { title: '目标模型', dataIndex: 'toModelVersion' },
    { title: '状态', dataIndex: 'status', render: (v) => <EnumTag value={v} map={DEVICE_DISPATCH_STATUS_MAP} /> },
    {
      title: '进度',
      dataIndex: 'progress',
      render: (v) => <Progress percent={v} size="small" style={{ width: 120 }} />,
    },
    { title: '错误信息', dataIndex: 'errorMessage', render: (v) => v || '-' },
    { title: '更新时间', dataIndex: 'updatedAt', width: 160, render: (v) => formatDateTime(v) },
  ];

  return (
    <Drawer
      title={`下发单 ${dispatch?.id ?? ''} · 设备明细`}
      open={!!dispatch}
      onClose={onClose}
      width={820}
    >
      {dispatch && (
        <Descriptions column={3} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="目标">
            <EnumTag value={dispatch.targetType} map={DISPATCH_TARGET_MAP} />
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <EnumTag value={dispatch.status} map={DISPATCH_STATUS_MAP} />
          </Descriptions.Item>
          <Descriptions.Item label="灰度">{dispatch.grayPercent >= 100 ? '全量' : `${dispatch.grayPercent}%`}</Descriptions.Item>
          <Descriptions.Item label="成功 / 失败 / 总数">
            {dispatch.successDevices} / {dispatch.failedDevices} / {dispatch.totalDevices}
          </Descriptions.Item>
        </Descriptions>
      )}
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        columns={columns}
        dataSource={data?.list ?? []}
        scroll={{ x: 760 }}
        pagination={{
          current: data?.pagination.page ?? 1,
          pageSize: data?.pagination.pageSize ?? 10,
          total: data?.pagination.total ?? 0,
          showSizeChanger: true,
          onChange: (page, pageSize) => setParams((p) => ({ ...p, page, pageSize })),
        }}
      />
    </Drawer>
  );
}

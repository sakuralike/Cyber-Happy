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
  Dropdown,
  Tag,
  Typography,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  DownOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import * as appVersionApi from '../api/appVersion';
import type { AppVersion, ReleaseStatus } from '../api/types';
import { FileUpload } from '../components/FileUpload';
import { EnumTag } from '../components/EnumTag';
import {
  RELEASE_STATUS_MAP,
  PLATFORM_MAP,
  UPDATE_TYPE_MAP,
  enumOptions,
} from '../utils/constants';
import { formatDateTime, formatSize, formatNumber } from '../utils/format';
import { notifyError } from '../api/client';
import { useAuth } from '../store/auth';

export function AppVersionPage() {
  const { hasPerm } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useState<Record<string, unknown>>({ page: 1, pageSize: 10 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AppVersion | null>(null);
  const [grayTarget, setGrayTarget] = useState<AppVersion | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['appVersions', params],
    queryFn: () => appVersionApi.listAppVersions(params),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['appVersions'] });
  const invalidateDash = () => qc.invalidateQueries({ queryKey: ['dash'] });

  const createMut = useMutation({
    mutationFn: (v: appVersionApi.CreateAppVersionInput) => appVersionApi.createAppVersion(v),
    onSuccess: () => {
      message.success('创建成功');
      setModalOpen(false);
      invalidate();
    },
    onError: notifyError,
  });
  const updateMut = useMutation({
    mutationFn: ({ id, v }: { id: string; v: Parameters<typeof appVersionApi.updateAppVersion>[1] }) =>
      appVersionApi.updateAppVersion(id, v),
    onSuccess: () => {
      message.success('保存成功');
      setModalOpen(false);
      invalidate();
    },
    onError: notifyError,
  });
  const actionMut = useMutation({
    mutationFn: ({ id, action, extra }: { id: string; action: appVersionApi.AppVersionAction; extra?: Record<string, unknown> }) =>
      appVersionApi.appVersionAction(id, action, extra as never),
    onSuccess: () => {
      message.success('操作成功');
      setGrayTarget(null);
      invalidate();
      invalidateDash();
    },
    onError: notifyError,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => appVersionApi.deleteAppVersion(id),
    onSuccess: () => {
      message.success('已删除');
      invalidate();
    },
    onError: notifyError,
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ platform: 'ANDROID', channel: 'official', updateType: 'OPTIONAL' });
    setModalOpen(true);
  };
  const openEdit = (row: AppVersion) => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue({
      versionName: row.versionName,
      versionCode: row.versionCode,
      platform: row.platform,
      channel: row.channel,
      updateType: row.updateType,
      releaseNotes: row.releaseNotes,
      minSupportedCode: row.minSupportedCode ?? undefined,
      apkFileId: row.apkFileId ?? undefined,
    });
    setModalOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    if (editing) {
      const { versionCode: _ignore, ...rest } = v;
      updateMut.mutate({ id: editing.id, v: rest });
    } else {
      createMut.mutate(v);
    }
  };

  const actionItems = (row: AppVersion) => {
    const items: { key: string; label: string; danger?: boolean }[] = [];
    if (!hasPerm('appVersion:publish')) return items;
    if (['DRAFT', 'GRAY', 'OFFLINE'].includes(row.status)) {
      items.push({ key: 'PUBLISH_GRAY', label: row.status === 'GRAY' ? '调整灰度比例' : '灰度发布' });
    }
    if (['DRAFT', 'GRAY', 'OFFLINE'].includes(row.status)) {
      items.push({ key: 'PUBLISH_ONLINE', label: '直接上架（全量）' });
    }
    if (row.status !== 'OFFLINE') {
      items.push({ key: 'OFFLINE', label: '下架', danger: true });
    }
    if (row.status !== 'DRAFT') {
      items.push({ key: 'ROLLBACK', label: '回滚', danger: true });
    }
    return items;
  };

  const onAction = (row: AppVersion, key: string) => {
    if (key === 'PUBLISH_GRAY') {
      setGrayTarget(row);
      return;
    }
    if (key === 'ROLLBACK' || key === 'OFFLINE' || key === 'PUBLISH_ONLINE') {
      Modal.confirm({
        title: `确认${key === 'PUBLISH_ONLINE' ? '上架' : key === 'OFFLINE' ? '下架' : '回滚'} v${row.versionName}？`,
        okText: '确认',
        cancelText: '取消',
        onOk: () => actionMut.mutate({ id: row.id, action: key as appVersionApi.AppVersionAction }),
      });
    }
  };

  const columns: ColumnsType<AppVersion> = useMemo(
    () => [
      {
        title: '版本',
        key: 'version',
        render: (_, r) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>v{r.versionName}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              code {r.versionCode}
            </Typography.Text>
          </Space>
        ),
      },
      { title: '平台', dataIndex: 'platform', width: 90, render: (v) => <EnumTag value={v} map={PLATFORM_MAP} /> },
      { title: '更新类型', dataIndex: 'updateType', width: 100, render: (v) => <EnumTag value={v} map={UPDATE_TYPE_MAP} /> },
      {
        title: '状态',
        dataIndex: 'status',
        width: 110,
        render: (v: ReleaseStatus, r) => (
          <Space direction="vertical" size={0}>
            <EnumTag value={v} map={RELEASE_STATUS_MAP} />
            {v === 'GRAY' && <Typography.Text style={{ fontSize: 12 }}>灰度 {r.grayPercent}%</Typography.Text>}
          </Space>
        ),
      },
      { title: '安装包', dataIndex: 'apkSize', width: 110, render: (v) => (v ? formatSize(v) : '-') },
      { title: '下载量', dataIndex: 'downloadCount', width: 90, render: (v) => formatNumber(v) },
      {
        title: '更新说明',
        dataIndex: 'releaseNotes',
        ellipsis: true,
        render: (v: string) => (
          <Tooltip title={v}>
            <span>{v || '-'}</span>
          </Tooltip>
        ),
      },
      { title: '创建时间', dataIndex: 'createdAt', width: 160, render: (v) => formatDateTime(v) },
      {
        title: '操作',
        key: 'actions',
        width: 220,
        fixed: 'right',
        render: (_, r) => (
          <Space>
            {hasPerm('appVersion:write') && <Button size="small" disabled={r.status === 'ONLINE'} onClick={() => openEdit(r)}>
              编辑
            </Button>}
            {hasPerm('appVersion:publish') && <Dropdown
              menu={{ items: actionItems(r), onClick: ({ key }) => onAction(r, key) }}
              disabled={actionItems(r).length === 0}
            >
              <Button size="small" type="primary" ghost>
                <ThunderboltOutlined /> 状态操作 <DownOutlined />
              </Button>
            </Dropdown>}
            {hasPerm('appVersion:delete') && r.status === 'DRAFT' && (
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

  return (
    <Card
      title="APP 版本管理"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
          {hasPerm('appVersion:write') && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建版本
          </Button>}
        </Space>
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索版本号 / 更新说明"
          allowClear
          style={{ width: 260 }}
          onSearch={(v) => setParams((p) => ({ ...p, page: 1, keyword: v || undefined }))}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 140 }}
          options={enumOptions(RELEASE_STATUS_MAP)}
          onChange={(v) => setParams((p) => ({ ...p, page: 1, status: v }))}
        />
        <Select
          allowClear
          placeholder="更新类型"
          style={{ width: 140 }}
          options={enumOptions(UPDATE_TYPE_MAP)}
          onChange={(v) => setParams((p) => ({ ...p, page: 1, updateType: v }))}
        />
        <Select
          allowClear
          placeholder="平台"
          style={{ width: 140 }}
          options={enumOptions(PLATFORM_MAP)}
          onChange={(v) => setParams((p) => ({ ...p, page: 1, platform: v }))}
        />
      </Space>

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.list ?? []}
        scroll={{ x: 1100 }}
        pagination={{
          current: data?.pagination.page ?? 1,
          pageSize: data?.pagination.pageSize ?? 10,
          total: data?.pagination.total ?? 0,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page, pageSize) => setParams((p) => ({ ...p, page, pageSize })),
        }}
      />

      {/* 新建/编辑 */}
      <Modal
        title={editing ? `编辑 v${editing.versionName}` : '新建 APP 版本'}
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={createMut.isPending || updateMut.isPending}
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="versionName" label="版本号" rules={[{ required: true, message: '请输入版本号' }]} style={{ flex: 1 }}>
              <Input placeholder="1.2.0" />
            </Form.Item>
            <Form.Item name="versionCode" label="版本 Code" rules={[{ required: true, message: '请输入' }]} style={{ flex: 1 }}>
              <InputNumber min={1} style={{ width: '100%' }} disabled={!!editing} />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="platform" label="平台" style={{ flex: 1 }}>
              <Select options={enumOptions(PLATFORM_MAP)} />
            </Form.Item>
            <Form.Item name="channel" label="渠道" style={{ flex: 1 }}>
              <Input placeholder="official" />
            </Form.Item>
            <Form.Item name="updateType" label="更新类型" style={{ flex: 1 }}>
              <Select options={enumOptions(UPDATE_TYPE_MAP)} />
            </Form.Item>
          </Space>
          <Form.Item name="minSupportedCode" label="最低支持版本 Code（低于此版本强制升级）">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="可选" />
          </Form.Item>
          <Form.Item name="releaseNotes" label="更新说明">
            <Input.TextArea rows={3} maxLength={5000} />
          </Form.Item>
          <Form.Item name="apkFileId" label="安装包（APK）">
            <FileUpload
              bizType="APK"
              accept=".apk"
              value={editing?.apkFileId ?? undefined}
              onChange={(id) => form.setFieldsValue({ apkFileId: id })}
            />
          </Form.Item>
          {editing?.apkUrl && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              当前安装包：{editing.apkUrl}
            </Typography.Text>
          )}
        </Form>
      </Modal>

      {/* 灰度设置 */}
      <GrayModal
        open={!!grayTarget}
        target={grayTarget}
        onCancel={() => setGrayTarget(null)}
        onOk={(grayPercent, deviceIds) => {
          if (!grayTarget) return;
          actionMut.mutate({ id: grayTarget.id, action: 'PUBLISH_GRAY', extra: { grayPercent, deviceIds } });
        }}
      />
    </Card>
  );
}

function GrayModal({
  open,
  target,
  onCancel,
  onOk,
}: {
  open: boolean;
  target: AppVersion | null;
  onCancel: () => void;
  onOk: (grayPercent: number, deviceIds: string[]) => void;
}) {
  const [grayPercent, setGrayPercent] = useState(10);
  const [deviceText, setDeviceText] = useState('');

  return (
    <Modal
      title={`灰度发布 v${target?.versionName ?? ''}`}
      open={open}
      onCancel={onCancel}
      onOk={() => {
        const deviceIds = deviceText
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean);
        onOk(grayPercent, deviceIds);
      }}
      okText="开始灰度"
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <div>
          <Typography.Text strong>灰度比例（%）</Typography.Text>
          <div style={{ marginTop: 8 }}>
            <InputNumber
              min={0}
              max={100}
              value={grayPercent}
              onChange={(v) => setGrayPercent(v ?? 0)}
              style={{ width: '100%' }}
            />
          </div>
        </div>
        <div>
          <Typography.Text strong>设备白名单（可选，每行一个 deviceId）</Typography.Text>
          <Input.TextArea
            rows={4}
            value={deviceText}
            onChange={(e) => setDeviceText(e.target.value)}
            placeholder={'DEV00001\nDEV00002'}
          />
        </div>
      </Space>
    </Modal>
  );
}

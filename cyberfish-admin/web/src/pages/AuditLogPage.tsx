import { useMemo, useState } from 'react';
import { Card, Table, Button, Space, Input, Select, Drawer, Descriptions, Typography, DatePicker } from 'antd';
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import * as auditLogApi from '../api/auditLog';
import type { AuditLog } from '../api/types';
import { EnumTag } from '../components/EnumTag';
import {
  AUDIT_MODULE_MAP,
  AUDIT_ACTION_MAP,
  AUDIT_RESULT_MAP,
  enumOptions,
} from '../utils/constants';
import { formatDateTime } from '../utils/format';

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  const text = JSON.stringify(value, null, 2);
  return (
    <div style={{ marginBottom: 12 }}>
      <Typography.Text strong>{title}</Typography.Text>
      <pre
        style={{
          background: '#0f0f0f',
          color: '#e6e6e6',
          padding: 12,
          borderRadius: 8,
          maxHeight: 200,
          overflow: 'auto',
          fontSize: 12,
        }}
      >
        {text}
      </pre>
    </div>
  );
}

export function AuditLogPage() {
  const [params, setParams] = useState<Record<string, unknown>>({ page: 1, pageSize: 15 });
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['auditLogs', params],
    queryFn: () => auditLogApi.listAuditLogs(params),
  });

  const columns: ColumnsType<AuditLog> = useMemo(
    () => [
      { title: '时间', dataIndex: 'createdAt', width: 170, render: (v) => formatDateTime(v) },
      { title: '操作人', dataIndex: 'operatorName', width: 140 },
      { title: '模块', dataIndex: 'module', width: 110, render: (v) => <EnumTag value={v} map={AUDIT_MODULE_MAP} /> },
      { title: '动作', dataIndex: 'action', width: 110, render: (v) => <EnumTag value={v} map={AUDIT_ACTION_MAP} /> },
      { title: '对象', dataIndex: 'targetName', ellipsis: true, render: (v) => v || '-' },
      { title: '结果', dataIndex: 'result', width: 90, render: (v) => <EnumTag value={v} map={AUDIT_RESULT_MAP} /> },
      { title: 'IP', dataIndex: 'ip', width: 130, render: (v) => v || '-' },
      {
        title: '操作',
        key: 'actions',
        width: 90,
        fixed: 'right',
        render: (_, r) => (
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(r)}>
            详情
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <div className="page-heading"><div><h1>操作日志</h1><p>所有写操作均记录在案，支持按操作人、模块和结果筛选</p></div><Button icon={<ReloadOutlined />} onClick={() => refetch()}>刷新</Button></div>
      <Card>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索操作人 / 对象"
          allowClear
          style={{ width: 240 }}
          onSearch={(v) => setParams((p) => ({ ...p, page: 1, keyword: v || undefined }))}
        />
        <Select
          allowClear
          placeholder="模块"
          style={{ width: 130 }}
          options={enumOptions(AUDIT_MODULE_MAP)}
          onChange={(v) => setParams((p) => ({ ...p, page: 1, module: v }))}
        />
        <Select
          allowClear
          placeholder="动作"
          style={{ width: 130 }}
          options={enumOptions(AUDIT_ACTION_MAP)}
          onChange={(v) => setParams((p) => ({ ...p, page: 1, action: v }))}
        />
        <Select
          allowClear
          placeholder="结果"
          style={{ width: 110 }}
          options={enumOptions(AUDIT_RESULT_MAP)}
          onChange={(v) => setParams((p) => ({ ...p, page: 1, result: v }))}
        />
        <DatePicker.RangePicker
          onChange={(v) =>
            setParams((p) => ({
              ...p,
              page: 1,
              createdFrom: v?.[0]?.format('YYYY-MM-DD') || undefined,
              createdTo: v?.[1]?.format('YYYY-MM-DD') || undefined,
            }))
          }
        />
      </Space>

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.list ?? []}
        scroll={{ x: 1000 }}
        pagination={{
          current: data?.pagination.page ?? 1,
          pageSize: data?.pagination.pageSize ?? 15,
          total: data?.pagination.total ?? 0,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page, pageSize) => setParams((p) => ({ ...p, page, pageSize })),
        }}
      />

      <Drawer title="操作日志详情" open={!!detail} onClose={() => setDetail(null)} width={620}>
        {detail && (
          <>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="时间">{formatDateTime(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="操作人">{detail.operatorName}</Descriptions.Item>
              <Descriptions.Item label="模块">
                <EnumTag value={detail.module} map={AUDIT_MODULE_MAP} />
              </Descriptions.Item>
              <Descriptions.Item label="动作">
                <EnumTag value={detail.action} map={AUDIT_ACTION_MAP} />
              </Descriptions.Item>
              <Descriptions.Item label="结果">
                <EnumTag value={detail.result} map={AUDIT_RESULT_MAP} />
              </Descriptions.Item>
              <Descriptions.Item label="对象类型">{detail.targetType ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="对象 ID">{detail.targetId ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="对象名称">{detail.targetName ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="IP">{detail.ip ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Request ID" span={2}>
                {detail.requestId ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="原因" span={2}>
                {detail.reason ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="User-Agent" span={2}>
                {detail.userAgent ?? '-'}
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 16 }}>
              <JsonBlock title="变更前（before）" value={detail.before} />
              <JsonBlock title="变更后（after）" value={detail.after} />
            </div>
          </>
        )}
      </Drawer>
      </Card>
    </div>
  );
}

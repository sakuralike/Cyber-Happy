import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Card,
  Table,
  Button,
  Space,
  Input,
  Select,
  Form,
  Modal,
  message,
  Drawer,
  Descriptions,
  Timeline,
  Typography,
  Tag,
  Switch,
  DatePicker,
  Image,
  Row,
  Col,
} from 'antd';
import { ReloadOutlined, DownloadOutlined, EyeOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import * as misreportApi from '../api/misreport';
import { listAdmins } from '../api/admin';
import type { Misreport, MisreportStatus, RootCause, GroundTruth } from '../api/types';
import { EnumTag } from '../components/EnumTag';
import { useAuth } from '../store/auth';
import {
  REPORT_TYPE_MAP,
  MISREPORT_STATUS_MAP,
  SEVERITY_MAP,
  ROOT_CAUSE_MAP,
  GROUND_TRUTH_MAP,
  enumOptions,
} from '../utils/constants';
import { formatDateTime } from '../utils/format';
import { getToken, notifyError } from '../api/client';

export function MisreportPage() {
  const qc = useQueryClient();
  const { hasPerm } = useAuth();
  const [params, setParams] = useState<Record<string, unknown>>({ page: 1, pageSize: 10 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<Misreport | null>(null);
  const [reviewTarget, setReviewTarget] = useState<Misreport | null>(null);
  const [assignTarget, setAssignTarget] = useState<Misreport | null>(null);
  const [batchModal, setBatchModal] = useState<null | { action: 'REVIEW' | 'ASSIGN' }>(null);
  const [reviewForm] = Form.useForm();
  const [assignForm] = Form.useForm();
  const [batchForm] = Form.useForm();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['misreports', params],
    queryFn: () => misreportApi.listMisreports(params),
  });

  const { data: detailData } = useQuery({
    queryKey: ['misreport', detail?.id],
    queryFn: () => misreportApi.getMisreport(detail!.id),
    enabled: !!detail?.id,
  });

  const { data: admins } = useQuery({
    queryKey: ['admins'],
    queryFn: () => listAdmins({ page: 1, pageSize: 100 }),
    enabled: hasPerm('admin:read'),
  });

  const assigneeOptions = useMemo(
    () =>
      (admins?.list ?? [])
        .filter((a) => ['ADMIN', 'OPERATOR', 'REVIEWER'].includes(a.role) && a.status === 'ACTIVE')
        .map((a) => ({ value: a.id, label: `${a.displayName}（${a.username}）` })),
    [admins],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['misreports'] });
    qc.invalidateQueries({ queryKey: ['dash'] });
    setSelectedIds([]);
  };

  const reviewMut = useMutation({
    mutationFn: ({ id, v }: { id: string; v: Parameters<typeof misreportApi.reviewMisreport>[1] }) =>
      misreportApi.reviewMisreport(id, v),
    onSuccess: () => {
      message.success('复核完成');
      setReviewTarget(null);
      setDetail(null);
      invalidate();
    },
    onError: notifyError,
  });
  const assignMut = useMutation({
    mutationFn: ({ id, v }: { id: string; v: { assignedToId: string; note?: string } }) => misreportApi.assignMisreport(id, v),
    onSuccess: () => {
      message.success('指派成功');
      setAssignTarget(null);
      invalidate();
    },
    onError: notifyError,
  });
  const batchMut = useMutation({
    mutationFn: (v: Parameters<typeof misreportApi.batchMisreports>[0]) => misreportApi.batchMisreports(v),
    onSuccess: (d) => {
      message.success(`批量处理完成，共 ${d.affected} 条`);
      setBatchModal(null);
      invalidate();
    },
    onError: notifyError,
  });

  const openReview = (r: Misreport) => {
    setReviewTarget(r);
    reviewForm.resetFields();
    reviewForm.setFieldsValue({ status: 'CONFIRMED', addToTrainingSet: true });
  };
  const openAssign = (r: Misreport) => {
    setAssignTarget(r);
    assignForm.resetFields();
  };

  const doExport = async () => {
    try {
      const blob = await misreportApi.exportMisreportsCsv(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `误报记录_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notifyError(e);
    }
  };

  const columns: ColumnsType<Misreport> = useMemo(
    () => [
      { title: '单号', dataIndex: 'reportNo', width: 150, render: (v) => <Typography.Text copyable>{v}</Typography.Text> },
      { title: '类型', dataIndex: 'reportType', width: 90, render: (v) => <EnumTag value={v} map={REPORT_TYPE_MAP} /> },
      { title: '状态', dataIndex: 'status', width: 100, render: (v) => <EnumTag value={v} map={MISREPORT_STATUS_MAP} /> },
      { title: '严重度', dataIndex: 'severity', width: 80, render: (v) => <EnumTag value={v} map={SEVERITY_MAP} /> },
      { title: '设备 ID', dataIndex: 'deviceId', width: 130 },
      {
        title: '版本 / 模型',
        key: 'vm',
        width: 200,
        render: (_, r) => (
          <Space direction="vertical" size={0}>
            <span style={{ fontSize: 13 }}>v{r.appVersionName}</span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.modelVersion || '-'}
            </Typography.Text>
          </Space>
        ),
      },
      { title: '根因', dataIndex: 'rootCause', width: 150, render: (v) => (v ? <EnumTag value={v} map={ROOT_CAUSE_MAP} /> : '-') },
      {
        title: '是否入训练集',
        dataIndex: 'addToTrainingSet',
        width: 110,
        render: (v) => (v ? <Tag color="purple">是</Tag> : <Tag>否</Tag>),
      },
      {
        title: '用户描述',
        dataIndex: 'userNote',
        ellipsis: true,
        render: (v) => v || '-',
      },
      { title: '上报时间', dataIndex: 'reportedAt', width: 160, render: (v) => formatDateTime(v) },
      {
        title: '操作',
        key: 'actions',
        width: 180,
        fixed: 'right',
        render: (_, r) => (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(r)}>
              详情
            </Button>
            {hasPerm('misreport:review') && (
              <Button size="small" type="primary" ghost onClick={() => openReview(r)}>
                复核
              </Button>
            )}
            {hasPerm('misreport:assign') && (
              <Button size="small" icon={<UserSwitchOutlined />} onClick={() => openAssign(r)}>
                指派
              </Button>
            )}
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasPerm],
  );

  return (
    <div>
      <div className="page-heading">
        <div><h1>用户误报复核</h1><p>待处理 → 复核中 → 已确认 / 已驳回 → 已解决 · 可批量流转</p></div>
        <Space><Button type="primary" onClick={() => setBatchModal({ action: 'REVIEW' })} disabled={selectedIds.length === 0 || !hasPerm('misreport:review')}>批量确认</Button><Button onClick={doExport} disabled={!hasPerm('misreport:export')} icon={<DownloadOutlined />}>导出 CSV</Button></Space>
      </div>
      <Card
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
        </Space>
      }
      >
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索单号 / 用户 / 设备 / 描述"
          allowClear
          style={{ width: 260 }}
          onSearch={(v) => setParams((p) => ({ ...p, page: 1, keyword: v || undefined }))}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 120 }}
          options={enumOptions(MISREPORT_STATUS_MAP)}
          onChange={(v) => setParams((p) => ({ ...p, page: 1, status: v }))}
        />
        <Select
          allowClear
          placeholder="类型"
          style={{ width: 120 }}
          options={enumOptions(REPORT_TYPE_MAP)}
          onChange={(v) => setParams((p) => ({ ...p, page: 1, reportType: v }))}
        />
        <Select
          allowClear
          placeholder="根因"
          style={{ width: 150 }}
          options={enumOptions(ROOT_CAUSE_MAP)}
          onChange={(v) => setParams((p) => ({ ...p, page: 1, rootCause: v }))}
        />
        <DatePicker.RangePicker
          onChange={(v) => {
            setParams((p) => ({
              ...p,
              page: 1,
              reportedFrom: v?.[0]?.format('YYYY-MM-DD') || undefined,
              reportedTo: v?.[1]?.format('YYYY-MM-DD') || undefined,
            }));
          }}
        />
      </Space>

      {hasPerm('misreport:assign') && selectedIds.length > 0 && (
        <Space style={{ marginBottom: 16 }}>
          <Typography.Text>已选 {selectedIds.length} 条：</Typography.Text>
          <Button size="small" onClick={() => setBatchModal({ action: 'REVIEW' })}>
            批量复核
          </Button>
          <Button size="small" onClick={() => setBatchModal({ action: 'ASSIGN' })}>
            批量指派
          </Button>
        </Space>
      )}

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.list ?? []}
        scroll={{ x: 1300 }}
        rowSelection={
          hasPerm('misreport:assign')
            ? {
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys as string[]),
              }
            : undefined
        }
        pagination={{
          current: data?.pagination.page ?? 1,
          pageSize: data?.pagination.pageSize ?? 10,
          total: data?.pagination.total ?? 0,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page, pageSize) => setParams((p) => ({ ...p, page, pageSize })),
        }}
      />

      {/* 详情 */}
      <DetailDrawer data={detailData ?? detail} onClose={() => setDetail(null)} onReview={hasPerm('misreport:review') ? openReview : undefined} />

      {/* 复核 */}
      <Modal
        title={`复核 ${reviewTarget?.reportNo ?? ''}`}
        open={!!reviewTarget}
        onOk={() => {
          reviewForm.validateFields().then((v) => reviewMut.mutate({ id: reviewTarget!.id, v }));
        }}
        onCancel={() => setReviewTarget(null)}
        confirmLoading={reviewMut.isPending}
        width={520}
        destroyOnClose
      >
        <Form form={reviewForm} layout="vertical">
          <Form.Item name="status" label="复核结论（状态）" rules={[{ required: true }]}>
            <Select options={enumOptions(MISREPORT_STATUS_MAP)} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="groundTruth" label="Ground Truth">
                <Select allowClear placeholder="选择真值" options={enumOptions(GROUND_TRUTH_MAP)} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="rootCause" label="根因">
                <Select allowClear placeholder="选择根因" options={enumOptions(ROOT_CAUSE_MAP)} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="reviewerNote" label="复核备注">
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
          <Form.Item name="resolution" label="处理结论">
            <Input.TextArea rows={2} maxLength={2000} placeholder="例如：将在 v1.3.0 修复" />
          </Form.Item>
          <Form.Item name="addToTrainingSet" label="加入训练集" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* 指派 */}
      <Modal
        title={`指派 ${assignTarget?.reportNo ?? ''}`}
        open={!!assignTarget}
        onOk={() => {
          assignForm.validateFields().then((v) => assignMut.mutate({ id: assignTarget!.id, v }));
        }}
        onCancel={() => setAssignTarget(null)}
        confirmLoading={assignMut.isPending}
        width={440}
        destroyOnClose
      >
        <Form form={assignForm} layout="vertical">
          <Form.Item name="assignedToId" label="处理人" rules={[{ required: true, message: '请选择处理人' }]}>
            {hasPerm('admin:read') ? (
              <Select placeholder="选择处理人" options={assigneeOptions} showSearch optionFilterProp="label" />
            ) : (
              <Input placeholder="输入处理人账号 ID" />
            )}
          </Form.Item>
          <Form.Item name="note" label="指派说明">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量 */}
      <Modal
        title={batchModal?.action === 'ASSIGN' ? '批量指派' : '批量复核'}
        open={!!batchModal}
        onOk={() => {
          batchForm.validateFields().then((v) => batchMut.mutate({ ids: selectedIds, action: batchModal!.action, ...v }));
        }}
        onCancel={() => setBatchModal(null)}
        confirmLoading={batchMut.isPending}
        width={440}
        destroyOnClose
      >
        <Form form={batchForm} layout="vertical">
          {batchModal?.action === 'ASSIGN' ? (
            <Form.Item name="assignedToId" label="处理人" rules={[{ required: true, message: '请选择处理人' }]}>
              {hasPerm('admin:read') ? (
                <Select placeholder="选择处理人" options={assigneeOptions} showSearch optionFilterProp="label" />
              ) : (
                <Input placeholder="输入处理人账号 ID" />
              )}
            </Form.Item>
          ) : (
            <>
              <Form.Item name="status" label="目标状态" rules={[{ required: true }]}>
                <Select options={enumOptions(MISREPORT_STATUS_MAP)} />
              </Form.Item>
              <Form.Item name="rootCause" label="根因">
                <Select allowClear placeholder="选择根因" options={enumOptions(ROOT_CAUSE_MAP)} />
              </Form.Item>
              <Form.Item name="reviewerNote" label="备注">
                <Input.TextArea rows={2} maxLength={2000} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
      </Card>
    </div>
  );
}

function DetailDrawer({
  data,
  onClose,
  onReview,
}: {
  data: Misreport | null;
  onClose: () => void;
  onReview?: (r: Misreport) => void;
}) {
  if (!data) return <Drawer open={false} onClose={onClose} />;

  const rawJson = JSON.stringify(data.rawData ?? {}, null, 2);

  return (
    <Drawer title={`误报详情 · ${data.reportNo}`} open onClose={onClose} width={720}>
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="类型">
          <EnumTag value={data.reportType} map={REPORT_TYPE_MAP} />
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          <EnumTag value={data.status} map={MISREPORT_STATUS_MAP} />
        </Descriptions.Item>
        <Descriptions.Item label="严重度">
          <EnumTag value={data.severity} map={SEVERITY_MAP} />
        </Descriptions.Item>
        <Descriptions.Item label="根因">
          {data.rootCause ? <EnumTag value={data.rootCause} map={ROOT_CAUSE_MAP} /> : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Ground Truth">
          {data.groundTruth ? <EnumTag value={data.groundTruth} map={GROUND_TRUTH_MAP} /> : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="入训练集">{data.addToTrainingSet ? '是' : '否'}</Descriptions.Item>
        <Descriptions.Item label="用户 ID">{data.userId}</Descriptions.Item>
        <Descriptions.Item label="设备 ID">{data.deviceId}</Descriptions.Item>
        <Descriptions.Item label="设备型号">{data.deviceModel || '-'}</Descriptions.Item>
        <Descriptions.Item label="系统版本">{data.osVersion || '-'}</Descriptions.Item>
        <Descriptions.Item label="APP 版本">v{data.appVersionName}</Descriptions.Item>
        <Descriptions.Item label="模型版本">{data.modelVersion || '-'}</Descriptions.Item>
        <Descriptions.Item label="上报时间">{formatDateTime(data.reportedAt)}</Descriptions.Item>
        <Descriptions.Item label="处理人">{data.assignedToName ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="复核人">{data.reviewedByName ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="复核时间">{formatDateTime(data.reviewedAt)}</Descriptions.Item>
        <Descriptions.Item label="场景标签" span={2}>
          {(data.sceneTags ?? []).length ? data.sceneTags.map((t) => <Tag key={t}>{t}</Tag>) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="用户描述" span={2}>
          {data.userNote || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="复核备注" span={2}>
          {data.reviewerNote || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="处理结论" span={2}>
          {data.resolution || '-'}
        </Descriptions.Item>
      </Descriptions>

      <Typography.Title level={5} style={{ marginTop: 20 }}>
        截图
      </Typography.Title>
      <Space wrap>
        {(data.snapshotUrls ?? []).length ? (
          data.snapshotUrls.map((u, i) => <ProtectedImage key={i} src={u} width={160} />)
        ) : (
          <Typography.Text type="secondary">暂无截图</Typography.Text>
        )}
      </Space>

      {data.videoUrl && (
        <>
          <Typography.Title level={5} style={{ marginTop: 20 }}>
            视频
          </Typography.Title>
          <ProtectedVideo src={data.videoUrl} />
        </>
      )}

      <Typography.Title level={5} style={{ marginTop: 20 }}>
        原始数据（特征快照）
      </Typography.Title>
      <pre
        style={{
          background: '#0f0f0f',
          color: '#e6e6e6',
          padding: 16,
          borderRadius: 8,
          maxHeight: 240,
          overflow: 'auto',
          fontSize: 12,
        }}
      >
        {rawJson}
      </pre>

      {data.statusLogs && data.statusLogs.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 20 }}>
            状态流转
          </Typography.Title>
          <Timeline
            items={data.statusLogs.map((l) => ({
              children: (
                <div>
                  <div>
                    {l.fromStatus ? (
                      <EnumTag value={l.fromStatus} map={MISREPORT_STATUS_MAP} />
                    ) : (
                      <Tag>创建</Tag>
                    )}{' '}
                    → <EnumTag value={l.toStatus} map={MISREPORT_STATUS_MAP} />
                    <span style={{ marginLeft: 8, color: '#999' }}>
                      {l.operatorName} · {formatDateTime(l.createdAt)}
                    </span>
                  </div>
                  {l.note && <div style={{ fontSize: 12, color: '#666' }}>{l.note}</div>}
                </div>
              ),
            }))}
          />
        </>
      )}

      {onReview && (
        <Button type="primary" block style={{ marginTop: 24 }} onClick={() => onReview(data)}>
          复核此记录
        </Button>
      )}
    </Drawer>
  );
}

function useProtectedMedia(src: string | null | undefined): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    if (!src) {
      setUrl(undefined);
      return () => undefined;
    }
    if (/^(https?:|data:|blob:)/i.test(src)) {
      setUrl(src);
      return () => undefined;
    }
    setUrl(undefined);
    void axios
      .get(src, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      })
      .then((response) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setUrl(undefined);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return url;
}

function ProtectedImage({ src, width }: { src: string; width: number }) {
  const url = useProtectedMedia(src);
  return url ? <Image src={url} width={width} style={{ borderRadius: 8 }} /> : <Typography.Text type="secondary">加载中</Typography.Text>;
}

function ProtectedVideo({ src }: { src: string }) {
  const url = useProtectedMedia(src);
  return url ? <video src={url} controls style={{ maxWidth: '100%', borderRadius: 8 }} /> : <Typography.Text type="secondary">加载中</Typography.Text>;
}

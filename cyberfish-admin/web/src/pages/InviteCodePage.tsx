import { useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import { CopyOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as inviteApi from '../api/invite';
import { notifyError } from '../api/client';
import { formatDateTime } from '../utils/format';

export function InviteCodePage() {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [generated, setGenerated] = useState<string[]>([]);
  const query = useQuery({ queryKey: ['invite-codes'], queryFn: () => inviteApi.listInviteCodes({ page: 1, pageSize: 100 }) });
  const create = useMutation({
    mutationFn: (values: { mode: inviteApi.InviteMode; quantity: number; maxUses: number; expiresAt?: string; note?: string }) =>
      inviteApi.createInviteCodes({ ...values, expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null }),
    onSuccess: (result) => { setGenerated(result.items.map((item) => item.code)); setOpen(false); void qc.invalidateQueries({ queryKey: ['invite-codes'] }); message.success('邀请码已生成'); },
    onError: notifyError,
  });
  const revoke = useMutation({
    mutationFn: inviteApi.revokeInviteCode,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['invite-codes'] }); message.success('邀请码已撤销'); },
    onError: notifyError,
  });
  const copy = async () => { await navigator.clipboard.writeText(generated.join('\n')); message.success('已复制邀请码'); };
  return <div>
    <div className="page-heading"><div><h1>邀请码管理</h1><p>生成、查看和撤销普通用户注册邀请码</p></div><Space><Button icon={<ReloadOutlined />} onClick={() => void query.refetch()} /><Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ mode: 'SINGLE', quantity: 1, maxUses: 1 }); setOpen(true); }}>生成邀请码</Button></Space></div>
    <Card>
      <Table rowKey="id" loading={query.isLoading} dataSource={query.data?.list ?? []} pagination={false} columns={[
        { title: '前缀', dataIndex: 'codePrefix' },
        { title: '类型', dataIndex: 'mode', render: (value: inviteApi.InviteMode) => value === 'SINGLE' ? '单次' : '多次' },
        { title: '使用次数', render: (_: unknown, row: inviteApi.InviteCode) => `${row.usedCount} / ${row.maxUses}` },
        { title: '状态', dataIndex: 'status', render: (value: inviteApi.InviteStatus) => <Tag color={value === 'ACTIVE' ? 'green' : value === 'REVOKED' ? 'default' : 'orange'}>{value}</Tag> },
        { title: '失效时间', dataIndex: 'expiresAt', render: (value: string | null) => value ? formatDateTime(value) : '永不失效' },
        { title: '创建时间', dataIndex: 'createdAt', render: (value: string) => formatDateTime(value) },
        { title: '操作', render: (_: unknown, row: inviteApi.InviteCode) => <Button size="small" disabled={row.status !== 'ACTIVE'} onClick={() => revoke.mutate(row.id)}>撤销</Button> },
      ]} />
    </Card>
    <Modal title="生成邀请码" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={create.isPending} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)}>
        <Form.Item name="mode" label="类型" rules={[{ required: true }]}><Select options={[{ value: 'SINGLE', label: '单次邀请码' }, { value: 'MULTI', label: '多次邀请码' }]} onChange={(value) => form.setFieldValue('maxUses', value === 'SINGLE' ? 1 : 10)} /></Form.Item>
        <Form.Item name="quantity" label="生成数量" rules={[{ required: true }]}><InputNumber min={1} max={500} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="maxUses" label="每个邀请码最大使用次数" rules={[{ required: true }]}><InputNumber min={1} max={100000} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="expiresAt" label="失效时间" extra="留空表示永不失效，建议设置失效时间"><Input type="datetime-local" /></Form.Item>
        <Form.Item name="note" label="备注"><Input maxLength={300} /></Form.Item>
      </Form>
    </Modal>
    <Modal title="本批邀请码仅显示一次" open={generated.length > 0} onCancel={() => setGenerated([])} footer={<Button icon={<CopyOutlined />} onClick={copy}>复制全部</Button>}>
      <Input.TextArea value={generated.join('\n')} readOnly rows={Math.min(12, generated.length + 1)} />
    </Modal>
  </div>;
}

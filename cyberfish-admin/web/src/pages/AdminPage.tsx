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
  message,
  Popconfirm,
  Typography,
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import * as adminApi from '../api/admin';
import type { AdminUser, AdminRole } from '../api/types';
import { EnumTag } from '../components/EnumTag';
import { ROLE_MAP, ACTIVE_STATUS_MAP, enumOptions } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import { notifyError } from '../api/client';
import { useAuth } from '../store/auth';

export function AdminPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [params, setParams] = useState<Record<string, unknown>>({ page: 1, pageSize: 10 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admins', params],
    queryFn: () => adminApi.listAdmins(params),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admins'] });

  const createMut = useMutation({
    mutationFn: (v: Parameters<typeof adminApi.createAdmin>[0]) => adminApi.createAdmin(v),
    onSuccess: () => {
      message.success('创建成功');
      setModalOpen(false);
      invalidate();
    },
    onError: notifyError,
  });
  const updateMut = useMutation({
    mutationFn: ({ id, v }: { id: string; v: Parameters<typeof adminApi.updateAdmin>[1] }) => adminApi.updateAdmin(id, v),
    onSuccess: () => {
      message.success('保存成功');
      setModalOpen(false);
      invalidate();
    },
    onError: notifyError,
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => adminApi.updateAdmin(id, { status }),
    onSuccess: () => {
      message.success('状态已更新');
      invalidate();
    },
    onError: notifyError,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteAdmin(id),
    onSuccess: () => {
      message.success('已禁用该账号');
      invalidate();
    },
    onError: notifyError,
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role: 'OPERATOR' });
    setModalOpen(true);
  };
  const openEdit = (row: AdminUser) => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue({ displayName: row.displayName, role: row.role, email: row.email ?? '', status: row.status });
    setModalOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    if (editing) {
      const { password, ...rest } = v;
      updateMut.mutate({ id: editing.id, v: password ? { ...rest, password } : rest });
    } else {
      createMut.mutate(v);
    }
  };

  const columns: ColumnsType<AdminUser> = useMemo(
    () => [
      { title: '用户名', dataIndex: 'username', width: 150 },
      { title: '显示名', dataIndex: 'displayName', width: 150 },
      { title: '角色', dataIndex: 'role', width: 110, render: (v) => <EnumTag value={v} map={ROLE_MAP} /> },
      { title: '状态', dataIndex: 'status', width: 90, render: (v) => <EnumTag value={v} map={ACTIVE_STATUS_MAP} /> },
      { title: '邮箱', dataIndex: 'email', render: (v) => v || '-' },
      { title: '最近登录', dataIndex: 'lastLoginAt', width: 170, render: (v) => formatDateTime(v) },
      { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (v) => formatDateTime(v) },
      {
        title: '操作',
        key: 'actions',
        width: 200,
        fixed: 'right',
        render: (_, r) => (
          <Space>
            <Button size="small" onClick={() => openEdit(r)}>
              编辑
            </Button>
            {r.status === 'ACTIVE' ? (
              <Popconfirm title="确认禁用该账号？" onConfirm={() => toggleMut.mutate({ id: r.id, status: 'DISABLED' })}>
                <Button size="small">禁用</Button>
              </Popconfirm>
            ) : (
              <Button size="small" type="primary" ghost onClick={() => toggleMut.mutate({ id: r.id, status: 'ACTIVE' })}>
                启用
              </Button>
            )}
            {r.id !== user?.id && (
              <Popconfirm title="删除后账号将被禁用，确认？" onConfirm={() => deleteMut.mutate(r.id)}>
                <Button size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id],
  );

  return (
    <div>
      <div className="page-heading"><div><h1>账号管理</h1><p>管理后台成员、角色与访问状态</p></div><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建账号</Button></div>
      <Card
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
        </Space>
      }
      >
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索用户名 / 显示名"
          allowClear
          style={{ width: 240 }}
          onSearch={(v) => setParams((p) => ({ ...p, page: 1, keyword: v || undefined }))}
        />
        <Select
          allowClear
          placeholder="角色"
          style={{ width: 130 }}
          options={enumOptions(ROLE_MAP)}
          onChange={(v) => setParams((p) => ({ ...p, page: 1, role: v }))}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 120 }}
          options={enumOptions(ACTIVE_STATUS_MAP)}
          onChange={(v) => setParams((p) => ({ ...p, page: 1, status: v }))}
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
          pageSize: data?.pagination.pageSize ?? 10,
          total: data?.pagination.total ?? 0,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page, pageSize) => setParams((p) => ({ ...p, page, pageSize })),
        }}
      />

      <Modal
        title={editing ? `编辑 ${editing.username}` : '新建账号'}
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={createMut.isPending || updateMut.isPending}
        width={480}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          {!editing && (
            <>
              <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '至少 6 位' }]}>
                <Input.Password />
              </Form.Item>
            </>
          )}
          {editing && (
            <Form.Item name="password" label="重置密码（留空则不修改）">
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="displayName" label="显示名" rules={[{ required: true, message: '请输入显示名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={enumOptions(ROLE_MAP)} />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input type="email" />
          </Form.Item>
          {editing && (
            <Form.Item name="status" label="状态">
              <Select options={enumOptions(ACTIVE_STATUS_MAP)} />
            </Form.Item>
          )}
        </Form>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          角色权限：管理员=全部 · 运营=版本/模型/误报读写 · 复核员=误报复核 · 只读=仅查看
        </Typography.Text>
      </Modal>
      </Card>
    </div>
  );
}

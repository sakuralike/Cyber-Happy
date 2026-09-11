import { useState } from 'react';
import { Button, Form, Input, Segmented, message } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SiteBrandMark } from '../components/SiteBrandMark';
import { getPublicConfigAll } from '../api/systemSettings';
import { useUserAuth } from '../store/userAuth';

type Mode = 'login' | 'register';

export function AccountLoginPage() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { login, register, isAuthed } = useUserAuth();
  const { data: publicConfig } = useQuery({ queryKey: ['public-config'], queryFn: getPublicConfigAll });
  const site = publicConfig?.scopes.SITE ?? {};
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);

  if (isAuthed) return <Navigate to="/account" replace />;

  const submit = async (values: { username: string; password: string; displayName?: string; email?: string }) => {
    setLoading(true);
    try {
      if (mode === 'login') await login(values.username, values.password);
      else await register(values);
      message.success(mode === 'login' ? '登录成功' : '注册成功');
      navigate('/account');
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="account-login-page">
      <section className="account-login-brand">
        <a className="landing-brand" href="#/"><SiteBrandMark fileId={site['site.logoFileId']} size={25} />{String(site['site.name'] ?? '赛博鱼乐')}</a>
        <div><h1>钓友用户中心</h1><p>登录后可在网页与 APP 之间同步账号、误报记录和反馈。</p></div>
        <a href="#/login">后台管理登录</a>
      </section>
      <section className="account-login-form"><div className="login-form-wrap">
        <h1>{mode === 'login' ? '登录用户中心' : '注册用户中心'}</h1>
        <p>{mode === 'login' ? '使用赛博鱼乐账号继续' : '注册后可在 APP 与网站用户中心使用同一账号'}</p>
        <Segmented block value={mode} onChange={(value) => { setMode(value as Mode); form.resetFields(); }} options={[{ label: '登录', value: 'login' }, { label: '注册', value: 'register' }]} />
        <Form form={form} layout="vertical" size="large" onFinish={submit} style={{ marginTop: 24 }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, min: 2, message: '请输入至少 2 个字符的用户名' }]}><Input prefix={<UserOutlined />} autoFocus /></Form.Item>
          {mode === 'register' && <Form.Item name="displayName" label="昵称" rules={[{ max: 80 }]}><Input placeholder="默认使用用户名" /></Form.Item>}
          {mode === 'register' && <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '请输入有效邮箱' }]}><Input placeholder="可选" /></Form.Item>}
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}><Input.Password prefix={<LockOutlined />} /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>{mode === 'login' ? '登录' : '注册并登录'}</Button>
        </Form>
      </div></section>
    </main>
  );
}

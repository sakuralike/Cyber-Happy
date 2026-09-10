import { useState } from 'react';
import { Checkbox, Form, Input, Button, Typography, message } from 'antd';
import { CheckCircleFilled, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../store/auth';
import { SiteBrandMark } from '../components/SiteBrandMark';
import { getPublicConfigAll } from '../api/systemSettings';
import { useConfigStream } from '../hooks/useConfigStream';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { data: publicConfig } = useQuery({ queryKey: ['public-config'], queryFn: getPublicConfigAll });
  useConfigStream(['USER_PAGE', 'SITE']);
  const userPage = publicConfig?.scopes.USER_PAGE ?? {};
  const site = publicConfig?.scopes.SITE ?? {};
  const brandTitle = String(userPage['auth.brandTitle'] ?? '鱼漂识别的运营与技术中枢');
  const brandSubtitle = String(userPage['auth.brandSubtitle'] ?? '一个后台，管住 APP 发版、YOLO 模型下发、误报闭环与数据观测。');
  const brandFooter = String(userPage['auth.footer'] ?? '2026 赛博鱼乐 · 仅限授权账号访问');
  const backgroundFileId = userPage['auth.bgImageFileId'];

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      message.success('登录成功');
      navigate('/dashboard');
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-brand-panel" style={backgroundFileId ? { backgroundImage: `linear-gradient(rgba(7,94,84,.82), rgba(7,94,84,.9)), url(/api/v1/public/assets/${backgroundFileId})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        <div className="landing-brand"><SiteBrandMark fileId={site['site.logoFileId']} size={25} />{String(site['site.name'] ?? '赛博鱼乐')}</div>
        <div>
          <h1>{brandTitle}</h1>
          <p>{brandSubtitle}</p>
          <div className="login-benefits">
            <div className="login-benefit"><CheckCircleFilled />APP 版本自动发版与灰度上架</div>
            <div className="login-benefit"><CheckCircleFilled />YOLO 模型灰度下发与一键回滚</div>
            <div className="login-benefit"><CheckCircleFilled />误报复核闭环，沉淀增量训练集</div>
          </div>
        </div>
        <div className="login-copyright">{brandFooter}</div>
      </section>
      <section className="login-form-panel">
        <div className="login-form-wrap">
          <h1>登录管理后台</h1>
          <p>使用后台账号登录，所有写操作将记入审计日志</p>
          <Form layout="vertical" onFinish={onFinish} size="large">
            <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
              <Input prefix={<UserOutlined />} placeholder="admin" autoFocus />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
            </Form.Item>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <Checkbox>记住我</Checkbox>
              <Typography.Link>忘记密码?</Typography.Link>
            </div>
            <Button type="primary" htmlType="submit" block loading={loading}>登录</Button>
          </Form>
          <div className="login-demo">演示账号：admin / admin123 · 复核员：reviewer / reviewer123</div>
        </div>
      </section>
    </main>
  );
}

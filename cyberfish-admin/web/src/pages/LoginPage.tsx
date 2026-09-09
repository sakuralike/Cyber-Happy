import { useState } from 'react';
import { Checkbox, Form, Input, Button, Typography, message } from 'antd';
import { CheckCircleFilled, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { BrandMark } from '../components/BrandMark';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

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
      <section className="login-brand-panel">
        <div className="landing-brand"><BrandMark size={25} />赛博鱼乐</div>
        <div>
          <h1>鱼漂识别的<br />运营与技术中枢</h1>
          <p>一个后台，管住 APP 发版、YOLO 模型下发、误报闭环与数据观测。</p>
          <div className="login-benefits">
            <div className="login-benefit"><CheckCircleFilled />APP 版本自动发版与灰度上架</div>
            <div className="login-benefit"><CheckCircleFilled />YOLO 模型灰度下发与一键回滚</div>
            <div className="login-benefit"><CheckCircleFilled />误报复核闭环，沉淀增量训练集</div>
          </div>
        </div>
        <div className="login-copyright">2026 赛博鱼乐 · 仅限内网 / VPN 访问</div>
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
          <div className="login-demo">演示账号：admin / cyberfish2026 · 复核员：reviewer</div>
        </div>
      </section>
    </main>
  );
}

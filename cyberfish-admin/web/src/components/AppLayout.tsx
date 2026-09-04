import { useMemo } from 'react';
import { Layout, Menu, Dropdown, Avatar, Space, theme, Typography } from 'antd';
import {
  DashboardOutlined,
  MobileOutlined,
  ApiOutlined,
  BugOutlined,
  FileSearchOutlined,
  TeamOutlined,
  DownOutlined,
  LogoutOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { ROLE_MAP } from '../utils/constants';

const { Header, Sider, Content } = Layout;

export function AppLayout() {
  const { user, logout, hasPerm } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  const items = useMemo(() => {
    const list = [
      hasPerm('dashboard:read') && { key: '/dashboard', icon: <DashboardOutlined />, label: '数据看板' },
      hasPerm('appVersion:read') && { key: '/app-versions', icon: <MobileOutlined />, label: 'APP 版本管理' },
      hasPerm('model:read') && { key: '/models', icon: <ApiOutlined />, label: 'YOLO 模型管理' },
      hasPerm('misreport:read') && { key: '/misreports', icon: <BugOutlined />, label: '用户误报管理' },
      hasPerm('auditLog:read') && { key: '/audit-logs', icon: <FileSearchOutlined />, label: '操作日志' },
      hasPerm('admin:read') && { key: '/admins', icon: <TeamOutlined />, label: '账号管理' },
    ].filter(Boolean) as { key: string; icon: JSX.Element; label: string }[];
    return list;
  }, [hasPerm]);

  const selectedKey = useMemo(() => {
    const match = items.find((i) => location.pathname.startsWith(i.key));
    return match?.key ?? '/dashboard';
  }, [location.pathname, items]);

  const roleMeta = user ? ROLE_MAP[user.role] : null;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220}>
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 20px',
            color: '#fff',
            fontWeight: 700,
            fontSize: 16,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <ThunderboltOutlined style={{ color: '#1677ff', fontSize: 20 }} />
          赛博鱼乐 · 管理后台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={items}
          onClick={(e) => navigate(e.key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Typography.Text type="secondary">赛博鱼乐 · 鱼漂识别 APP 运营与技术管理后台</Typography.Text>
          {user && (
            <Dropdown
              menu={{
                items: [
                  { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' },
                ],
                onClick: async ({ key }) => {
                  if (key === 'logout') {
                    await logout();
                    navigate('/login');
                  }
                },
              }}
            >
              <Space style={{ cursor: 'pointer' }}>
                <Avatar style={{ background: '#1677ff' }}>{user.displayName.slice(0, 1)}</Avatar>
                <span>{user.displayName}</span>
                {roleMeta && <span style={{ color: '#999' }}>{roleMeta.label}</span>}
                <DownOutlined style={{ fontSize: 12, color: '#999' }} />
              </Space>
            </Dropdown>
          )}
        </Header>
        <Content style={{ padding: 24, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

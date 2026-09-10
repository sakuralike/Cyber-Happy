import { useMemo } from 'react';
import { Layout, Menu, Dropdown, Avatar, Space, Input, Typography } from 'antd';
import {
  DashboardOutlined,
  MobileOutlined,
  ApiOutlined,
  BugOutlined,
  FileSearchOutlined,
  TeamOutlined,
  LogoutOutlined,
  SettingOutlined,
  SearchOutlined,
  CloudUploadOutlined,
  DownloadOutlined,
  PictureOutlined,
  AppstoreOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { ROLE_MAP } from '../utils/constants';
import { BrandMark } from './BrandMark';

const { Header, Sider, Content } = Layout;

export function AppLayout() {
  const { user, logout, hasPerm } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const items = useMemo(() => {
    const operations = [
      hasPerm('dashboard:read') && { key: '/dashboard', icon: <DashboardOutlined />, label: '数据看板' },
      hasPerm('appVersion:read') && { key: '/app-versions', icon: <MobileOutlined />, label: 'APP 版本管理' },
      hasPerm('model:read') && { key: '/models', icon: <ApiOutlined />, label: 'YOLO 模型管理' },
      hasPerm('misreport:read') && { key: '/misreports', icon: <BugOutlined />, label: '用户误报复核' },
    ].filter(Boolean);
    const system = [
      hasPerm('auditLog:read') && { key: '/audit-logs', icon: <FileSearchOutlined />, label: '操作日志' },
      hasPerm('admin:read') && { key: '/admins', icon: <TeamOutlined />, label: '账号管理' },
      hasPerm('siteConfig:read') && { key: '/settings', icon: <SettingOutlined />, label: '配置域总览' },
      hasPerm('siteConfig:read') && { key: '/settings/site', icon: <SearchOutlined />, label: '站点与 SEO' },
      hasPerm('siteConfig:read') && { key: '/settings/downloads', icon: <DownloadOutlined />, label: '应用下载管理' },
      hasPerm('siteConfig:read') && { key: '/settings/banners', icon: <PictureOutlined />, label: '首页轮播图' },
      hasPerm('siteConfig:read') && { key: '/settings/landing', icon: <AppstoreOutlined />, label: '落地页内容编排' },
      hasPerm('siteConfig:read') && { key: '/settings/user-page', icon: <UserOutlined />, label: '用户页面设置' },
      hasPerm('siteConfig:read') && { key: '/settings/publish', icon: <CloudUploadOutlined />, label: '配置发布' },
    ].filter(Boolean);
    return [
      { type: 'group', label: '运营', children: operations },
      { type: 'group', label: '系统', children: system },
    ];
  }, [hasPerm]);

  const selectedKey = ['/dashboard', '/app-versions', '/models', '/misreports', '/audit-logs', '/admins', '/settings/site', '/settings/downloads', '/settings/banners', '/settings/landing', '/settings/user-page', '/settings/publish', '/settings']
    .find((key) => location.pathname === key || location.pathname.startsWith(`${key}/`)) ?? '/dashboard';
  const roleMeta = user ? ROLE_MAP[user.role] : null;

  const signOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <Layout className="admin-shell">
      <Sider width={240} breakpoint="lg" collapsedWidth={0} trigger={null}>
        <div className="admin-brand">
          <span className="brand-mark"><BrandMark /></span>
          <span>赛博鱼乐</span>
          <Typography.Text style={{ color: '#8e91a0', fontSize: 12 }}>Admin</Typography.Text>
        </div>
        <Menu
          className="admin-menu"
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={items as never}
          onClick={(event) => navigate(event.key)}
        />
        {user && (
          <Dropdown menu={{ items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录' }], onClick: signOut }}>
            <div className="admin-user">
              <Avatar>{user.displayName.slice(0, 1)}</Avatar>
              <div className="admin-user-meta">
                <div className="admin-user-name">{user.displayName}</div>
                <div className="admin-user-role">{roleMeta?.label ?? user.role}</div>
              </div>
            </div>
          </Dropdown>
        )}
      </Sider>
      <Layout>
        <Header className="admin-topbar">
          <Typography.Text className="admin-breadcrumb">
            {selectedKey.startsWith('/settings') ? '系统设置' : '运营'} / {items.flatMap((group) => (group as { children?: { key: string; label: string }[] }).children ?? []).find((item) => item.key === selectedKey)?.label ?? '数据看板'}
          </Typography.Text>
          <Space size={18}>
            <Input className="admin-search" prefix={<SearchOutlined />} placeholder="搜索版本号 / 单号 / 模型" />
            {user && <Dropdown menu={{ items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录' }], onClick: signOut }}>
              <Avatar style={{ background: '#e6f4f1', color: '#0b7c6e', cursor: 'pointer' }}>{user.displayName.slice(0, 1)}</Avatar>
            </Dropdown>}
          </Space>
        </Header>
        <Content className="admin-content"><Outlet /></Content>
      </Layout>
    </Layout>
  );
}

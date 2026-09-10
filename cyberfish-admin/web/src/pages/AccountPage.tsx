import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Input, Switch, message, Spin } from 'antd';
import { CheckCircleOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { SiteBrandMark } from '../components/SiteBrandMark';
import { useAuth } from '../store/auth';
import * as authApi from '../api/auth';
import * as misreportApi from '../api/misreport';
import type { Misreport, MisreportStatus } from '../api/types';
import { getPublicConfigAll } from '../api/systemSettings';
import { useConfigStream } from '../hooks/useConfigStream';

type AccountSection = 'overview' | 'profile' | 'reports' | 'notifications' | 'security';

const allNav: Array<{ key: AccountSection; label: string; icon: React.ReactNode; setting?: string }> = [
  { key: 'overview', label: '账号概览', icon: <UserOutlined /> },
  { key: 'profile', label: '个人资料', icon: <UserOutlined />, setting: 'user.nav.profile' },
  { key: 'reports', label: '误报记录', icon: <CheckCircleOutlined />, setting: 'user.nav.misreports' },
  { key: 'notifications', label: '消息通知', icon: <CheckCircleOutlined />, setting: 'user.nav.notifications' },
  { key: 'security', label: '安全设置', icon: <LockOutlined />, setting: 'user.nav.security' },
];

const statusText: Record<MisreportStatus, string> = {
  PENDING: '待处理', REVIEWING: '复核中', CONFIRMED: '已确认', REJECTED: '已驳回', RESOLVED: '已解决', CLOSED: '已关闭',
};

export function AccountPage() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState<AccountSection>('overview');
  const meQuery = useQuery({ queryKey: ['auth', 'me'], queryFn: authApi.fetchMe, enabled: !!user });
  const reportsQuery = useQuery({ queryKey: ['account', 'misreports'], queryFn: () => misreportApi.listMisreports({ page: 1, pageSize: 20 }), enabled: !!user });
  const configQuery = useQuery({ queryKey: ['public-config'], queryFn: getPublicConfigAll });
  useConfigStream(['USER_PAGE', 'SITE']);
  const currentUser = meQuery.data ?? user;
  const reports = reportsQuery.data?.list ?? [];
  const userPage = configQuery.data?.scopes.USER_PAGE ?? {};
  const site = configQuery.data?.scopes.SITE ?? {};
  const nav = useMemo(() => allNav.filter((item) => !item.setting || userPage[item.setting] !== false), [userPage]);
  const emptyText = String(userPage['user.emptyState.text'] ?? '暂无记录');
  useEffect(() => { if (!nav.some((item) => item.key === section)) setSection('overview'); }, [nav, section]);

  return (
    <div className="account-page">
      <header className="account-topbar"><a className="landing-brand" href="#/"><SiteBrandMark fileId={site['site.logoFileId']} size={22} />{String(site['site.name'] ?? '赛博鱼乐')}</a><nav><a href="#/">返回官网</a><a href="#/">使用帮助</a><a href="#/">意见反馈</a><strong className="brand-link">{currentUser?.displayName ?? '当前用户'}</strong><Button type="primary" onClick={async () => { await logout(); navigate('/'); }}>退出登录</Button></nav></header>
      <div className="account-layout">
        <aside><div className="account-sidebar-card"><div className="account-avatar"><Avatar size={54} src={typeof userPage['user.avatar.defaultFileId'] === 'string' ? `/api/v1/public/assets/${userPage['user.avatar.defaultFileId']}` : undefined}>{(currentUser?.displayName ?? '用').slice(0, 1)}</Avatar><div><strong>{currentUser?.displayName ?? '当前用户'}</strong><small>{currentUser?.email ?? currentUser?.username ?? '-'}</small></div></div><div className="account-nav">{nav.map((item) => <button key={item.key} className={section === item.key ? 'active' : ''} onClick={() => setSection(item.key)}>{item.icon}{item.label}</button>)}{userPage['user.nav.devices'] === true && <button disabled><LockOutlined />设备管理</button>}</div></div></aside>
        <main className="account-main">
          {section === 'overview' && <Overview user={currentUser} reports={reports} settings={userPage} onProfile={() => setSection('profile')} />}
          {section === 'profile' && <Profile user={currentUser} onSaved={(nextUser) => { updateUser(nextUser); void meQuery.refetch(); }} />}
          {section === 'reports' && <Reports reports={reports} loading={reportsQuery.isLoading} emptyText={emptyText} />}
          {section === 'notifications' && <Notifications reports={reports} emptyText={emptyText} />}
          {section === 'security' && <Security />}
        </main>
      </div>
    </div>
  );
}

function AccountHeader({ title, detail }: { title: string; detail: string }) { return <header><h1>{title}</h1><p>{detail}</p></header>; }

function Overview({ user, reports, settings, onProfile }: { user: ReturnType<typeof useAuth>['user']; reports: Misreport[]; settings: Record<string, unknown>; onProfile: () => void }) {
  const confirmed = reports.filter((report) => ['CONFIRMED', 'RESOLVED', 'CLOSED'].includes(report.status)).length;
  const welcome = String(settings['user.welcome.template'] ?? '{nickname}，本周已识别 {weekCount} 次').replace('{nickname}', user?.displayName ?? '当前用户').replace('{weekCount}', String(reports.length)).replace('{fishCount}', String(confirmed));
  const canEditProfile = settings['user.nav.profile'] !== false;
  return <>
    <AccountHeader title="账号概览" detail={welcome} />
    {settings['user.dashboard.showActivity'] !== false && <div className="account-banner"><div><strong>本地误报复核闭环</strong><p>当前账号可查看提交记录、复核状态与处理结果</p></div>{canEditProfile && <Button onClick={onProfile}>编辑资料</Button>}</div>}
    {settings['user.dashboard.showTotal'] !== false && <div className="account-stat-grid"><div className="account-stat"><span>账号</span><strong>{user?.username ?? '-'}</strong><small>{user?.role ?? '-'}</small></div><div className="account-stat"><span>提交误报</span><strong>{reports.length} 条</strong><small>当前可见记录</small></div><div className="account-stat"><span>已处理</span><strong>{confirmed} 条</strong><small className="account-status">已确认 / 已解决</small></div><div className="account-stat"><span>邮箱</span><strong>{user?.email ? '已填写' : '未填写'}</strong><small>{user?.email ?? '可在个人资料中补充'}</small></div></div>}
    {settings['user.dashboard.showRecent'] !== false && <div className="account-panel"><h2>最近误报动态</h2>{reports.slice(0, 3).map((report) => <div className="activity-row" key={report.id}><span>{report.reportNo} · {report.userNote || '用户反馈'} · {statusText[report.status]}</span><time>{new Date(report.reportedAt).toLocaleString('zh-CN')}</time></div>)}{reports.length === 0 && <div className="empty-state">{String(settings['user.emptyState.text'] ?? '暂无误报记录')}</div>}</div>}
  </>;
}

function Profile({ user, onSaved }: { user: ReturnType<typeof useAuth>['user']; onSaved: (user: NonNullable<ReturnType<typeof useAuth>['user']>) => void }) {
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDisplayName(user?.displayName ?? ''); setEmail(user?.email ?? ''); }, [user]);
  const save = async () => {
    setSaving(true);
    try { const updated = await authApi.updateMe({ displayName, email: email || null }); message.success('资料已保存'); onSaved(updated); }
    catch (error) { message.error((error as Error).message); }
    finally { setSaving(false); }
  };
  return <><AccountHeader title="个人资料" detail="资料仅用于账号识别与找回，不会公开展示" /><div className="account-panel"><div className="account-form"><label>昵称</label><Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /><span className="hint">当前登录账号显示名</span><label>用户名</label><Input value={user?.username ?? ''} readOnly style={{ background: '#f7f8fa' }} /><span className="hint">用户名不可修改</span><label>邮箱</label><Input value={email} onChange={(event) => setEmail(event.target.value)} /><span className="hint">用于账号通知，留空表示未填写</span><span /><span /><div><Button type="primary" loading={saving} onClick={save}>保存修改</Button></div></div></div></>;
}

function Reports({ reports, loading, emptyText }: { reports: Misreport[]; loading: boolean; emptyText: string }) { return <><AccountHeader title="误报记录" detail="查看每次反馈的复核进度与结果" /><div className="account-panel">{loading ? <Spin /> : <div style={{ overflowX: 'auto' }}><table className="account-table"><thead><tr><th>单号</th><th>类型</th><th>状态</th><th>提交时间</th><th>复核结果</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td>{report.reportNo}</td><td>{report.reportType}</td><td className="account-status">{statusText[report.status]}</td><td>{new Date(report.reportedAt).toLocaleString('zh-CN')}</td><td>{report.resolution || report.reviewerNote || '等待复核'}</td></tr>)}</tbody></table>{reports.length === 0 && <div className="empty-state">{emptyText}</div>}</div>}</div></>; }

function Notifications({ reports, emptyText }: { reports: Misreport[]; emptyText: string }) { return <><AccountHeader title="消息通知" detail="误报复核结果、模型更新与账号安全提醒" /><div className="account-panel"><h2>全部通知</h2>{reports.slice(0, 4).map((report) => <div className="notification-row" key={report.id}><div><strong>{report.reportNo} 复核状态更新</strong><div className="hint">当前状态：{statusText[report.status]}</div></div><time>{new Date(report.reportedAt).toLocaleString('zh-CN')}</time></div>)}{reports.length === 0 && <div className="empty-state">{emptyText}</div>}</div></>; }

function Security() { return <><AccountHeader title="安全设置" detail="管理当前账号的登录保护与通知偏好" /><div className="account-panel"><h2>安全设置</h2><div className="security-row"><div><strong>登录提醒</strong><div className="hint">账号登录行为会写入审计日志</div></div><Switch defaultChecked /></div><div className="security-row"><div><strong>修改密码</strong><div className="hint">请联系管理员执行密码重置</div></div><Button disabled>联系管理员</Button></div></div></>; }

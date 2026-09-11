import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Input, message, Spin } from 'antd';
import { CheckCircleOutlined, InfoCircleOutlined, MessageOutlined, QuestionCircleOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { SiteBrandMark } from '../components/SiteBrandMark';
import { useUserAuth } from '../store/userAuth';
import * as userApi from '../api/user';
import type { UserAccount, UserFeedback, UserMisreport } from '../api/user';
import { getPublicConfigAll } from '../api/systemSettings';
import { useConfigStream } from '../hooks/useConfigStream';

type AccountSection = 'overview' | 'profile' | 'reports' | 'feedback' | 'help' | 'about';

const allNav: Array<{ key: AccountSection; label: string; icon: React.ReactNode; setting?: string }> = [
  { key: 'overview', label: '账号概览', icon: <UserOutlined /> },
  { key: 'profile', label: '个人资料', icon: <UserOutlined />, setting: 'user.nav.profile' },
  { key: 'reports', label: '误报记录', icon: <CheckCircleOutlined />, setting: 'user.nav.misreports' },
  { key: 'feedback', label: '意见反馈', icon: <MessageOutlined /> },
  { key: 'help', label: '使用帮助', icon: <QuestionCircleOutlined /> },
  { key: 'about', label: '关于赛博鱼乐', icon: <InfoCircleOutlined /> },
];

const statusText: Record<string, string> = {
  PENDING: '待处理', REVIEWING: '复核中', CONFIRMED: '已确认', REJECTED: '已驳回', RESOLVED: '已解决', CLOSED: '已关闭',
};

export function AccountPage() {
  const { user, logout, updateUser } = useUserAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState<AccountSection>('overview');
  const meQuery = useQuery({ queryKey: ['user', 'me'], queryFn: userApi.fetchMe, enabled: !!user });
  const reportsQuery = useQuery({ queryKey: ['user', 'misreports'], queryFn: () => userApi.listMisreports({ page: 1, pageSize: 20 }), enabled: !!user });
  const feedbackQuery = useQuery({ queryKey: ['user', 'feedback'], queryFn: () => userApi.listFeedback({ page: 1, pageSize: 20 }), enabled: !!user && section === 'feedback' });
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
      <header className="account-topbar"><a className="landing-brand" href="#/"><SiteBrandMark fileId={site['site.logoFileId']} size={22} />{String(site['site.name'] ?? '赛博鱼乐')}</a><nav><button type="button" onClick={() => setSection('help')}>使用帮助</button><button type="button" onClick={() => setSection('feedback')}>意见反馈</button><strong className="brand-link">{currentUser?.displayName ?? '当前用户'}</strong><Button type="primary" onClick={() => { logout(); navigate('/'); }}>退出登录</Button></nav></header>
      <div className="account-layout">
        <aside><div className="account-sidebar-card"><div className="account-avatar"><Avatar size={54} src={typeof userPage['user.avatar.defaultFileId'] === 'string' ? `/api/v1/public/assets/${userPage['user.avatar.defaultFileId']}` : undefined}>{(currentUser?.displayName ?? '用').slice(0, 1)}</Avatar><div><strong>{currentUser?.displayName ?? '当前用户'}</strong><small>{currentUser?.email ?? currentUser?.username ?? '-'}</small></div></div><div className="account-nav">{nav.map((item) => <button key={item.key} className={section === item.key ? 'active' : ''} onClick={() => setSection(item.key)}>{item.icon}{item.label}</button>)}</div></div></aside>
        <main className="account-main">
          {section === 'overview' && <Overview user={currentUser} reports={reports} settings={userPage} onProfile={() => setSection('profile')} />}
          {section === 'profile' && <Profile user={currentUser} onSaved={(nextUser) => { updateUser(nextUser); void meQuery.refetch(); }} />}
          {section === 'reports' && <Reports reports={reports} loading={reportsQuery.isLoading} emptyText={emptyText} />}
          {section === 'feedback' && <Feedback history={feedbackQuery.data?.list ?? []} loading={feedbackQuery.isLoading} settings={userPage} onCreated={() => void feedbackQuery.refetch()} />}
          {section === 'help' && <ContentSection title={String(userPage['support.help.title'] ?? '使用帮助')} content={String(userPage['support.help.content'] ?? '')} />}
          {section === 'about' && <About settings={userPage} />}
        </main>
      </div>
    </div>
  );
}

function AccountHeader({ title, detail }: { title: string; detail: string }) { return <header><h1>{title}</h1><p>{detail}</p></header>; }

function Overview({ user, reports, settings, onProfile }: { user: UserAccount | null; reports: UserMisreport[]; settings: Record<string, unknown>; onProfile: () => void }) {
  const completed = reports.filter((report) => ['CONFIRMED', 'RESOLVED', 'CLOSED'].includes(report.status)).length;
  const welcome = String(settings['user.welcome.template'] ?? '{nickname}，本周已识别 {weekCount} 次').replace('{nickname}', user?.displayName ?? '当前用户').replace('{weekCount}', String(reports.length)).replace('{fishCount}', String(completed));
  return <><AccountHeader title="账号概览" detail={welcome} /><div className="account-banner"><div><strong>APP 与网站用户中心已连接</strong><p>登录同一账号后，可查看提交记录和处理进度。</p></div>{settings['user.nav.profile'] !== false && <Button onClick={onProfile}>编辑资料</Button>}</div>{settings['user.dashboard.showTotal'] !== false && <div className="account-stat-grid"><div className="account-stat"><span>账号</span><strong>{user?.username ?? '-'}</strong><small>已登录用户</small></div><div className="account-stat"><span>提交误报</span><strong>{reports.length} 条</strong><small>当前账号可见</small></div><div className="account-stat"><span>已处理</span><strong>{completed} 条</strong><small className="account-status">已确认 / 已解决</small></div><div className="account-stat"><span>邮箱</span><strong>{user?.email ? '已填写' : '未填写'}</strong><small>{user?.email ?? '可在个人资料中补充'}</small></div></div>}{settings['user.dashboard.showRecent'] !== false && <div className="account-panel"><h2>最近误报动态</h2>{reports.slice(0, 3).map((report) => <div className="activity-row" key={report.id}><span>{report.reportNo} · {report.userNote || '用户反馈'} · {statusText[report.status] ?? report.status}</span><time>{new Date(report.reportedAt).toLocaleString('zh-CN')}</time></div>)}{reports.length === 0 && <div className="empty-state">{String(settings['user.emptyState.text'] ?? '暂无误报记录')}</div>}</div>}</>;
}

function Profile({ user, onSaved }: { user: UserAccount | null; onSaved: (user: UserAccount) => void }) {
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDisplayName(user?.displayName ?? ''); setEmail(user?.email ?? ''); }, [user]);
  const save = async () => { setSaving(true); try { const updated = await userApi.updateMe({ displayName, email: email || null }); message.success('资料已保存'); onSaved(updated); } catch (error) { message.error((error as Error).message); } finally { setSaving(false); } };
  return <><AccountHeader title="个人资料" detail="资料仅用于账号识别与找回，不会公开展示" /><div className="account-panel"><div className="account-form"><label>昵称</label><Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /><span className="hint">当前登录账号显示名</span><label>用户名</label><Input value={user?.username ?? ''} readOnly style={{ background: '#f7f8fa' }} /><span className="hint">用户名不可修改</span><label>邮箱</label><Input value={email} onChange={(event) => setEmail(event.target.value)} /><span className="hint">用于账号通知，留空表示未填写</span><span /><span /><div><Button type="primary" loading={saving} onClick={save}>保存修改</Button></div></div></div></>;
}

function Reports({ reports, loading, emptyText }: { reports: UserMisreport[]; loading: boolean; emptyText: string }) { return <><AccountHeader title="误报记录" detail="查看每次反馈的复核进度与结果" /><div className="account-panel">{loading ? <Spin /> : <div style={{ overflowX: 'auto' }}><table className="account-table"><thead><tr><th>单号</th><th>类型</th><th>状态</th><th>提交时间</th><th>复核结果</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td>{report.reportNo}</td><td>{report.reportType}</td><td className="account-status">{statusText[report.status] ?? report.status}</td><td>{new Date(report.reportedAt).toLocaleString('zh-CN')}</td><td>{report.resolution || report.reviewerNote || '等待复核'}</td></tr>)}</tbody></table>{reports.length === 0 && <div className="empty-state">{emptyText}</div>}</div>}</div></>; }

function Feedback({ history, loading, settings, onCreated }: { history: UserFeedback[]; loading: boolean; settings: Record<string, unknown>; onCreated: () => void }) {
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => { setSaving(true); try { await userApi.createFeedback({ content, contact }); setContent(''); setContact(''); message.success('反馈已提交'); onCreated(); } catch (error) { message.error((error as Error).message); } finally { setSaving(false); } };
  return <><AccountHeader title={String(settings['support.feedback.title'] ?? '意见反馈')} detail="你的建议会由运营人员统一处理" /><div className="account-panel"><div className="account-feedback-form"><Input.TextArea value={content} onChange={(event) => setContent(event.target.value)} placeholder={String(settings['support.feedback.placeholder'] ?? '请描述遇到的问题或建议')} autoSize={{ minRows: 5, maxRows: 10 }} maxLength={2000} /><Input value={contact} onChange={(event) => setContact(event.target.value)} placeholder={String(settings['support.feedback.contactHint'] ?? '可留下联系方式，方便我们联系你')} maxLength={160} /><Button type="primary" loading={saving} disabled={!content.trim()} onClick={submit}>提交反馈</Button></div></div><div className="account-panel account-feedback-history"><h2>反馈记录</h2>{loading ? <Spin /> : history.map((item) => <div className="activity-row" key={item.id}><span>{item.content}</span><time>{new Date(item.createdAt).toLocaleString('zh-CN')} · {item.status === 'PENDING' ? '待处理' : item.status}</time></div>)}{!loading && history.length === 0 && <div className="empty-state">暂无反馈记录</div>}</div></>;
}

function ContentSection({ title, content }: { title: string; content: string }) { return <><AccountHeader title={title} detail="赛博鱼乐使用说明" /><div className="account-panel account-content"><p>{content}</p></div></>; }

function About({ settings }: { settings: Record<string, unknown> }) { return <><AccountHeader title={String(settings['about.title'] ?? '关于赛博鱼乐')} detail="产品与隐私信息" /><div className="account-panel account-content"><h2>产品介绍</h2><p>{String(settings['about.content'] ?? '')}</p><h2>隐私说明</h2><p>{String(settings['about.privacy'] ?? '')}</p></div></>; }

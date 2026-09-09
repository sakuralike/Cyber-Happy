import { useState } from 'react';
import { Avatar, Button, Input, Switch } from 'antd';
import { CheckCircleOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { BrandMark } from '../components/BrandMark';

type AccountSection = 'overview' | 'profile' | 'reports' | 'notifications' | 'security';

const nav: Array<{ key: AccountSection; label: string; icon: React.ReactNode }> = [
  { key: 'overview', label: '账号概览', icon: <UserOutlined /> },
  { key: 'profile', label: '个人资料', icon: <UserOutlined /> },
  { key: 'reports', label: '误报记录', icon: <CheckCircleOutlined /> },
  { key: 'notifications', label: '消息通知', icon: <CheckCircleOutlined /> },
  { key: 'security', label: '安全设置', icon: <LockOutlined /> },
];

const reports = [
  ['MR20260909001', '误报', '复核中', '09-09 08:41', '预计 48 小时内完成', 'info'],
  ['MR20260908047', '漏报', '已确认', '09-08 21:16', '已采纳 · 纳入 v4 训练集', 'success'],
  ['MR20260907098', '误识别', '已驳回', '09-07 19:38', '画面模糊无法判定', 'muted'],
  ['MR20260906033', '误报', '已解决', '09-06 22:47', '已采纳 · v3 模型已修复该场景', 'success'],
];

export function AccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState<AccountSection>('overview');
  const [nickname, setNickname] = useState('陈钓友');
  const [email, setEmail] = useState('chen@example.com');
  const [methods, setMethods] = useState(['野钓']);

  return (
    <div className="account-page">
      <header className="account-topbar"><a className="landing-brand" href="#/"><BrandMark size={22} />赛博鱼乐</a><nav><a href="#/">返回官网</a><a href="#/">使用帮助</a><a href="#/">意见反馈</a><strong style={{ color: '#0b7c6e' }}>{user?.displayName ?? '陈钓友'}</strong><Button type="primary" onClick={async () => { await logout(); navigate('/'); }}>退出登录</Button></nav></header>
      <div className="account-layout">
        <aside>
          <div className="account-sidebar-card"><div className="account-avatar"><Avatar size={54}>陈</Avatar><div><strong>陈钓友</strong><small>138****6688</small></div></div><div className="account-nav">{nav.map((item) => <button key={item.key} className={section === item.key ? 'active' : ''} onClick={() => setSection(item.key)}>{item.icon}{item.label}</button>)}<button disabled><LockOutlined />设备管理</button></div></div>
        </aside>
        <main className="account-main">
          {section === 'overview' && <Overview onProfile={() => setSection('profile')} />}
          {section === 'profile' && <Profile nickname={nickname} setNickname={setNickname} email={email} setEmail={setEmail} methods={methods} setMethods={setMethods} />}
          {section === 'reports' && <Reports />}
          {section === 'notifications' && <Notifications />}
          {section === 'security' && <Security />}
        </main>
      </div>
    </div>
  );
}

function AccountHeader({ title, detail }: { title: string; detail: string }) { return <header><h1>{title}</h1><p>{detail}</p></header>; }

function Overview({ onProfile }: { onProfile: () => void }) {
  return <><AccountHeader title="账号概览" detail="下午好，陈钓友 · 上次出钓 3 天前 · 模型已是最新 v3" /><div className="account-banner"><div><strong>本周已识别 1,284 次漂相</strong><p>比上周多 18%，其中顿口占比 46%</p></div><Button onClick={onProfile}>查看出钓档案</Button></div><div className="account-stat-grid"><div className="account-stat"><span>累计出钓</span><strong>36 次</strong><small>近 30 天 6 次</small></div><div className="account-stat"><span>累计识别</span><strong>12,846 次</strong><small className="account-status">+18% 本周</small></div><div className="account-stat"><span>提交误报</span><strong>17 条</strong><small className="account-status">14 条已采纳</small></div><div className="account-stat"><span>当前模型</span><strong>v3 · INT8</strong><small>已是最新版本</small></div></div><div className="account-panel"><h2>最近动态</h2><div className="activity-row"><span>出钓记录已同步 · 塘口模式 · 识别 84 次</span><time>09-08 17:20</time></div><div className="activity-row"><span>误报 MR20260908047 复核完成 · 已确认为漏报</span><time>09-08 21:16</time></div><div className="activity-row"><span>新模型 v3 已自动下载 · 识别准确率提升 1.2%</span><time>09-06 09:02</time></div></div></>;
}

function Profile({ nickname, setNickname, email, setEmail, methods, setMethods }: { nickname: string; setNickname: (value: string) => void; email: string; setEmail: (value: string) => void; methods: string[]; setMethods: (value: string[]) => void }) {
  const allMethods = ['野钓', '夜钓', '塘口'];
  const toggleMethod = (method: string) => setMethods(methods.includes(method) ? methods.filter((value) => value !== method) : [...methods, method]);
  return <><AccountHeader title="个人资料" detail="资料仅用于账号识别与找回，不会公开展示" /><div className="account-panel"><div className="account-form"><label>昵称</label><Input value={nickname} onChange={(event) => setNickname(event.target.value)} /><span className="hint">2-12 个字符，修改后 30 天内不可再次修改</span><label>手机号</label><Input value="138****6688" readOnly style={{ background: '#f7f8fa' }} /><span className="hint">已验证 · 更换手机号需重新验证</span><label>邮箱</label><Input value={email} onChange={(event) => setEmail(event.target.value)} /><span className="hint">用于接收重要通知，未验证</span><label>常用钓法</label><div className="account-chips">{allMethods.map((method) => <button type="button" key={method} className={`account-chip ${methods.includes(method) ? 'active' : ''}`} onClick={() => toggleMethod(method)}>{method}</button>)}</div><span className="hint" /><div><Button type="primary">保存修改</Button><Button type="text" style={{ marginLeft: 12 }}>重置</Button></div></div></div><div className="account-panel" style={{ marginTop: 20 }}><h2>误报记录 <span style={{ float: 'right', color: '#0b7c6e', fontSize: 13 }}>共 17 条 · 查看全部</span></h2><div style={{ overflowX: 'auto' }}><table className="account-table"><thead><tr><th>单号</th><th>类型</th><th>状态</th><th>提交时间</th><th>复核结果</th></tr></thead><tbody>{reports.map((row) => <tr key={row[0]}>{row.slice(0, 2).map((value) => <td key={value}>{value}</td>)}<td className={`account-status ${row[5]}`}>{row[2]}</td><td>{row[3]}</td><td>{row[4]}</td></tr>)}</tbody></table></div></div></>;
}

function Reports() { return <><AccountHeader title="误报记录" detail="查看每次反馈的复核进度与结果" /><div className="account-panel"><div style={{ overflowX: 'auto' }}><table className="account-table"><thead><tr><th>单号</th><th>类型</th><th>状态</th><th>提交时间</th><th>复核结果</th></tr></thead><tbody>{reports.map((row) => <tr key={row[0]}>{row.slice(0, 2).map((value) => <td key={value}>{value}</td>)}<td className={`account-status ${row[5]}`}>{row[2]}</td><td>{row[3]}</td><td>{row[4]}</td></tr>)}</tbody></table></div></div></>; }

function Notifications() { const notices = [['误报复核结果已更新', '你提交的 MR20260909001 已确认为误触发，感谢反馈', '2 小时前'], ['新模型 v4 可用', '识别准确率提升 1.2%，建议在 Wi-Fi 下下载（68MB）', '昨天 20:14'], ['登录提醒', '你的账号于 09-07 19:22 在华为 Mate60 上登录', '09-07 19:22'], ['出钓周报已生成', '上周出钓 2 次，识别 326 次，顿口占比 51%', '09-06 08:00']]; return <><AccountHeader title="消息通知" detail="误报复核结果、模型更新与账号安全提醒 · 未读 2 条" /><div className="account-panel"><h2>全部通知 <Button type="link" style={{ float: 'right' }}>全部已读</Button></h2>{notices.map(([title, detail, time], index) => <div className="notification-row" key={title}><div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>{index < 2 && <span style={{ width: 8, height: 8, marginTop: 7, borderRadius: '50%', background: '#0b7c6e' }} />}<div><strong style={{ color: '#2c2c34' }}>{title}</strong><div style={{ color: '#8e91a0', fontSize: 13, marginTop: 4 }}>{detail}</div></div></div><time>{time}</time></div>)}</div><div className="account-panel" style={{ marginTop: 20 }}><h2>状态规范 · 空状态与加载状态</h2><div className="empty-state">暂无误报记录<br /><Button style={{ marginTop: 16 }}>提交误报</Button></div></div></>; }

function Security() { return <><AccountHeader title="安全设置" detail="管理登录保护与数据共享偏好" /><div className="account-panel"><h2>安全设置</h2><div className="security-row"><div><strong>两步验证</strong><div className="hint">登录新设备时需输入短信验证码，建议开启</div></div><Switch defaultChecked /></div><div className="security-row"><div><strong>帮助改进识别</strong><div className="hint">误报片段在 Wi-Fi 下匿名上传，用于模型迭代</div></div><Switch /></div><div className="security-row"><div><strong>匿名使用统计</strong><div className="hint">分享匿名使用数据（不含画面），帮助我们改进产品</div></div><Switch defaultChecked /></div><div className="security-row"><div><strong>修改密码</strong><div className="hint">上次修改于 2026-06-12 · 建议每 6 个月更换一次</div></div><Button>修改</Button></div></div></>; }

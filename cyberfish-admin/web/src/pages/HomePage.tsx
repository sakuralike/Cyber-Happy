import { useState } from 'react';
import { Avatar, Button, Empty, Spin } from 'antd';
import { ArrowUpOutlined, DownloadOutlined, MenuOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getSiteConfig } from '../api/siteConfig';
import { BrandMark } from '../components/BrandMark';

const features = [
  ['漂相实时识别', '端侧 YOLO 模型逐帧分析，识别顶漂 / 斜口 / 走漂，抬竿时机自动提醒。'],
  ['抬竿时机提醒', '结合下沉幅度与抖动频率判断，震动 + 语音双通道提醒，不漏口。'],
  ['出钓记录复盘', '自动记录每次咬钩的时间、漂相与结果，生成个人钓档案。'],
  ['误报一键反馈', '识别不准随手标记误报，样本进入增量队列，模型每周迭代。'],
  ['离线可用', '模型本地运行，无信号也能识别，仅在下载新模型与同步记录时需要网络。'],
  ['多场景模式', '野钓 / 夜钓 / 塘口等场景预设，一键切换即时生效。'],
];

const faqs = [
  ['识别需要联网吗？', '不需要。模型在手机本地运行，飞行模式下也能正常识别；仅在下载新模型与同步记录时需要网络。'],
  ['我的画面会被上传吗？', '不会。所有识别在本地完成，画面默认不会离开设备。'],
  ['手机发热或耗电严重怎么办？', '可在设置中选择省电模式，降低采样频率并暂停后台同步。'],
  ['支持哪些手机？', 'Android 9 及以上、4GB 以上内存的机型均可运行。'],
  ['识别不准可以反馈吗？', '可以。在记录详情中标记误报，结构化数据会进入复核队列。'],
];

export function HomePage() {
  const { data, isLoading } = useQuery({ queryKey: ['site-config', 'public'], queryFn: getSiteConfig });
  const [openFaq, setOpenFaq] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const configuredTitle = data?.title?.trim();
  const configuredContent = data?.content?.trim();
  const heroTitle = configuredTitle && configuredTitle !== '赛博鱼乐' ? configuredTitle : '看得懂鱼漂，才懂什么时候提竿';
  const heroCopy = configuredContent && configuredContent !== '智能鱼漂识别与上鱼提醒。' ? configuredContent : '顶漂、顿口、走漂一屏掌握，抬竿时机自动提醒。';
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const sectionLink = (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    scrollTo(id);
  };

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a href="#top" className="landing-brand" onClick={sectionLink('top')}><BrandMark size={22} />赛博鱼乐</a>
        <nav className="landing-links"><a href="#features" onClick={sectionLink('features')}>产品能力</a><a href="#scenarios" onClick={sectionLink('scenarios')}>使用场景</a><a href="#faq" onClick={sectionLink('faq')}>常见问题</a><a href="#/login" style={{ color: '#0b7c6e', fontWeight: 600 }}>登录</a></nav>
        <div className="landing-actions"><Button type="primary" href={data?.downloadUrl ?? '#download'} onClick={data?.downloadUrl ? undefined : (event) => { event.preventDefault(); scrollTo('download'); }} icon={<DownloadOutlined />}>免费下载</Button><button type="button" className="landing-mobile-menu" aria-label="打开菜单" onClick={() => setMobileOpen((value) => !value)}><MenuOutlined /></button></div>
        {mobileOpen && <nav className="mobile-nav"><a href="#features" onClick={(event) => { sectionLink('features')(event); setMobileOpen(false); }}>产品能力</a><a href="#scenarios" onClick={(event) => { sectionLink('scenarios')(event); setMobileOpen(false); }}>使用场景</a><a href="#faq" onClick={(event) => { sectionLink('faq')(event); setMobileOpen(false); }}>常见问题</a><a href="#/login">登录</a></nav>}
      </header>

      <section id="top" className="landing-hero">
        <div>
          <span className="eyebrow">端侧 AI · 漂相识别</span>
          <h1>{heroTitle}</h1>
          <div className="landing-hero-copy">{heroCopy}</div>
          <div className="landing-hero-buttons"><Button type="primary" href={data?.downloadUrl ?? '#download'} onClick={data?.downloadUrl ? undefined : (event) => { event.preventDefault(); scrollTo('download'); }} icon={<DownloadOutlined />}>免费下载</Button><Button href="#features" onClick={(event) => { event.preventDefault(); scrollTo('features'); }} icon={<PlayCircleOutlined />}>查看功能演示</Button></div>
          <div className="trust-row"><div className="trust-avatars"><Avatar>李</Avatar><Avatar>王</Avatar><Avatar>陈</Avatar></div><span>已有 12,846 位钓友在用，累计识别 126 万次</span></div>
        </div>
        <div className="product-mock" aria-label="赛博鱼乐识别界面预览">
          <div className="mock-float left">当前漂相<strong>顶漂</strong></div>
          <div className="mock-screen"><div className="mock-status">LiteRT v3 · 检测中</div><div className="mock-dot" /><div className="mock-title">漂浮稳定</div><div className="mock-wave" /><div className="mock-confidence"><strong>置信度 92%</strong><span>抬竿时机</span>下沉 3.2 px · 抖动 1.4 Hz</div></div>
          <div className="mock-float right">今日识别<strong>1,284</strong></div>
        </div>
      </section>

      <section id="features" className="landing-section alt"><div className="landing-inner"><h2 className="section-title">核心功能模块</h2><p className="section-lead">从识别到复盘，一条链路覆盖出钓全流程；所有识别在手机本地完成，不上传画面。</p><div className="feature-grid">{features.map(([title, copy]) => <article className="feature-card" key={title}><span className="feature-icon"><ArrowUpOutlined /></span><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>

      <section id="scenarios" className="landing-section"><div className="landing-inner"><h2 className="section-title">一套系统，四种钓场</h2><p className="section-lead">不同水域、光线与漂型差异巨大，赛博鱼乐为每一类场景预设识别参数。</p><div className="metric-strip"><div className="metric-item"><strong>98.6%</strong><span>漂相识别准确率</span></div><div className="metric-item"><strong>18ms</strong><span>端侧推理延迟</span></div><div className="metric-item"><strong>126万+</strong><span>累计识别次数</span></div><div className="metric-item"><strong>每周</strong><span>模型迭代频率</span></div></div><div className="scenario-grid"><div className="scenario-card"><div className="scenario-banner">野钓 · 湖库</div><p>远距离有漂精准提醒，支持大段水面和复杂光线。</p></div><div className="scenario-card"><div className="scenario-banner">夜钓 · 光线弱</div><p>弱光中依旧保留漂相轨迹，配合电子漂实时提醒。</p></div><div className="scenario-card"><div className="scenario-banner">塘口 · 高频口</div><p>高频顿口不漏判，适配黑坑与塘口快速换位。</p></div></div></div></section>

      <section className="landing-section alt"><div className="landing-inner"><h2 className="section-title">钓友们怎么说</h2><p className="section-lead">来自应用内与社群的真实评价 · 4.8 分 / 3,200+ 评分</p><div className="testimonial-grid"><article className="testimonial-card">“以前靠感觉，现在看提示。上周野钓一天，中鱼率明显比以前高。”<div className="testimonial-author"><Avatar>李</Avatar><div>老李<small>野钓爱好者 · 使用 4 个月</small></div></div></article><article className="testimonial-card">“夜钓也能看得清，震动提醒很稳，不会漏口。”<div className="testimonial-author"><Avatar>王</Avatar><div>夜钓老王<small>夜钓玩家 · 使用 1 年</small></div></div></article><article className="testimonial-card">“误报能反馈，模型更新后确实准了。”<div className="testimonial-author"><Avatar>陈</Avatar><div>塘口小陈<small>黑坑钓友 · 使用 8 个月</small></div></div></article></div></div></section>

      <section id="faq" className="landing-section"><div className="landing-inner"><h2 className="section-title">常见问题</h2><p className="section-lead">关于识别、隐私与设备的高频疑问</p><div className="faq-list">{faqs.map(([question, answer], index) => <article className="faq-item" key={question} onClick={() => setOpenFaq(openFaq === index ? -1 : index)}><div className="faq-question"><span>{question}</span><span>{openFaq === index ? '−' : '+'}</span></div>{openFaq === index && <div className="faq-answer">{answer}</div>}</article>)}</div></div></section>

      <section id="download" className="landing-cta"><h2>下一次出钓，让鱼漂自己说话</h2><p>下载赛博鱼乐，开启 7 天免费试用</p><Button href={data?.downloadUrl ?? '#'} icon={<DownloadOutlined />}>Android 版下载</Button><Button ghost>iOS · 敬请期待</Button></section>

      <footer className="landing-footer"><div className="footer-grid"><div><div className="landing-brand"><BrandMark size={22} />赛博鱼乐</div><p>端侧 AI 漂相识别，让每一次咬钩都被读懂。</p></div><div><h4>产品</h4><a href="#features" onClick={sectionLink('features')}>产品能力</a><a href="#scenarios" onClick={sectionLink('scenarios')}>使用场景</a><a href="#download" onClick={sectionLink('download')}>更新日志</a></div><div><h4>支持</h4><a href="#faq" onClick={sectionLink('faq')}>常见问题</a><a href="#faq" onClick={sectionLink('faq')}>意见反馈</a><a href="#download" onClick={sectionLink('download')}>联系客服</a></div><div><h4>关于</h4><a href="#top" onClick={sectionLink('top')}>隐私政策</a><a href="#top" onClick={sectionLink('top')}>用户协议</a><a href="#/account">用户中心</a></div></div><div className="footer-bottom"><span>2026 赛博鱼乐 · 请理性钓鱼，遵守当地垂钓规定</span><span>沪ICP备2026000000号</span></div></footer>
      {isLoading && <Spin style={{ position: 'fixed', right: 20, bottom: 20 }} />}
      {!isLoading && !data && <Empty style={{ display: 'none' }} />}
    </div>
  );
}

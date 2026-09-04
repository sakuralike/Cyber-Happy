import { Button, Empty, Spin, Typography } from 'antd';
import { DownloadOutlined, LoginOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getSiteConfig } from '../api/siteConfig';

export function HomePage() {
  const { data, isLoading } = useQuery({ queryKey: ['site-config', 'public'], queryFn: getSiteConfig });

  return (
    <main style={{ minHeight: '100vh', padding: '72px 24px', background: '#0f2027', color: '#fff' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 72 }}>
          <Typography.Text style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>
            <ThunderboltOutlined style={{ color: '#49e5c0', marginRight: 8 }} />赛博鱼乐
          </Typography.Text>
          <Button href="#/login" icon={<LoginOutlined />}>后台登录</Button>
        </div>
        {isLoading ? (
          <Spin />
        ) : data ? (
          <section>
            <Typography.Title style={{ color: '#fff', fontSize: 48, marginBottom: 20 }}>{data.title}</Typography.Title>
            <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.78)', fontSize: 18, whiteSpace: 'pre-wrap', maxWidth: 680 }}>
              {data.content}
            </Typography.Paragraph>
            {data.downloadUrl ? (
              <Button type="primary" size="large" icon={<DownloadOutlined />} href={data.downloadUrl} download>
                下载 APP
              </Button>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: 'rgba(255,255,255,0.65)' }}>暂未提供下载</span>} />
            )}
          </section>
        ) : (
          <Empty description="首页配置暂不可用" />
        )}
      </div>
    </main>
  );
}

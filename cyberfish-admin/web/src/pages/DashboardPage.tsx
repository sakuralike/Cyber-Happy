import { useMemo, useState } from 'react';
import { Card, Col, Row, Statistic, DatePicker, Select, Space, Typography, Spin, Empty } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import * as dashboardApi from '../api/dashboard';
import { appVersionStats } from '../api/appVersion';
import type { DashboardQuery } from '../api/dashboard';
import { ROOT_CAUSE_MAP } from '../utils/constants';
import { formatNumber, formatPercent } from '../utils/format';

const PIE_COLORS = ['#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#a0d911'];

function DeltaText({ delta, unit }: { delta: number; unit: string }) {
  if (delta === 0) return <span style={{ color: '#999' }}>持平</span>;
  const up = delta > 0;
  const color = unit === '%' && delta > 0 ? '#f5222d' : up ? '#52c41a' : '#f5222d';
  return (
    <span style={{ color, fontSize: 13 }}>
      {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {formatPercent(Math.abs(delta))}
    </span>
  );
}

export function DashboardPage() {
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(29, 'day'),
    dayjs(),
  ]);
  const [appVersionCode, setAppVersionCode] = useState<number | undefined>(undefined);
  const [modelVersion, setModelVersion] = useState<string | undefined>(undefined);

  const params: DashboardQuery = useMemo(
    () => ({
      from: range[0].format('YYYY-MM-DD'),
      to: range[1].format('YYYY-MM-DD'),
      appVersionCode,
      modelVersion,
    }),
    [range, appVersionCode, modelVersion],
  );

  const overviewQ = useQuery({ queryKey: ['dash', 'overview', params], queryFn: () => dashboardApi.overview(params) });
  const trendQ = useQuery({ queryKey: ['dash', 'trend', params], queryFn: () => dashboardApi.trend(params) });
  const versionQ = useQuery({ queryKey: ['dash', 'version', params], queryFn: () => dashboardApi.versionDistribution(params) });
  const modelQ = useQuery({ queryKey: ['dash', 'model', params], queryFn: () => dashboardApi.modelUsage(params) });
  const misQ = useQuery({ queryKey: ['dash', 'mis', params], queryFn: () => dashboardApi.misreportAnalysis(params) });
  const healthQ = useQuery({ queryKey: ['dash', 'health', params], queryFn: () => dashboardApi.health(params) });
  const versionsQ = useQuery({ queryKey: ['appVersions', 'stats'], queryFn: appVersionStats });

  const loading = overviewQ.isLoading || trendQ.isLoading;

  const cards = overviewQ.data?.cards ?? [];
  const cardColor = (key: string) => {
    if (key === 'misreportRate') return '#f5222d';
    if (key === 'dau') return '#1677ff';
    if (key === 'mau') return '#722ed1';
    if (key === 'newUsers') return '#52c41a';
    return '#faad14';
  };

  const trendData = trendQ.data?.series ?? [];
  const versionData = (versionQ.data ?? []).map((v) => ({ name: v.versionName, value: v.devices }));
  const modelData = (modelQ.data?.items ?? []).map((m) => ({ name: m.modelVersion, value: m.calls }));
  const rootCauseData = (misQ.data?.rootCauses ?? []).map((r) => ({
    name: ROOT_CAUSE_MAP[r.rootCause as keyof typeof ROOT_CAUSE_MAP]?.label ?? r.rootCause,
    value: r.count,
  }));

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* 筛选栏 */}
      <Card size="small">
        <Space wrap>
          <Typography.Text strong>时间范围</Typography.Text>
          <DatePicker.RangePicker
            value={range}
            onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])}
            allowClear={false}
          />
          <Typography.Text strong>APP 版本</Typography.Text>
          <Select
            allowClear
            placeholder="全部版本"
            style={{ width: 180 }}
            value={appVersionCode}
            onChange={(v) => setAppVersionCode(v)}
            options={[
              { value: 100, label: 'v1.0.0' },
              { value: 110, label: 'v1.1.0' },
              { value: 120, label: 'v1.2.0' },
              { value: 130, label: 'v1.3.0' },
            ]}
          />
          <Typography.Text strong>模型版本</Typography.Text>
          <Select
            allowClear
            placeholder="全部模型"
            style={{ width: 220 }}
            value={modelVersion}
            onChange={(v) => setModelVersion(v)}
            options={[
              { value: 'yolov8n-int8-v1', label: 'yolov8n-int8-v1' },
              { value: 'yolov8n-int8-v2', label: 'yolov8n-int8-v2' },
              { value: 'yolov8n-int8-v3', label: 'yolov8n-int8-v3' },
            ]}
          />
        </Space>
      </Card>

      <Spin spinning={loading}>
        {/* 指标卡 */}
        <Row gutter={[16, 16]}>
          {cards.map((c) => (
            <Col xs={24} sm={12} lg={Math.max(4, Math.floor(24 / Math.max(cards.length, 1)))} key={c.key}>
              <Card>
                <Statistic
                  title={c.label}
                  value={c.unit === '%' ? c.value * 100 : c.value}
                  precision={c.unit === '%' ? 2 : 0}
                  suffix={c.unit === '%' ? '%' : c.unit === '次' ? '次' : c.unit === '人' ? '' : c.unit}
                  valueStyle={{ color: cardColor(c.key) }}
                />
                <DeltaText delta={c.delta} unit={c.unit} />
              </Card>
            </Col>
          ))}
        </Row>

        {/* 趋势 */}
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={12}>
            <Card title="活跃趋势（DAU / 新增用户）" size="small">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="dau" name="DAU" stroke="#1677ff" dot={false} />
                  <Line type="monotone" dataKey="newUsers" name="新增用户" stroke="#52c41a" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="模型调用量 / 触发量" size="small">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="modelCalls" name="模型调用" stroke="#faad14" dot={false} />
                  <Line type="monotone" dataKey="triggers" name="触发量" stroke="#f5222d" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>

        {/* 分布 */}
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={8}>
            <Card title="APP 版本分布" size="small">
              {versionData.length === 0 ? (
                <Empty description="暂无数据" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={versionData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
                      {versionData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card title="模型调用分布" size="small">
              {modelData.length === 0 ? (
                <Empty description="暂无数据" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={modelData} dataKey="value" nameKey="name" outerRadius={90} label>
                      {modelData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card title="误报根因分布" size="small">
              {rootCauseData.length === 0 ? (
                <Empty description="暂无数据" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={rootCauseData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="数量" fill="#f5222d" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </Col>
        </Row>

        {/* 健康度 */}
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card
              title="运行健康度"
              size="small"
              extra={
                <Typography.Text type="secondary">
                  误报率阈值 8%，推理 P95 目标 ≤ 200ms
                </Typography.Text>
              }
            >
              <Row gutter={16}>
                <Col span={6}>
                  <Statistic title="崩溃率" value={formatPercent(healthQ.data?.crashRate)} />
                </Col>
                <Col span={6}>
                  <Statistic title="崩溃次数" value={formatNumber(healthQ.data?.crashCount)} suffix="次" />
                </Col>
                <Col span={6}>
                  <Statistic title="推理耗时 P95" value={formatNumber(healthQ.data?.inferenceP95Ms)} suffix="ms" />
                </Col>
                <Col span={6}>
                  <Statistic title="活跃设备数" value={formatNumber(healthQ.data?.activeDevices)} />
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Spin>
    </Space>
  );
}

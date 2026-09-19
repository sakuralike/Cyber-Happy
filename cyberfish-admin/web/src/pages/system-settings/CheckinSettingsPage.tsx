import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  message,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  TimePicker,
} from "antd";
import dayjs from "dayjs";
import {
  CloudUploadOutlined,
  SaveOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  discardSettings,
  getSettings,
  getCheckInStats,
  publishSettings,
  saveSettings,
  listCheckInRiskEvents,
} from "../../api/systemSettings";
import { notifyError } from "../../api/client";
import { useAuth } from "../../store/auth";
import {
  PublishStatusBar,
  SectionTitle,
  SettingSwitchRow,
  SettingsHeader,
} from "./SettingsShared";

type Values = Record<string, any>;
const SCOPES = ["CHECKIN_BASIC", "CHECKIN_REWARD", "CHECKIN_RISK"] as const;
const ICON_OPTIONS = [
  "stamp_rod", "stamp_regular", "stamp_expert", "stamp_master",
  "medal_bronze", "medal_silver", "medal_gold", "medal_platinum",
  "title_beginner", "title_regular", "title_master", "title_fishing_god",
].map((value) => ({ value, label: value }));

function toTimePickerValue(value: unknown) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return value;
  const [hour, minute] = value.split(":").map(Number);
  return dayjs().hour(hour).minute(minute).second(0).millisecond(0);
}

export function CheckinSettingsPage() {
  const queryClient = useQueryClient();
  const { hasPerm } = useAuth();
  const canWrite = hasPerm("siteConfig:write");
  const canPublish = hasPerm("siteConfig:publish");
  const [activeKey, setActiveKey] = useState("basic");
  const [basicForm] = Form.useForm<Values>();
  const [rewardForm] = Form.useForm<Values>();
  const [riskForm] = Form.useForm<Values>();
  const basic = useQuery({ queryKey: ["admin", "settings", "CHECKIN_BASIC"], queryFn: () => getSettings("CHECKIN_BASIC") });
  const reward = useQuery({ queryKey: ["admin", "settings", "CHECKIN_REWARD"], queryFn: () => getSettings("CHECKIN_REWARD") });
  const risk = useQuery({ queryKey: ["admin", "settings", "CHECKIN_RISK"], queryFn: () => getSettings("CHECKIN_RISK") });
  const [riskReason, setRiskReason] = useState<string>();
  const [riskFrom, setRiskFrom] = useState(() => dayjs().subtract(7, "day").format("YYYY-MM-DD"));
  const [riskTo, setRiskTo] = useState(() => dayjs().format("YYYY-MM-DD"));
  const riskEvents = useQuery({
    queryKey: ["admin", "check-in", "risk-events", riskReason, riskFrom, riskTo],
    queryFn: () => listCheckInRiskEvents({ page: 1, pageSize: 50, reason: riskReason, from: riskFrom, to: `${riskTo}T23:59:59+08:00` }),
  });
  const checkInStats = useQuery({
    queryKey: ["admin", "check-in", "stats"],
    queryFn: () => getCheckInStats(),
  });

  useEffect(() => { if (basic.data) basicForm.setFieldsValue(basic.data.values); }, [basic.data, basicForm]);
  useEffect(() => { if (reward.data) rewardForm.setFieldsValue(reward.data.values); }, [reward.data, rewardForm]);
  useEffect(() => { if (risk.data) riskForm.setFieldsValue(risk.data.values); }, [risk.data, riskForm]);

  const refresh = () => Promise.all([
    ...SCOPES.map((scope) => queryClient.invalidateQueries({ queryKey: ["admin", "settings", scope] })),
    queryClient.invalidateQueries({ queryKey: ["admin", "config-version"] }),
    queryClient.invalidateQueries({ queryKey: ["admin", "config-changes"] }),
    queryClient.invalidateQueries({ queryKey: ["admin", "config-revisions"] }),
    queryClient.invalidateQueries({ queryKey: ["public-config"] }),
  ]);

  const saveMutation = useMutation({
    mutationFn: ({ scope, values }: { scope: typeof SCOPES[number]; values: Values }) => saveSettings(scope, values),
    onSuccess: async () => { message.success("签到配置草稿已保存"); await refresh(); },
    onError: notifyError,
  });
  const discardMutation = useMutation({
    mutationFn: (scope: typeof SCOPES[number]) => discardSettings(scope),
    onSuccess: async () => { message.success("签到配置草稿已放弃"); await refresh(); },
    onError: notifyError,
  });
  const publishMutation = useMutation({
    mutationFn: () => publishSettings({ scopes: [...SCOPES], note: "发布签到配置" }),
    onSuccess: async (revision) => { message.success(`签到配置 v${revision.version} 已发布`); await refresh(); },
    onError: notifyError,
  });

  const activeForm = activeKey === "basic" ? basicForm : activeKey === "reward" ? rewardForm : riskForm;
  const activeScope = activeKey === "basic" ? "CHECKIN_BASIC" : activeKey === "reward" ? "CHECKIN_REWARD" : "CHECKIN_RISK";
  const submitActive = () => activeForm.submit();
  const tabs = useMemo(() => [
    { key: "basic", label: "基础规则", children: <BasicTab form={basicForm} disabled={!canWrite} onSubmit={(values) => saveMutation.mutate({ scope: "CHECKIN_BASIC", values })} /> },
    { key: "reward", label: "奖励规则", children: <RewardTab form={rewardForm} disabled={!canWrite} onSubmit={(values) => saveMutation.mutate({ scope: "CHECKIN_REWARD", values })} /> },
    { key: "risk", label: "风控与异常", children: <RiskTab form={riskForm} disabled={!canWrite} onSubmit={(values) => saveMutation.mutate({ scope: "CHECKIN_RISK", values })} riskEvents={riskEvents.data?.list ?? []} riskReason={riskReason} setRiskReason={setRiskReason} riskFrom={riskFrom} setRiskFrom={setRiskFrom} riskTo={riskTo} setRiskTo={setRiskTo} stats={checkInStats.data} statsLoading={checkInStats.isLoading} /> },
  ], [basicForm, rewardForm, riskForm, canWrite, saveMutation, riskEvents.data?.list, checkInStats.data, checkInStats.isLoading]);

  return (
    <div className="settings-page">
      <SettingsHeader title="签到设置" description="配置签到开关、开放时段、奖励梯度与风控规则；保存为草稿，发布后对 APP 生效。" actions={
        <Space>
          {canWrite && <Button icon={<UndoOutlined />} onClick={() => discardMutation.mutate(activeScope)}>放弃草稿</Button>}
          {canWrite && <Button icon={<SaveOutlined />} onClick={submitActive}>保存草稿</Button>}
          {canPublish && <Button type="primary" icon={<CloudUploadOutlined />} loading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>发布生效</Button>}
        </Space>
      } />
      <PublishStatusBar />
      <Tabs activeKey={activeKey} onChange={setActiveKey} items={tabs} />
    </div>
  );
}

function BasicTab({ form, disabled, onSubmit }: { form: any; disabled: boolean; onSubmit: (values: Values) => void }) {
  return <Form form={form} layout="vertical" disabled={disabled} onFinish={onSubmit} initialValues={{ timezone: "Asia/Shanghai", dailyWindowStart: "00:00", dailyWindowEnd: "23:59" }}>
    <Card title="活动状态"><SettingSwitchRow title="签到功能" description="关闭后 APP 仍可查看历史记录，但不能提交新签到。" control={<Form.Item name="enabled" valuePropName="checked" noStyle><Switch /></Form.Item>} />
      <Form.Item name="activityTitle" label="活动标题" rules={[{ required: true, max: 20 }]}><Input /></Form.Item>
      <Form.Item name="announcement" label="暂停/结束提示"><Input maxLength={100} showCount /></Form.Item>
    </Card>
    <Card title="开放时间" style={{ marginTop: 16 }}>
      <SettingSwitchRow title="限制每日签到时段" description="超出时段时 APP 按钮置灰并展示时间范围。" control={<Form.Item name="dailyWindowEnabled" valuePropName="checked" noStyle><Switch /></Form.Item>} />
      <Space align="start"><Form.Item name="dailyWindowStart" label="每日开始" getValueProps={(value) => ({ value: toTimePickerValue(value) })} getValueFromEvent={(value) => value?.format("HH:mm")}><TimePicker format="HH:mm" /></Form.Item><Form.Item name="dailyWindowEnd" label="每日结束" getValueProps={(value) => ({ value: toTimePickerValue(value) })} getValueFromEvent={(value) => value?.format("HH:mm")}><TimePicker format="HH:mm" /></Form.Item></Space>
      <Form.Item name="timezone" label="自然日时区"><Input disabled /></Form.Item>
      <Form.Item name="activityStartAt" label="活动开始（可选）"><Input placeholder="2026-10-01T00:00:00+08:00" /></Form.Item>
      <Form.Item name="activityEndAt" label="活动结束（可选）"><Input placeholder="2026-12-31T23:59:59+08:00" /></Form.Item>
    </Card>
  </Form>;
}

function RewardTab({ form, disabled, onSubmit }: { form: any; disabled: boolean; onSubmit: (values: Values) => void }) {
  return <Form form={form} layout="vertical" disabled={disabled} onFinish={onSubmit} initialValues={{ rewardMode: "BADGE", cycleLength: 7, cycleStrategy: "LOOP", rewards: [] }}>
    <Card title="奖励模式"><Space><Form.Item name="rewardMode" label="奖励类型"><Select style={{ width: 180 }} options={[{ value: "BADGE", label: "荣誉勋章" }]} /></Form.Item><Form.Item name="cycleLength" label="周期长度"><Select style={{ width: 140 }} options={[7, 14, 30].map((value) => ({ value, label: `${value} 天` }))} /></Form.Item><Form.Item name="cycleStrategy" label="周期策略"><Select style={{ width: 160 }} options={[{ value: "LOOP", label: "循环累计" }, { value: "ONCE", label: "仅首周期" }]} /></Form.Item></Space></Card>
    <Card title="奖励梯度" style={{ marginTop: 16 }}><Form.List name="rewards">{(fields, { add, remove }) => <>{fields.map((field) => <Space key={field.key} align="baseline"><Form.Item {...field} name={[field.name, "day"]} rules={[{ required: true }]}><InputNumber min={1} max={120} placeholder="天数" /></Form.Item><Form.Item {...field} name={[field.name, "type"]}><Select style={{ width: 120 }} options={["STAMP", "MEDAL", "TITLE"].map((value) => ({ value, label: value }))} /></Form.Item><Form.Item {...field} name={[field.name, "name"]}><Input placeholder="奖励名称" /></Form.Item><Form.Item {...field} name={[field.name, "iconKey"]}><Select style={{ width: 180 }} options={ICON_OPTIONS} placeholder="预置图标" /></Form.Item><Form.Item {...field} name={[field.name, "milestone"]} valuePropName="checked"><Switch checkedChildren="里程碑" /></Form.Item><Button type="link" onClick={() => remove(field.name)}>删除</Button></Space>)}<Button onClick={() => add({ type: "STAMP", milestone: false })}>添加奖励</Button></>}</Form.List></Card>
  </Form>;
}

function RiskTab({ form, disabled, onSubmit, riskEvents, riskReason, setRiskReason, riskFrom, setRiskFrom, riskTo, setRiskTo, stats, statsLoading }: { form: any; disabled: boolean; onSubmit: (values: Values) => void; riskEvents: Array<{ id: string; createdAt: string; reason: string; username: string | null; deviceId: string | null; ip: string | null; metadata?: Record<string, unknown> }>; riskReason?: string; setRiskReason: (value?: string) => void; riskFrom: string; setRiskFrom: (value: string) => void; riskTo: string; setRiskTo: (value: string) => void; stats?: { daily: Array<{ date: string; attempts: number; success: number; uniqueUsers: number; riskEvents: number }>; totals: { attempts: number; success: number; uniqueUsers: number; riskEvents: number } }; statsLoading: boolean }) {
  return <Form form={form} layout="vertical" disabled={disabled} onFinish={onSubmit} initialValues={{ maxDevicePerUser: 3, ipRateLimitPerMin: 10, suspiciousThreshold: 5, auditReplayEnabled: true, backfillEnabled: false }}>
    <Card title="频次与风控"><Form.Item name="maxDevicePerUser" label="单账号设备上限"><InputNumber min={1} max={10} /></Form.Item><Form.Item name="ipRateLimitPerMin" label="单 IP 每分钟上限"><InputNumber min={1} max={60} /></Form.Item><Form.Item name="suspiciousThreshold" label="同设备多账号阈值"><InputNumber min={2} max={20} /></Form.Item><SettingSwitchRow title="异常请求全量日志" description="记录签到接口失败请求，便于审计排查。" control={<Form.Item name="auditReplayEnabled" valuePropName="checked" noStyle><Switch /></Form.Item>} /><SettingSwitchRow title="补签功能（二期）" description="当前版本锁定关闭。" control={<Form.Item name="backfillEnabled" valuePropName="checked" noStyle><Switch disabled /></Form.Item>} /></Card>
    <Card title="近 7 日运营统计" style={{ marginTop: 16 }}>
      <Space size="large" wrap style={{ marginBottom: 16 }}>
        <Statistic title="签到请求" value={stats?.totals.attempts ?? 0} />
        <Statistic title="签到成功" value={stats?.totals.success ?? 0} />
        <Statistic title="去重用户" value={stats?.totals.uniqueUsers ?? 0} />
        <Statistic title="风控事件" value={stats?.totals.riskEvents ?? 0} />
      </Space>
      <Table rowKey="date" size="small" pagination={false} loading={statsLoading} dataSource={stats?.daily ?? []} columns={[{ title: "日期", dataIndex: "date" }, { title: "签到请求", dataIndex: "attempts" }, { title: "签到成功", dataIndex: "success" }, { title: "去重用户", dataIndex: "uniqueUsers" }, { title: "风控事件", dataIndex: "riskEvents" }]} />
    </Card>
    <Card title="风控事件" style={{ marginTop: 16 }}>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input type="date" value={riskFrom} onChange={(event) => setRiskFrom(event.target.value)} />
        <Input type="date" value={riskTo} onChange={(event) => setRiskTo(event.target.value)} />
        <Select allowClear placeholder="事件类型" style={{ width: 180 }} value={riskReason} onChange={setRiskReason} options={["CHECK_IN_ATTEMPT", "IP_RATE_LIMIT", "DEVICE_LIMIT", "DEVICE_MULTI_ACCOUNT"].map((value) => ({ value, label: value }))} />
      </Space>
      <Table rowKey="id" size="small" pagination={false} loading={false} dataSource={riskEvents} expandable={{ expandedRowRender: (record) => <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(record.metadata ?? {}, null, 2)}</pre> }} columns={[{ title: "时间", dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString("zh-CN") }, { title: "原因", dataIndex: "reason" }, { title: "账号", dataIndex: "username", render: (value: string | null) => value ?? "-" }, { title: "设备", dataIndex: "deviceId", render: (value: string | null) => value ?? "-" }, { title: "IP", dataIndex: "ip", render: (value: string | null) => value ?? "-" }]} />
    </Card>
  </Form>;
}

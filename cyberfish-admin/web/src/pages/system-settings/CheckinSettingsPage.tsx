import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Alert,
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
  CrownOutlined,
  TagOutlined,
  SaveOutlined,
  TrophyOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  discardSettings,
  getSettings,
  getCheckInStats,
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
const ICON_KEYS = [
  "stamp_rod", "stamp_regular", "stamp_expert", "stamp_master",
  "medal_bronze", "medal_silver", "medal_gold", "medal_platinum",
  "title_beginner", "title_regular", "title_master", "title_fishing_god",
];

const ICON_OPTIONS = ICON_KEYS.map((value) => ({
  value,
  label: (
    <Space size={6}>
      {value.startsWith("medal_") ? <TrophyOutlined /> : value.startsWith("title_") ? <CrownOutlined /> : <TagOutlined />}
      <span>{value}</span>
    </Space>
  ),
}));

function toTimePickerValue(value: unknown) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return value;
  const [hour, minute] = value.split(":").map(Number);
  return dayjs().hour(hour).minute(minute).second(0).millisecond(0);
}

function formPath(value: string | Array<string | number>): Array<string | number> {
  return Array.isArray(value) ? value : value.split(".").filter(Boolean);
}

function applySettingFieldError(error: unknown, form: any, values?: Values): void {
  const details = (error as {
    details?: {
      field?: string | Array<string | number>;
      issues?: Array<{ path?: string | Array<string | number>; message?: string }>;
    };
  })?.details;
  const fallbackMessage = error instanceof Error ? error.message : "配置校验失败";
  const fields: Array<{ name: Array<string | number>; errors: string[] }> = [];

  if (details?.field) {
    fields.push({ name: formPath(details.field), errors: [fallbackMessage] });
  }
  for (const issue of details?.issues ?? []) {
    if (!issue.path) continue;
    const path = formPath(issue.path);
    if (path[0] === "items" && typeof path[1] === "number" && values) {
      const key = Object.keys(values)[path[1]];
      if (key) fields.push({ name: [key], errors: [issue.message ?? fallbackMessage] });
    } else if (typeof path[0] === "number" && Array.isArray(values?.rewards)) {
      fields.push({ name: ["rewards", ...path], errors: [issue.message ?? fallbackMessage] });
    } else if (path.length > 0) {
      fields.push({ name: path, errors: [issue.message ?? fallbackMessage] });
    }
  }
  if (fields.length > 0) form.setFields(fields);
}

function mergedSettingsValues(data: { values: Values; drafts: Values }): Values {
  const merged = { ...data.values, ...data.drafts };
  if (Array.isArray(merged.rewards)) {
    merged.rewards = [...merged.rewards].sort((left, right) => Number(left?.day ?? 0) - Number(right?.day ?? 0));
  }
  return merged;
}

function shanghaiDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateKey(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function shanghaiBoundary(date: string, endOfDay: boolean): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  return `${date}T${endOfDay ? "23:59:59.999" : "00:00:00"}+08:00`;
}

export function CheckinSettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPerm } = useAuth();
  const canWrite = hasPerm("siteConfig:write");
  const canPublish = hasPerm("siteConfig:publish");
  const canViewRisk = hasPerm("checkInRisk:read");
  const [activeKey, setActiveKey] = useState("basic");
  const [basicForm] = Form.useForm<Values>();
  const [rewardForm] = Form.useForm<Values>();
  const [riskForm] = Form.useForm<Values>();
  const basic = useQuery({ queryKey: ["admin", "settings", "CHECKIN_BASIC"], queryFn: () => getSettings("CHECKIN_BASIC") });
  const reward = useQuery({ queryKey: ["admin", "settings", "CHECKIN_REWARD"], queryFn: () => getSettings("CHECKIN_REWARD") });
  const risk = useQuery({ queryKey: ["admin", "settings", "CHECKIN_RISK"], queryFn: () => getSettings("CHECKIN_RISK") });
  const [riskReason, setRiskReason] = useState<string>();
  const [riskTo, setRiskTo] = useState(() => shanghaiDateKey());
  const [riskFrom, setRiskFrom] = useState(() => shiftDateKey(shanghaiDateKey(), -6));
  const riskRangeInvalid = Boolean(riskFrom && riskTo && riskFrom > riskTo);
  const riskEvents = useQuery({
    queryKey: ["admin", "check-in", "risk-events", riskReason, riskFrom, riskTo],
    queryFn: () => listCheckInRiskEvents({
      page: 1,
      pageSize: 50,
      ...(riskReason ? { reason: riskReason } : {}),
      ...(shanghaiBoundary(riskFrom, false) ? { from: shanghaiBoundary(riskFrom, false) } : {}),
      ...(shanghaiBoundary(riskTo, true) ? { to: shanghaiBoundary(riskTo, true) } : {}),
    }),
    enabled: canViewRisk && !riskRangeInvalid,
  });
  const checkInStats = useQuery({
    queryKey: ["admin", "check-in", "stats", riskFrom, riskTo],
    queryFn: () => getCheckInStats({ from: riskFrom, to: riskTo }),
    enabled: canViewRisk && !riskRangeInvalid,
  });

  useEffect(() => { if (basic.data) basicForm.setFieldsValue(mergedSettingsValues(basic.data)); }, [basic.data, basicForm]);
  useEffect(() => { if (reward.data) rewardForm.setFieldsValue(mergedSettingsValues(reward.data)); }, [reward.data, rewardForm]);
  useEffect(() => { if (risk.data) riskForm.setFieldsValue(mergedSettingsValues(risk.data)); }, [risk.data, riskForm]);

  const refresh = () => Promise.all([
    ...SCOPES.map((scope) => queryClient.invalidateQueries({ queryKey: ["admin", "settings", scope] })),
    queryClient.invalidateQueries({ queryKey: ["admin", "config-version"] }),
    queryClient.invalidateQueries({ queryKey: ["admin", "config-changes"] }),
    queryClient.invalidateQueries({ queryKey: ["admin", "config-revisions"] }),
    queryClient.invalidateQueries({ queryKey: ["public-config"] }),
  ]);

  const saveMutation = useMutation({
    mutationFn: ({ scope, values }: { scope: typeof SCOPES[number]; values: Values }) => saveSettings(
      scope,
      scope === "CHECKIN_REWARD" && Array.isArray(values.rewards)
        ? { ...values, rewards: [...values.rewards].sort((left, right) => Number(left?.day ?? 0) - Number(right?.day ?? 0)) }
        : values,
    ),
    onSuccess: async () => { message.success("签到配置草稿已保存"); await refresh(); },
    onError: (error, variables) => {
      const form = variables.scope === "CHECKIN_BASIC" ? basicForm : variables.scope === "CHECKIN_REWARD" ? rewardForm : riskForm;
      applySettingFieldError(error, form, variables.values);
      notifyError(error);
    },
  });
  const discardMutation = useMutation({
    mutationFn: (scope: typeof SCOPES[number]) => discardSettings(scope),
    onSuccess: async () => { message.success("签到配置草稿已放弃"); await refresh(); },
    onError: notifyError,
  });
  const activeForm = activeKey === "basic" ? basicForm : activeKey === "reward" ? rewardForm : riskForm;
  const activeScope = activeKey === "basic" ? "CHECKIN_BASIC" : activeKey === "reward" ? "CHECKIN_REWARD" : "CHECKIN_RISK";
  const submitActive = () => activeForm.submit();
  const tabs = useMemo(() => [
    { key: "basic", label: "基础规则", children: <BasicTab form={basicForm} disabled={!canWrite} onSubmit={(values) => saveMutation.mutate({ scope: "CHECKIN_BASIC", values })} /> },
    { key: "reward", label: "奖励规则", children: <RewardTab form={rewardForm} disabled={!canWrite} onSubmit={(values) => saveMutation.mutate({ scope: "CHECKIN_REWARD", values })} /> },
    { key: "risk", label: "风控与异常", children: <RiskTab form={riskForm} disabled={!canWrite} onSubmit={(values) => saveMutation.mutate({ scope: "CHECKIN_RISK", values })} canViewRisk={canViewRisk} riskEvents={riskEvents.data?.list ?? []} riskReason={riskReason} setRiskReason={setRiskReason} riskFrom={riskFrom} setRiskFrom={setRiskFrom} riskTo={riskTo} setRiskTo={setRiskTo} riskRangeInvalid={riskRangeInvalid} riskEventsLoading={riskEvents.isLoading || riskEvents.isFetching} riskEventsError={riskEvents.error} stats={checkInStats.data} statsLoading={checkInStats.isLoading || checkInStats.isFetching} statsError={checkInStats.error} /> },
  ], [basicForm, rewardForm, riskForm, canWrite, canViewRisk, saveMutation, riskEvents.data?.list, riskEvents.isLoading, riskEvents.isFetching, riskEvents.error, checkInStats.data, checkInStats.isLoading, checkInStats.isFetching, checkInStats.error, riskRangeInvalid, riskFrom, riskTo]);

  return (
    <div className="settings-page">
      <SettingsHeader title="签到设置" description="配置签到开关、开放时段、奖励梯度与风控规则；保存为草稿，发布后对 APP 生效。" actions={
        <Space>
          {canWrite && <Button icon={<UndoOutlined />} onClick={() => discardMutation.mutate(activeScope)}>放弃草稿</Button>}
          {canWrite && <Button icon={<SaveOutlined />} onClick={submitActive}>保存草稿</Button>}
          {canPublish && <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => navigate("/settings/publish")}>审阅并发布</Button>}
        </Space>
      } />
      <PublishStatusBar />
      <Tabs activeKey={activeKey} onChange={setActiveKey} items={tabs} />
    </div>
  );
}

function BasicTab({ form, disabled, onSubmit }: { form: any; disabled: boolean; onSubmit: (values: Values) => void }) {
  return <Form form={form} layout="vertical" disabled={disabled} onFinish={onSubmit} initialValues={{ timezone: "Asia/Shanghai", dailyWindowStart: "06:00", dailyWindowEnd: "23:00" }}>
    <Card title="活动状态"><SettingSwitchRow title="签到功能" description="关闭后 APP 仍可查看历史记录，但不能提交新签到。" control={<Form.Item name="enabled" valuePropName="checked" noStyle><Switch /></Form.Item>} />
      <Form.Item name="activityTitle" label="活动标题" rules={[{ required: true, max: 20 }]}><Input /></Form.Item>
      <Form.Item name="announcement" label="暂停/结束提示"><Input maxLength={100} showCount /></Form.Item>
    </Card>
    <Card title="开放时间" style={{ marginTop: 16 }}>
      <SettingSwitchRow title="限制每日签到时段" description="超出时段时 APP 按钮置灰并展示时间范围。" control={<Form.Item name="dailyWindowEnabled" valuePropName="checked" noStyle><Switch /></Form.Item>} />
      <Space align="start"><Form.Item name="dailyWindowStart" label="每日开始" getValueProps={(value) => ({ value: toTimePickerValue(value) })} getValueFromEvent={(value) => value?.format("HH:mm")}><TimePicker format="HH:mm" /></Form.Item><Form.Item name="dailyWindowEnd" label="每日结束" dependencies={["dailyWindowStart", "dailyWindowEnabled"]} rules={[({ getFieldValue }) => ({ validator: async (_, value) => { if (!getFieldValue("dailyWindowEnabled") || !value || value > getFieldValue("dailyWindowStart")) return; throw new Error("每日结束时间必须晚于开始时间"); } })]} getValueProps={(value) => ({ value: toTimePickerValue(value) })} getValueFromEvent={(value) => value?.format("HH:mm")}><TimePicker format="HH:mm" /></Form.Item></Space>
      <Form.Item name="timezone" label="自然日时区"><Input disabled /></Form.Item>
      <Form.Item name="activityStartAt" label="活动开始（可选）"><Input placeholder="2026-10-01T00:00:00+08:00" /></Form.Item>
      <Form.Item name="activityEndAt" label="活动结束（可选）" dependencies={["activityStartAt"]} rules={[({ getFieldValue }) => ({ validator: async (_, value) => { const start = getFieldValue("activityStartAt"); if (!value || !start || (dayjs(value).isValid() && dayjs(value).isAfter(dayjs(start)))) return; throw new Error("活动结束时间必须晚于开始时间"); } })]}><Input placeholder="2026-12-31T23:59:59+08:00" /></Form.Item>
    </Card>
  </Form>;
}

function RewardTab({ form, disabled, onSubmit }: { form: any; disabled: boolean; onSubmit: (values: Values) => void }) {
  const cycleLength = Form.useWatch("cycleLength", form) ?? 7;
  return <Form form={form} layout="vertical" disabled={disabled} onFinish={onSubmit} initialValues={{ rewardMode: "BADGE", cycleLength: 7, cycleStrategy: "LOOP", rewards: [] }}>
    <Card title="奖励模式"><Space><Form.Item name="rewardMode" label="奖励类型"><Select style={{ width: 180 }} options={[{ value: "BADGE", label: "荣誉勋章" }]} /></Form.Item><Form.Item name="cycleLength" label="周期长度"><Select style={{ width: 140 }} options={[7, 14, 30].map((value) => ({ value, label: `${value} 天` }))} /></Form.Item><Form.Item name="cycleStrategy" label="周期策略"><Select style={{ width: 160 }} options={[{ value: "LOOP", label: "循环累计" }, { value: "ONCE", label: "仅首周期" }]} /></Form.Item></Space></Card>
    <Card title="奖励梯度" style={{ marginTop: 16 }}><Form.List name="rewards" rules={[{ validator: async (_, rewards = []) => { const days = rewards.map((item: Values) => item?.day).filter(Boolean); const names = rewards.map((item: Values) => item?.name?.trim()).filter(Boolean); if (new Set(days).size !== days.length) throw new Error("奖励天数不能重复"); if (new Set(names).size !== names.length) throw new Error("奖励名称不能重复"); if (rewards.filter((item: Values) => item?.milestone).length > 6) throw new Error("里程碑奖励最多 6 项"); } }]}>{(fields, { add, remove }, { errors }) => <>{fields.map((field) => <Space key={field.key} align="baseline"><Form.Item {...field} name={[field.name, "day"]} rules={[{ required: true, message: "请输入奖励天数" }]}><InputNumber min={1} max={cycleLength * 4} placeholder="天数" /></Form.Item><Form.Item {...field} name={[field.name, "type"]} rules={[{ required: true, message: "请选择奖励类型" }]}><Select style={{ width: 120 }} options={["STAMP", "MEDAL", "TITLE"].map((value) => ({ value, label: value }))} /></Form.Item><Form.Item {...field} name={[field.name, "name"]} rules={[{ required: true, message: "请输入奖励名称" }]}><Input placeholder="奖励名称" /></Form.Item><Form.Item {...field} name={[field.name, "iconKey"]} rules={[{ required: true, message: "请选择预置图标" }]}><Select style={{ width: 180 }} options={ICON_OPTIONS} placeholder="预置图标" /></Form.Item><Form.Item {...field} name={[field.name, "milestone"]} valuePropName="checked"><Switch checkedChildren="里程碑" /></Form.Item><Button type="link" onClick={() => remove(field.name)}>删除</Button></Space>)}<Form.ErrorList errors={errors} /><Button onClick={() => add({ type: "STAMP", milestone: false })}>添加奖励</Button></>}</Form.List></Card>
  </Form>;
}

function RiskTab({ form, disabled, onSubmit, canViewRisk, riskEvents, riskReason, setRiskReason, riskFrom, setRiskFrom, riskTo, setRiskTo, riskRangeInvalid, riskEventsLoading, riskEventsError, stats, statsLoading, statsError }: { form: any; disabled: boolean; onSubmit: (values: Values) => void; canViewRisk: boolean; riskEvents: Array<{ id: string; createdAt: string; reason: string; username: string | null; deviceId: string | null; ip: string | null; metadata?: Record<string, unknown> }>; riskReason?: string; setRiskReason: (value?: string) => void; riskFrom: string; setRiskFrom: (value: string) => void; riskTo: string; setRiskTo: (value: string) => void; riskRangeInvalid: boolean; riskEventsLoading: boolean; riskEventsError: unknown; stats?: { daily: Array<{ date: string; attempts: number; success: number; uniqueUsers: number; riskEvents: number }>; totals: { attempts: number; success: number; uniqueUsers: number; riskEvents: number } }; statsLoading: boolean; statsError: unknown }) {
  return <Form form={form} layout="vertical" disabled={disabled} onFinish={onSubmit} initialValues={{ maxDevicePerUser: 3, ipRateLimitPerMin: 10, suspiciousThreshold: 5, auditReplayEnabled: true, backfillEnabled: false }}>
    <Card title="频次与风控"><Form.Item name="maxDevicePerUser" label="单账号设备上限"><InputNumber min={1} max={10} /></Form.Item><Form.Item name="ipRateLimitPerMin" label="单 IP 每分钟上限"><InputNumber min={1} max={60} /></Form.Item><Form.Item name="suspiciousThreshold" label="同设备多账号阈值"><InputNumber min={2} max={20} /></Form.Item><SettingSwitchRow title="异常请求全量日志" description="记录签到接口失败请求，便于审计排查。" control={<Form.Item name="auditReplayEnabled" valuePropName="checked" noStyle><Switch /></Form.Item>} /><SettingSwitchRow title="补签功能（二期）" description="当前版本锁定关闭。" control={<Form.Item name="backfillEnabled" valuePropName="checked" noStyle><Switch disabled /></Form.Item>} /></Card>
    {canViewRisk && <Card title="近 7 日运营统计" style={{ marginTop: 16 }}>
      {riskRangeInvalid && <Alert type="warning" showIcon message="开始日期不能晚于结束日期" />}
      {!riskRangeInvalid && statsError != null && <Alert type="error" showIcon message={`统计加载失败：${statsError instanceof Error ? statsError.message : "请稍后重试"}`} />}
      {!riskRangeInvalid && !statsError && <>
        <Space size="large" wrap style={{ marginBottom: 16 }}>
          <Statistic title="签到请求" value={statsLoading ? "加载中" : (stats?.totals.attempts ?? "—")} />
          <Statistic title="签到成功" value={statsLoading ? "加载中" : (stats?.totals.success ?? "—")} />
          <Statistic title="去重用户" value={statsLoading ? "加载中" : (stats?.totals.uniqueUsers ?? "—")} />
          <Statistic title="风控事件" value={statsLoading ? "加载中" : (stats?.totals.riskEvents ?? "—")} />
        </Space>
        <Table rowKey="date" size="small" pagination={false} loading={statsLoading} dataSource={stats?.daily ?? []} columns={[{ title: "日期", dataIndex: "date" }, { title: "签到请求", dataIndex: "attempts" }, { title: "签到成功", dataIndex: "success" }, { title: "去重用户", dataIndex: "uniqueUsers" }, { title: "风控事件", dataIndex: "riskEvents" }]} />
      </>}
    </Card>}
    {canViewRisk && <Card title="风控事件" style={{ marginTop: 16 }}>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input type="date" value={riskFrom} onChange={(event) => setRiskFrom(event.target.value)} />
        <Input type="date" value={riskTo} onChange={(event) => setRiskTo(event.target.value)} />
        <Select allowClear placeholder="事件类型" style={{ width: 220 }} value={riskReason} onChange={setRiskReason} options={["CHECKIN_DISABLED", "OUT_OF_WINDOW", "ALREADY_CHECKED_IN", "IP_RATE_LIMIT", "DEVICE_LIMIT", "DEVICE_MULTI_ACCOUNT", "CHECK_IN_FAILED", "CHECK_IN_ATTEMPT"].map((value) => ({ value, label: value }))} />
      </Space>
      {riskRangeInvalid && <Alert type="warning" showIcon message="开始日期不能晚于结束日期" />}
      {!riskRangeInvalid && riskEventsError != null && <Alert type="error" showIcon message={`风控事件加载失败：${riskEventsError instanceof Error ? riskEventsError.message : "请稍后重试"}`} />}
      {!riskRangeInvalid && riskEventsError == null && <Table rowKey="id" size="small" pagination={false} loading={riskEventsLoading} dataSource={riskEvents} expandable={{ expandedRowRender: (record) => <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(record.metadata ?? {}, null, 2)}</pre> }} columns={[{ title: "时间", dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString("zh-CN") }, { title: "原因", dataIndex: "reason" }, { title: "账号", dataIndex: "username", render: (value: string | null) => value ?? "-" }, { title: "设备", dataIndex: "deviceId", render: (value: string | null) => value ?? "-" }, { title: "IP", dataIndex: "ip", render: (value: string | null) => value ?? "-" }]} />}
    </Card>}
  </Form>;
}

import type { ReactNode } from "react";
import { Skeleton, Tag } from "antd";
import { CloudUploadOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { FileUpload } from "../../components/FileUpload";
import { getCurrentVersion } from "../../api/systemSettings";

export function SettingsHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading settings-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="settings-heading-actions">{actions}</div>}
    </div>
  );
}

export function PublishStatusBar() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "config-version"],
    queryFn: getCurrentVersion,
  });
  if (isLoading)
    return (
      <Skeleton.Button active block className="settings-status-skeleton" />
    );
  return (
    <div className="settings-publish-bar">
      <span className="settings-status-dot" />
      <strong>线上 v{data?.version ?? 0}</strong>
      <span>
        {data?.publishedAt
          ? new Date(data.publishedAt).toLocaleString("zh-CN")
          : "尚未发布"}
      </span>
      <span className="settings-publish-spacer" />
      {data?.draftCount ? (
        <Tag color="cyan">草稿待发布 {data.draftCount} 项</Tag>
      ) : (
        <Tag color="green">已同步</Tag>
      )}
    </div>
  );
}

export function UploadTile({
  value,
  onChange,
  hint = "上传图片 · JPG / PNG / WebP",
}: {
  value?: string | null;
  onChange?: (value?: string) => void;
  hint?: string;
}) {
  return (
    <div className="settings-upload-tile">
      <CloudUploadOutlined />
      <FileUpload
        bizType="IMAGE"
        accept="image/png,image/jpeg,image/webp"
        value={value ?? undefined}
        onChange={onChange}
      />
      <span>{hint}</span>
    </div>
  );
}

export function SectionTitle({
  children,
  extra,
}: {
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="settings-section-title">
      <h2>{children}</h2>
      {extra}
    </div>
  );
}

export function SettingSwitchRow({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="settings-switch-row">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {control}
    </div>
  );
}

export function formatConfigValue(value: unknown): string {
  if (value === undefined) return "未设置";
  if (value === null) return "空";
  if (typeof value === "boolean") return value ? "开启" : "关闭";
  if (typeof value === "string") return value || "空";
  return JSON.stringify(value);
}

import { BrandMark } from "./BrandMark";

export function SiteBrandMark({
  fileId,
  size = 22,
}: {
  fileId?: unknown;
  size?: number;
}) {
  if (typeof fileId === "string" && fileId)
    return (
      <img
        className="site-brand-logo"
        src={`/api/v1/public/assets/${fileId}`}
        alt=""
        style={{ width: size, height: size }}
      />
    );
  return <BrandMark size={size} />;
}

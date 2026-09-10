import { Navigate, useParams } from "react-router-dom";
import { SystemSettingsOverview } from "./SystemSettingsOverview";
import { SiteSettingsPage } from "./SiteSettingsPage";
import { DownloadSettingsPage } from "./DownloadSettingsPage";
import { BannerSettingsPage } from "./BannerSettingsPage";
import { LandingSettingsPage } from "./LandingSettingsPage";
import { UserPageSettingsPage } from "./UserPageSettingsPage";
import { ConfigPublishPage } from "./ConfigPublishPage";

export function SystemSettingsPage() {
  const { section } = useParams();
  if (!section) return <SystemSettingsOverview />;
  if (section === "site") return <SiteSettingsPage />;
  if (section === "downloads") return <DownloadSettingsPage />;
  if (section === "banners") return <BannerSettingsPage />;
  if (section === "landing") return <LandingSettingsPage />;
  if (section === "user-page") return <UserPageSettingsPage />;
  if (section === "publish") return <ConfigPublishPage />;
  return <Navigate to="/settings" replace />;
}

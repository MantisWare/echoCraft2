import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { SettingsRow } from "../ui/SettingsSection";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { MicCaptureApp } from "../../types/calendar";

// App ids are slugs (see deriveAppId), so an id with no sighting to borrow a
// display name from is titled from its own segments.
const formatAppId = (appId: string): string =>
  appId
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

export function MeetingDetectionIgnoreList() {
  const { t } = useTranslation();
  const ignoredApps = useSettingsStore((s) => s.meetingDetectionIgnoredApps);
  const setIgnoredApps = useSettingsStore((s) => s.setMeetingDetectionIgnoredApps);
  const [recentApps, setRecentApps] = useState<MicCaptureApp[]>([]);
  const [pendingAppId, setPendingAppId] = useState("");

  const loadRecentApps = useCallback(async () => {
    const result = await window.electronAPI?.meetingDetectionGetRecentCaptureApps?.();
    setRecentApps(result?.apps ?? []);
  }, []);

  useEffect(() => {
    void loadRecentApps();
  }, [loadRecentApps]);

  const nameByAppId = useMemo(
    () => new Map(recentApps.map((app) => [app.appId, app.appName])),
    [recentApps]
  );

  const addableApps = useMemo(
    () => recentApps.filter((app) => !ignoredApps.includes(app.appId)),
    [recentApps, ignoredApps]
  );

  const addPendingApp = () => {
    if (pendingAppId === "") return;
    setIgnoredApps([...ignoredApps, pendingAppId]);
    setPendingAppId("");
  };

  const removeApp = (appId: string) => {
    setIgnoredApps(ignoredApps.filter((ignored) => ignored !== appId));
  };

  return (
    <div className="space-y-3">
      <SettingsRow
        label={t("settingsPage.general.notifications.ignoredApps")}
        description={t("settingsPage.general.notifications.ignoredAppsDescription")}
      >
        <div className="flex items-center gap-2">
          <Select
            value={pendingAppId}
            onValueChange={setPendingAppId}
            disabled={addableApps.length === 0}
          >
            {/* Opening the picker is the moment the list matters, so it is
                refreshed then rather than polled. */}
            <SelectTrigger className="h-8 w-48 text-xs" onClick={() => void loadRecentApps()}>
              <SelectValue
                placeholder={t(
                  addableApps.length === 0
                    ? "settingsPage.general.notifications.ignoredAppsNoneSeen"
                    : "settingsPage.general.notifications.ignoredAppsPlaceholder"
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {addableApps.map((app) => (
                <SelectItem key={app.appId} value={app.appId}>
                  {app.appName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={addPendingApp}
            disabled={pendingAppId === ""}
          >
            {t("settingsPage.general.notifications.ignoredAppsAdd")}
          </Button>
        </div>
      </SettingsRow>

      {ignoredApps.length === 0 ? (
        <p className="text-xs text-muted-foreground/80">
          {t("settingsPage.general.notifications.ignoredAppsEmpty")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {ignoredApps.map((appId) => (
            <span
              key={appId}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/60 py-0.5 pl-2.5 pr-1 text-xs text-foreground dark:border-border-subtle dark:bg-surface-3/60"
            >
              {nameByAppId.get(appId) ?? formatAppId(appId)}
              <button
                type="button"
                onClick={() => removeApp(appId)}
                aria-label={t("settingsPage.general.notifications.ignoredAppsRemove", {
                  app: nameByAppId.get(appId) ?? formatAppId(appId),
                })}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-border/60 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

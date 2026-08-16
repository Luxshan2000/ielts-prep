import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabPanel } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { useSettingsStore } from "@/stores";
import { AboutTab } from "./components/AboutTab";
import { AppearanceTab } from "./components/AppearanceTab";
import { DataTab } from "./components/DataTab";
import { OfflineBanner } from "./components/OfflineBanner";
import { ProvidersTab } from "./components/ProvidersTab";
import { SaveBar } from "./components/SaveBar";
import { VoiceTab } from "./components/VoiceTab";
import { YouTab } from "./components/YouTab";
import { useSettingsFeatureStore } from "./store";

type TabId = "you" | "providers" | "voice" | "appearance" | "data" | "about";

const TABS: { value: TabId; label: string }[] = [
  { value: "you", label: "You" },
  { value: "providers", label: "Providers" },
  { value: "voice", label: "Voice" },
  { value: "appearance", label: "Appearance" },
  { value: "data", label: "Data" },
  { value: "about", label: "About" },
];

export function SettingsPage() {
  // Deep-linkable, so the sidebar's preferences button can land on the right section and a
  // "change this in Settings" sentence elsewhere in the app can point at the tab it means
  // rather than at the tab that happens to be first.
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const [tab, setTabState] = useState<TabId>(() =>
    TABS.some((t) => t.value === requested) ? (requested as TabId) : "providers",
  );
  const setTab = (next: TabId) => {
    setTabState(next);
    setParams(next === "providers" ? {} : { tab: next }, { replace: true });
  };

  useEffect(() => {
    if (requested && TABS.some((t) => t.value === requested) && requested !== tab) {
      setTabState(requested as TabId);
    }
  }, [requested, tab]);

  const doc = useSettingsStore((s) => s.doc);
  const loading = useSettingsStore((s) => s.loading);
  const offline = useSettingsStore((s) => s.offline);
  const error = useSettingsStore((s) => s.error);
  const load = useSettingsStore((s) => s.load);

  const hydrate = useSettingsFeatureStore((s) => s.hydrate);
  const hydratedFrom = useSettingsFeatureStore((s) => s.hydratedFrom);
  const isDirty = useSettingsFeatureStore((s) => s.isDirty);
  const loadPresets = useSettingsFeatureStore((s) => s.loadPresets);
  const runDetect = useSettingsFeatureStore((s) => s.runDetect);
  const loadRecommended = useSettingsFeatureStore((s) => s.loadRecommended);
  const loadModels = useSettingsFeatureStore((s) => s.loadModels);

  // The document: load once, then mirror it into the editing drafts. A reload
  // while the user has unsaved edits must not stomp on them.
  useEffect(() => {
    void load();
  }, [load]);

  // A screen that failed while the sidecar was down must not stay stuck on its
  // error card after it comes back (12 §9).
  useSidecarRecovery(() => void load());

  useEffect(() => {
    if (!doc || doc === hydratedFrom) return;
    if (isDirty()) return;
    hydrate(doc);
  }, [doc, hydratedFrom, hydrate, isDirty]);

  // Provider metadata: presets first, then detection (which the preset filter and
  // the recommendation tier both read), then the model manager.
  useEffect(() => {
    let active = true;
    void (async () => {
      await loadPresets();
      if (!active) return;
      await runDetect(false);
      if (!active) return;
      await Promise.all([loadRecommended(), loadModels()]);
    })();
    return () => {
      active = false;
    };
  }, [loadPresets, runDetect, loadRecommended, loadModels]);

  const banner = offline || (error && !doc);

  return (
    <PageShell
      title="Settings"
      description="One language model, one voice in, one voice out, plus how BandReady behaves."
      toolbar={<Tabs value={tab} onChange={setTab} items={TABS} aria-label="Settings sections" />}
    >
      {banner && (
        <div className="mb-4">
          <OfflineBanner
            offline={offline}
            message={error}
            retrying={loading}
            onRetry={() => {
              void load();
              void loadPresets();
            }}
          />
        </div>
      )}

      <TabPanel value="you" active={tab === "you"}>
        <YouTab />
      </TabPanel>

      <TabPanel value="providers" active={tab === "providers"}>
        <ProvidersTab />
        <SaveBar disabled={offline} />
      </TabPanel>

      <TabPanel value="voice" active={tab === "voice"}>
        <VoiceTab />
        <SaveBar disabled={offline} />
      </TabPanel>

      <TabPanel value="appearance" active={tab === "appearance"}>
        <AppearanceTab />
      </TabPanel>

      <TabPanel value="data" active={tab === "data"}>
        <DataTab />
      </TabPanel>

      <TabPanel value="about" active={tab === "about"}>
        <AboutTab />
      </TabPanel>
    </PageShell>
  );
}

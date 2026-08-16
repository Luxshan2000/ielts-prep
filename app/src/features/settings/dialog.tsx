import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Database, Info, Mic, Palette, Server, User } from "lucide-react";
import { Modal, useConfirm } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { FeatureIcon } from "@/lib/featureRoute";
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

type SectionId = "appearance" | "you" | "providers" | "voice" | "data" | "about";

/**
 * Appearance is first because the theme used to be one click away in the sidebar footer
 * and is now inside this dialog. Top of the rail is the shortest that trip can be.
 */
const SECTIONS: { id: SectionId; label: string; icon: FeatureIcon }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "you", label: "You", icon: User },
  { id: "providers", label: "Providers", icon: Server },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "data", label: "Data", icon: Database },
  { id: "about", label: "About", icon: Info },
];

const DEFAULT_SECTION: SectionId = "providers";

function isSection(value: string | null): value is SectionId {
  return SECTIONS.some((s) => s.id === value);
}

/** Providers is the default, so it is the one section that needs no query string. */
function hrefFor(id: SectionId): string {
  return id === DEFAULT_SECTION ? "/settings" : `/settings?tab=${id}`;
}

/**
 * Settings, as a dialog over the app rather than a screen of its own.
 *
 * It is still mounted by the `/settings` route, which is what keeps every "open Settings
 * and paste your key" link in the app working, keeps `?tab=` deep links pointing at the
 * section they name, and makes the browser Back button close the dialog. A global
 * `isSettingsOpen` flag would have needed each of those wired by hand.
 */
export function SettingsDialog() {
  // Deep-linkable, so the sidebar's preferences button can land on the right section and a
  // "change this in Settings" sentence elsewhere in the app can point at the section it means
  // rather than at the section that happens to be first.
  const [params] = useSearchParams();
  const requested = params.get("tab");
  const section: SectionId = isSection(requested) ? requested : DEFAULT_SECTION;
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();

  // Whether there is a screen behind this one, decided once on mount. The rail navigates
  // with `replace` so that Back closes the dialog instead of walking back through the
  // sections, which also means the live `location.key` stops saying anything about how the
  // dialog was reached. React Router gives the first entry in a history the key "default",
  // and that is the case that has nothing to go back to: a learner who launched the app on
  // a #/settings link would otherwise be sent out of BandReady by the close button.
  const [canGoBack] = useState(() => location.key !== "default");

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

  // Provider metadata: presets first, then detection (which the preset filter and the local
  // model list both read), then the model manager. The OpenRouter catalogue is not fetched
  // here: each section asks for its own, and only once it is actually pointed at OpenRouter.
  useEffect(() => {
    let active = true;
    void (async () => {
      await loadPresets();
      if (!active) return;
      await runDetect(false);
      if (!active) return;
      await loadModels();
    })();
    return () => {
      active = false;
    };
  }, [loadPresets, runDetect, loadModels]);

  // Below `sm` the rail is a strip that scrolls sideways, so a link to a section near its
  // end would otherwise mark an item sitting off the right edge of the dialog. jsdom has no
  // scrollIntoView, hence the optional call.
  const revealActive = useCallback((el: HTMLAnchorElement | null) => {
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, []);

  const close = useCallback(async () => {
    if (isDirty()) {
      const ok = await confirm({
        title: "Close settings without saving?",
        message:
          "Your provider and voice edits are not saved yet. They stay here until you save or discard them.",
        confirmLabel: "Close settings",
        cancelLabel: "Keep editing",
      });
      if (!ok) return;
    }
    // Leaving the route is what closes the dialog, so closing has to be a navigation.
    // Hiding the panel while /settings stayed in the address bar would leave Back and a
    // page refresh disagreeing about whether Settings is open.
    if (canGoBack) navigate(-1);
    else navigate("/");
  }, [canGoBack, confirm, isDirty, navigate]);

  const banner = offline || (error && !doc);

  return (
    <Modal
      open
      onClose={() => void close()}
      title="Settings"
      size="2xl"
      // The default body scrolls as one column, which would carry the rail off the top of
      // the dialog with it. Here the body is the frame and the panes scroll inside it.
      //
      // Its height is fixed rather than following the content: About is a few lines and
      // Providers is a long form, and a dialog that resized on every rail click moved the
      // rail out from under the pointer. `flex-none` is what makes the height stick, since
      // the body's default `flex-1` sets a zero basis that a height alone cannot beat. The
      // vh cap keeps the header, the offline banner and this inside the panel's own 85vh
      // on a short window.
      bodyClassName="flex h-[min(36rem,70vh)] flex-none flex-col overflow-hidden"
    >
      {banner && (
        <div className="shrink-0 border-b border-border px-6 py-4">
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

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        {/*
          Below `sm` there is no room for a rail beside the pane, so the same list becomes a
          strip across the top of the dialog. It scrolls on its own axis; the dialog itself
          never scrolls sideways.
        */}
        <nav
          aria-label="Settings sections"
          className={cn(
            "scrollbar-thin flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2",
            "sm:w-48 sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto sm:border-b-0 sm:border-r",
          )}
        >
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            const active = item.id === section;
            return (
              <Link
                key={item.id}
                to={hrefFor(item.id)}
                // Replace, so Back closes the dialog rather than stepping back through
                // every section the learner looked at on the way.
                replace
                ref={active ? revealActive : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div
          // Keyed on the section so the pane starts at the top after every rail click, and
          // so a section that reads its own scroll position does not inherit another's.
          key={section}
          role="region"
          aria-label={current.label}
          className="scrollbar-thin min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-5"
        >
          {section === "appearance" && <AppearanceTab />}
          {section === "you" && <YouTab />}
          {section === "providers" && (
            <>
              <ProvidersTab />
              <SaveBar disabled={offline} />
            </>
          )}
          {section === "voice" && (
            <>
              <VoiceTab />
              <SaveBar disabled={offline} />
            </>
          )}
          {section === "data" && <DataTab />}
          {section === "about" && <AboutTab />}
        </div>
      </div>
    </Modal>
  );
}

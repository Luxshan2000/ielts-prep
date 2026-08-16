import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useSettingsFeatureStore } from "../store";

/**
 * Sticky footer for the Providers/Voice drafts (03 §4's layout). Appearance saves
 * on change instead — its effect is immediately visible.
 */
export function SaveBar({ disabled }: { disabled?: boolean }) {
  const dirty = useSettingsFeatureStore((s) => s.isDirty());
  const saving = useSettingsFeatureStore((s) => s.saving);
  const savedAt = useSettingsFeatureStore((s) => s.savedAt);
  const saveError = useSettingsFeatureStore((s) => s.saveError);
  const save = useSettingsFeatureStore((s) => s.save);
  const discard = useSettingsFeatureStore((s) => s.discard);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!savedAt) return;
    setShowSaved(true);
    const t = window.setTimeout(() => setShowSaved(false), 3000);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  if (!dirty && !showSaved && !saveError) return null;

  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-6 mt-4 flex flex-wrap items-center gap-3 border-t border-border",
        // Card, not background: this bar now sticks to the bottom of the settings dialog's
        // scrolling pane, and in dark the two tokens are far enough apart that a background
        // bar read as a hole in the panel.
        "bg-card/90 px-6 py-3 backdrop-blur",
      )}
    >
      {saveError ? (
        <p className="text-[13px] text-destructive">{saveError}</p>
      ) : showSaved && !dirty ? (
        <p className="flex items-center gap-1.5 text-[13px] text-success">
          <Check className="h-4 w-4" aria-hidden="true" />
          Settings saved
        </p>
      ) : (
        <p className="text-[13px] text-muted-foreground">You have unsaved changes.</p>
      )}

      {dirty && (
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={discard} disabled={saving}>
            Discard
          </Button>
          <Button size="sm" loading={saving} disabled={disabled} onClick={() => void save()}>
            Save settings
          </Button>
        </div>
      )}
    </div>
  );
}

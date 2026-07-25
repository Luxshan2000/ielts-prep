import { useState } from "react";
import { Check, Moon, Sun } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useSettingsStore } from "@/stores";
import { cn } from "@/lib/cn";
import { patchSettingsOptimistic } from "../store";

type Density = "comfortable" | "compact";

const DENSITIES: { id: Density; label: string; description: string }[] = [
  {
    id: "comfortable",
    label: "Comfortable",
    description: "Roomier lists and cards. The default.",
  },
  {
    id: "compact",
    label: "Compact",
    description: "More rows on screen — handy on a 13-inch laptop.",
  },
];

/**
 * Appearance saves immediately (the effect is visible instantly, so a Save
 * button would be confusing) — optimistic, with rollback handled by
 * `patchSettingsOptimistic`.
 */
export function AppearanceTab() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const doc = useSettingsStore((s) => s.doc);
  const [error, setError] = useState<string | null>(null);

  const appearance = (doc?.appearance ?? {}) as Record<string, unknown>;
  const density: Density = appearance.density === "compact" ? "compact" : "comfortable";

  const applyTheme = async (next: "light" | "dark") => {
    setTheme(next);
    setError(null);
    const ok = await patchSettingsOptimistic({ appearance: { theme: next } });
    if (!ok) setError("Theme applied locally, but the sidecar did not store it.");
  };

  const applyDensity = async (next: Density) => {
    setError(null);
    const ok = await patchSettingsOptimistic({ appearance: { density: next } });
    if (!ok) setError("Could not save the density setting.");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            BandReady starts in dark. The choice is applied before the first paint, so
            there is no flash on launch.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { id: "dark" as const, label: "Dark", icon: Moon },
                { id: "light" as const, label: "Light", icon: Sun },
              ]
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={theme === id}
                onClick={() => void applyTheme(id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  theme === id ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
                )}
              >
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-[13px] font-medium text-foreground">{label}</span>
                {theme === id && <Check className="ml-auto h-4 w-4 text-primary" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Density</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Applies to lists, tables and question palettes.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {DENSITIES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={density === option.id}
                onClick={() => void applyDensity(option.id)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  density === option.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-accent",
                )}
              >
                <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  {option.label}
                  {density === option.id && <Badge tone="primary">Active</Badge>}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {option.description}
                </span>
              </button>
            ))}
          </div>
          {error && <p className="text-[13px] text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

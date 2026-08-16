import { useState } from "react";
import { Check, ExternalLink, KeyRound } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useSettingsFeatureStore } from "../store";

/**
 * The online route, for somebody who is here to practise English.
 *
 * Choosing "use an online service" used to drop the full `ProviderSlotCard` onto the screen:
 * a provider dropdown, a read-only base URL, a key field, a model dropdown listing
 * `anthropic/claude-sonnet-4.5` and four siblings, an Advanced disclosure with temperature and
 * max-tokens sliders, a Verify button and a line of raw provider detail. Every field is
 * correct and every one of them is a question the learner cannot answer.
 *
 * There is only one thing this route actually needs from them: a key. So that is the field.
 * The model is picked for them and named in plain words — the two options differ in ways a
 * learner can genuinely choose between (how careful the marking is, what it costs), not by
 * vendor string. Anybody who wants the vendor string still has Advanced settings, unchanged.
 */

/** Plain-language marking choices. The id is a consequence of the choice, not the choice. */
const QUALITY: { model: string; label: string; what: string }[] = [
  {
    model: "anthropic/claude-sonnet-4.5",
    label: "Careful marking",
    what: "The closest to a real examiner, and the best written feedback. Costs a little more.",
  },
  {
    model: "google/gemini-2.5-flash",
    label: "Quick and cheap",
    what: "Marks in a couple of seconds for a fraction of the cost. Slightly blunter feedback.",
  },
];

const KEYS_URL = "https://openrouter.ai/keys";

function openKeysPage(): void {
  const bridge = typeof window !== "undefined" ? window.bandready : undefined;
  if (bridge?.openExternal) bridge.openExternal(KEYS_URL);
  else window.open(KEYS_URL, "_blank", "noopener,noreferrer");
}

export function CloudKeyCard() {
  const draft = useSettingsFeatureStore((s) => s.drafts.llm);
  const setField = useSettingsFeatureStore((s) => s.setField);
  const touched = useSettingsFeatureStore((s) => s.secretTouched.llm);

  const stored = String(draft.api_key ?? "");
  // A `${VAR}` reference is a key the app cannot see and the learner cannot check. It is a
  // perfectly good way to configure this and a terrible thing to be *silently* relying on,
  // so it is named rather than shown as a row of dots.
  const envRef = /^\$\{[A-Z0-9_]+\}$/.test(stored);
  const hasStored = stored !== "" && !touched;
  const [replacing, setReplacing] = useState(false);
  const showInput = replacing || touched || (!hasStored && !envRef);

  const model = String(draft.model ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your key</CardTitle>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          BandReady marks through OpenRouter. One key covers it, you pay only for what you use,
          and it is stored encrypted on this computer.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <Field
          label="OpenRouter key"
          hint={
            showInput
              ? "Starts with sk-or-. Paste it here, then press Check below."
              : undefined
          }
        >
          {showInput ? (
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-or-…"
              aria-label="OpenRouter key"
              value={touched ? stored : ""}
              onChange={(e) => setField("llm", "api_key", e.target.value)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
              {envRef ? (
                <span className="flex items-center gap-2 text-[13px] text-foreground">
                  <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Read from the <code className="font-mono text-[12px]">{stored}</code> environment
                  variable
                </span>
              ) : (
                <span className="flex items-center gap-2 text-[13px] text-foreground">
                  <Check className="h-4 w-4 text-success" aria-hidden="true" />A key is saved
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setReplacing(true)}
              >
                {envRef ? "Paste a key instead" : "Replace"}
              </Button>
            </div>
          )}
        </Field>

        <Button variant="ghost" size="sm" onClick={openKeysPage}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Get a key from OpenRouter
        </Button>

        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-[14px] font-medium">How carefully should it mark?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {QUALITY.map((choice) => {
              const picked = model === choice.model;
              return (
                <button
                  key={choice.model}
                  type="button"
                  onClick={() => setField("llm", "model", choice.model)}
                  aria-pressed={picked}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    picked ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                  )}
                >
                  <span className="flex items-center gap-2 text-[14px] font-semibold">
                    {choice.label}
                    {picked && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">
                    {choice.what}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Named quietly, because somebody comparing prices on OpenRouter needs it and
              nobody else does. */}
          {model && !QUALITY.some((c) => c.model === model) && (
            <p className="text-[12px] text-muted-foreground">
              Currently set to <code className="font-mono">{model}</code>, chosen in Advanced
              settings.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

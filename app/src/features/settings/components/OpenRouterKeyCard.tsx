import { useState } from "react";
import { Check, ExternalLink, KeyRound } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input } from "@/components/ui";
import { openExternal } from "@/lib/openExternal";
import {
  MODALITIES,
  OPENROUTER_PRESET,
  isEnvRef,
  useSettingsFeatureStore,
  type Modality,
} from "../store";

/**
 * One key, asked for once.
 *
 * OpenRouter serves the examiner, the voice and the microphone from a single key, so being
 * asked for it three times would be three chances to paste it wrong. This card appears as
 * soon as any job is pointed at OpenRouter, and what is typed here is written into every
 * job that uses it.
 *
 * The one thing it cannot do is copy a key it has never seen. A stored key comes back
 * masked and is stripped from every save, so a job added after the key was saved has to be
 * given it again. That is said plainly here rather than discovered as a rejected key.
 */

const KEYS_URL = "https://openrouter.ai/keys";

const JOB_NAMES: Record<Modality, string> = {
  llm: "the examiner",
  tts: "the voice",
  stt: "hearing you",
};

function joinNames(modalities: Modality[]): string {
  const names = modalities.map((m) => JOB_NAMES[m]);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function OpenRouterKeyCard() {
  const drafts = useSettingsFeatureStore((s) => s.drafts);
  const secretTouched = useSettingsFeatureStore((s) => s.secretTouched);
  const setOpenRouterKey = useSettingsFeatureStore((s) => s.setOpenRouterKey);
  const [replacing, setReplacing] = useState(false);

  const using = MODALITIES.filter((m) => drafts[m].preset === OPENROUTER_PRESET);
  if (using.length === 0) return null;

  const typed = using.find((m) => secretTouched[m] && String(drafts[m].api_key ?? "") !== "");
  const typedValue = typed ? String(drafts[typed].api_key ?? "") : "";
  // A `${VAR}` reference is a key the app cannot see and the learner cannot check. It is a
  // perfectly good way to configure this and a terrible thing to be *silently* relying on,
  // so it is named rather than shown as a row of dots.
  const envRef = using.find((m) => !secretTouched[m] && isEnvRef(drafts[m].api_key));
  const held = using.filter((m) => !secretTouched[m] && String(drafts[m].api_key ?? "") !== "");
  const missing = using.filter((m) => String(drafts[m].api_key ?? "") === "");
  const gap = missing.length > 0 && held.length > 0;

  const showInput = replacing || Boolean(typed) || missing.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Your OpenRouter key</CardTitle>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          One key covers every job you send to OpenRouter. You pay only for what you use, and it
          is stored encrypted on this computer.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-[13px] text-foreground">
          <span className="text-muted-foreground">In use for: </span>
          {joinNames(using)}.
        </p>

        <Field
          label="OpenRouter key"
          hint={
            !showInput
              ? undefined
              : gap
                ? // The commonest way this goes wrong, and until now the one that surfaced
                  // as "the key was rejected" on a screen saying a key was saved.
                  `A key is saved for ${joinNames(held)}, but BandReady cannot read it back to copy it across. Paste it once more so ${joinNames(missing)} can use it too, then press "Save settings" at the foot of this page.`
                : // Verify accepts an unsaved key, so "press Check" read as the whole job and
                  // a learner who pressed it, saw Working and left had nothing stored. The
                  // durable step is the save bar at the foot of the pane; name it.
                  'Starts with sk-or-. Paste it here, then press "Save settings" at the foot of this page. Pressing Check on its own does not keep it.'
          }
        >
          {showInput ? (
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-or-…"
              aria-label="OpenRouter key"
              value={typedValue}
              onChange={(e) => setOpenRouterKey(e.target.value)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
              {envRef ? (
                <span className="flex items-center gap-2 text-[13px] text-foreground">
                  <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Read from the{" "}
                  <code className="font-mono text-[12px]">
                    {String(drafts[envRef].api_key ?? "")}
                  </code>{" "}
                  environment variable
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

        <Button variant="ghost" size="sm" onClick={() => openExternal(KEYS_URL)}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Get a key from OpenRouter
        </Button>
      </CardContent>
    </Card>
  );
}

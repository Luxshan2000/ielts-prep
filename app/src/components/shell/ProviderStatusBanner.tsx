import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Settings2, X, Zap } from "lucide-react";
import { Button } from "@/components/ui";
import { api, type ApiError } from "@/lib/api";
import { StatusStrip } from "./StatusStrip";

/**
 * The server's detail is shown only when it reads as a sentence. Some provider errors
 * carry a URL and port, a file path or an exception repr, and those mean nothing to
 * someone practising for an English test; the Settings screen keeps the raw text for
 * whoever is debugging.
 */
const TECHNICAL = /https?:\/\/|\b\d{1,3}(?:\.\d{1,3}){3}\b|:\d{2,5}\b|Traceback|\b[A-Z][a-z]+[A-Z]\w*\(|\.onnx\b|\/Users\/|\/home\/|[A-Z]:\\/;

export function learnerSafeDetail(detail: string | undefined): string | null {
  const text = (detail ?? "").trim();
  if (!text || TECHNICAL.test(text)) return null;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * The one global answer to "you have no working model provider".
 *
 * A brand-new install has a provider *preset* selected (ollama) but nothing running
 * behind it, so the first time a learner asks for an essay score, a generated prompt
 * or rendered listening audio, the sidecar answers 502/503. Each feature
 * shows that failure in place — correctly, and with the server's own words — but none
 * of them can put a Settings button in every one of those spots.
 *
 * This strip does. It listens to the transport layer, so ANY provider failure anywhere
 * raises it exactly once, with the one control that fixes the cause. It is dismissible
 * (a learner who is deliberately working offline should not be nagged) and hides itself
 * on the Settings screen, where the advice would be redundant.
 *
 * Not every failure it hears is a remote provider: a listening render with the voice
 * files not yet downloaded arrives the same way. So the title names "a model", which is
 * true of both, and word lookups are not in the list — they are offline WordNet.
 */
export function ProviderStatusBanner() {
  const [failure, setFailure] = useState<ApiError | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => api.onProviderFailure((error) => setFailure(error)), []);

  // Once the learner is in Settings the banner has served its purpose.
  useEffect(() => {
    if (location.pathname.startsWith("/settings")) setFailure(null);
  }, [location.pathname]);

  if (!failure) return null;
  const detail = learnerSafeDetail(failure.detail);

  return (
    <StatusStrip
      tone="warning"
      icon={Zap}
      title="BandReady couldn't use a model it needs"
      detail={
        <>
          {detail ?? "A model it relies on isn't set up or isn't answering."} Marking,
          generated prompts and listening audio depend on these; everything else keeps working.
        </>
      }
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFailure(null);
              navigate("/settings");
            }}
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            Open Settings
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Dismiss the provider notice"
            onClick={() => setFailure(null)}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </>
      }
    />
  );
}

export default ProviderStatusBanner;

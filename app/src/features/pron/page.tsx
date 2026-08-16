import { useCallback, useEffect, useState } from "react";
import { Shuffle } from "lucide-react";
import { Button, TabPanel, Tabs } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { api } from "@/lib/api";
import { useUrlTab } from "@/lib/useUrlTab";
import { getDrills } from "./api";
import { MinimalPairDrill } from "./components/MinimalPairDrill";
import { ReadAloud } from "./components/ReadAloud";

/**
 * Pronunciation, reachable at last.
 *
 * The sidecar has carried a full analyzer and ten routes since the module was written and
 * nothing has ever called one of them. This is the screen that does.
 *
 * Two halves, in the order they are worth doing. **Listening** is perception: pick which of a
 * minimal pair you heard. It needs no model, nothing is recorded, and it is scored against a
 * key rather than against a voice — which makes it exactly as fair for a Tamil speaker as for
 * anybody else. **Speaking** records a sentence and reports which words the recogniser
 * hesitated on, which is a reason to listen again rather than a verdict.
 *
 * A contrast you cannot hear is one you cannot reliably produce, so listening comes first.
 */

interface VocabRow {
  headword: string;
  own_context_sentence: string | null;
  example_sentences: string[];
}

type Tab = "listen" | "speak";
const TABS: Tab[] = ["listen", "speak"];

/** Sentences worth reading aloud, drawn from the learner's own vocabulary queue. */
function useSentence() {
  const [sentence, setSentence] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");

  const pick = useCallback(() => {
    const use = (pool: { text: string; label: string }[]) => {
      if (pool.length === 0) return false;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      setSentence(chosen.text);
      setSource(chosen.label);
      return true;
    };

    // The learner's own words first — a sentence you are already learning is worth more than
    // a neutral one. The bank is empty until somebody opts into a deck, though, so this
    // cannot be the only source or a new user gets nothing.
    api
      .get<{ items?: VocabRow[] }>("/api/v1/vocab/entries?limit=40")
      .then((data) => {
        const pool: { text: string; label: string }[] = [];
        for (const item of data.items ?? []) {
          for (const text of [item.own_context_sentence, ...(item.example_sentences ?? [])]) {
            if (typeof text === "string" && text.trim().length > 20) {
              pool.push({ text: text.trim(), label: `From your vocabulary: “${item.headword}”` });
            }
          }
        }
        if (use(pool)) return;
        void fromDrills();
      })
      .catch(() => void fromDrills());

    // Otherwise the minimal-pair sentences, which are always present and carry exactly the
    // contrasts the other tab drills. Reading the sound you just practised hearing is a
    // better second choice than a neutral sentence.
    async function fromDrills() {
      try {
        const set = await getDrills("minimal_pair_ab");
        const pool = set.items.flatMap((item) =>
          [item.sentence_a, item.sentence_b]
            .filter((t): t is string => typeof t === "string" && t.trim().length > 12)
            .map((text) => ({
              text: text.trim(),
              label: item.contrast ? `Practising ${item.contrast}` : "From the sound drills",
            })),
        );
        use(pool);
      } catch {
        /* FALLBACK keeps the screen usable */
      }
    }
  }, []);

  useEffect(() => pick(), [pick]);
  return { sentence, source, pick };
}

// Last resort only. Everything above it is authored content; this exists so the screen is
// never blank if both the bank and the drills fail to answer.
const FALLBACK = "The research team published their findings three weeks before the deadline.";

export function PronPage() {
  const [tab, setTab] = useUrlTab<Tab>(TABS, "listen");
  const { sentence, source, pick } = useSentence();

  return (
    <PageShell
      title="Pronunciation"
      description="Hear the contrasts first, then say them. Every accent is accepted. This is about being understood, not about sounding like anybody else."
      toolbar={
        <Tabs
          value={tab}
          onChange={setTab}
          aria-label="Pronunciation sections"
          items={[
            { value: "listen", label: "Hear the difference" },
            { value: "speak", label: "Read aloud" },
          ]}
        />
      }
    >
      <TabPanel value="listen" active={tab === "listen"}>
        <MinimalPairDrill />
      </TabPanel>

      <TabPanel value="speak" active={tab === "speak"}>
        <div className="space-y-3">
          <ReadAloud sentence={sentence ?? FALLBACK} source={sentence ? source : undefined} />
          <Button variant="ghost" size="sm" onClick={pick}>
            <Shuffle className="h-4 w-4" />
            Another sentence
          </Button>
        </div>
      </TabPanel>
    </PageShell>
  );
}

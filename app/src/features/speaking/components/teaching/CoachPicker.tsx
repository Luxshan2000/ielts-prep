/**
 * Topic picker for the coach — `/speaking/coach`.
 *
 * Lists every Part 2 card in the installed pack, because the set is identified by its cue card
 * and that is also how a learner remembers it ("the one about a friend you've known longest").
 * Cards with no `card_set_id` are the built-in fallbacks the engine uses when no pack is
 * installed; they carry no teaching payload, so they are filtered out rather than shown as
 * dead links.
 *
 * The list, the search, the filters and the tiles all live in `TopicBrowser`, which the Speaking
 * hub also uses. This screen supplies the verb.
 */

import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, ErrorState } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useSpeakingStore } from "../../store";
import { TopicBrowser } from "../TopicBrowser";
import { attemptedSetIds, useTeachingStore } from "./store";

export function CoachPicker() {
  const navigate = useNavigate();

  const cards = useSpeakingStore((s) => s.cards);
  const loading = useSpeakingStore((s) => s.cardsLoading);
  const error = useSpeakingStore((s) => s.cardsError);
  const loadCards = useSpeakingStore((s) => s.loadCards);
  const history = useSpeakingStore((s) => s.history);
  const loadHistory = useSpeakingStore((s) => s.loadHistory);
  const rehearsed = useTeachingStore((s) => s.rehearsed);

  useEffect(() => {
    void loadCards(2);
  }, [loadCards]);

  useEffect(() => {
    if (history.length === 0) void loadHistory();
  }, [history.length, loadHistory]);

  const attempted = useMemo(() => {
    const set = new Set(attemptedSetIds(history));
    for (const id of rehearsed) set.add(id);
    return set;
  }, [history, rehearsed]);

  const sets = useMemo(
    () => cards.filter((card) => card.part === 2 && card.card_set_id && !card.builtin),
    [cards],
  );

  return (
    <PageShell
      title="Topic coach"
      description="Pick a card to study: the prep minute, the band ladder, the language bank and the vocabulary for that subject."
      back={{ to: "/speaking", label: "Speaking" }}
    >
      {error ? (
        <Card>
          <CardContent className="pt-5">
            <ErrorState
              error={error}
              title="The cue-card bank could not be loaded"
              onRetry={() => void loadCards(2)}
            />
          </CardContent>
        </Card>
      ) : (
        <TopicBrowser
          cards={sets}
          attempted={attempted}
          loading={loading}
          actionLabel="Study"
          onPick={(setId) => navigate(`/speaking/coach/${encodeURIComponent(setId)}`)}
          emptyTitle="No topic sets installed"
          emptyDescription="The coach reads its material from the installed content pack. Install one from Settings and every card gains a study screen."
        />
      )}
    </PageShell>
  );
}

export default CoachPicker;

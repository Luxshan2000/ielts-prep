# R2 — Topic Pool: the subject landscape of IELTS-style Speaking

**Purpose.** This is the authoring brief for the seven speaking-content agents. It maps *which
subject areas and question patterns genuinely recur* in the IELTS Speaking test, so that our
**original** questions cover what candidates actually meet on test day.

**Copyright position.** Nothing below is a reproduced exam question. Every entry is a *subject*
(a noun phrase naming what a card is about) or a *pattern* (a structural description of how
questions are built). Where a source listed real reported questions, only the underlying subject
was extracted and the wording discarded. Test format, timing and structure are facts. Recurring
subject areas are facts about the exam, widely documented across dozens of independent sources.
**Authors: never lift a sentence from anywhere. Write every question from scratch, aloud, in an
examiner's voice.** Our copy says "IELTS-style" and carries the non-affiliation notice.

---

## 0. Structural facts, confirmed from official material

These come from the official IELTS sample speaking tasks PDF and the ielts.org format pages, and
they constrain how we author. They are format facts, freely usable.

| Fact | Source |
|---|---|
| Three parts, 11–14 minutes total, face-to-face, recorded | ielts.org format pages |
| **Part 1** = introduction + interview, 4–5 min | ielts.org |
| Part 1 is delivered as **"frames": 2–3 named sub-topics, ~4 questions each** (the official sample runs *home town or village* → *accommodation*, four questions apiece, with a spoken hinge: "Let's move on to talk about…") | official sample tasks PDF |
| First frame is effectively always **work or study**, then hometown and/or home; the rest rotate | ielts.org; ieltsliz; Cathoven |
| **Part 2** = individual long turn, 3–4 min *including* 1 min prep; candidate speaks 1–2 min | ielts.org |
| The task card is a **prompt line + three "You should say" bullets + a fourth "and explain…" line**, followed by **1–2 rounding-off questions** the examiner asks after the long turn | official sample tasks PDF (the sample card is an *object* card: something you own that matters to you — where you got it, how long you've had it, what you use it for, and explain why it's important; rounding-off asks about monetary value and replaceability) |
| **Part 3** = two-way discussion, 4–5 min, "more general and abstract… and where appropriate in greater depth" | ielts.org |
| Part 3 is also framed: **2–3 named discussion themes, 2–3 questions each**, opened with an explicit bridge from Part 2 ("We've been talking about X. I'd like to discuss one or two more general questions relating to this topic… let's consider first of all…"), then a second hinge ("Finally, let's talk about…") | official sample tasks PDF |
| Part 3 is thematically *derived from* the Part 2 subject but **is never about the candidate's own instance** — the teacher card becomes teaching/education, not "your teacher" | ielts.org insight article; multiple teaching sources, unanimous |
| Examiner interruption in Part 3 is normal and not a penalty | ielts.org insight article |

**This maps 1:1 onto our existing schema — do not change it.**

- Part 1 card = one *frame*. Our `set.part1_card_ids` holds two of them; each card's
  `payload_json.questions` should hold **4–6** questions (the official frame is 4; we allow up to 6
  so the practice engine can vary).
- Part 2 `cue_card.bullets` is **exactly 4**: three noun-phrase bullets, and a fourth beginning
  "and explain…". `rounding_off` is **1–2** short follow-ups. This is already how
  `card_p2_local_change_001` is built — it is correct and matches the official card. Keep it.
- Part 3 `part3_themes` is a list of `{title, questions[], counterpoint}` — **2–3 themes, 2–3
  questions each**. `title` should read like the examiner's spoken hinge ("how neighbourhoods
  change"), i.e. lowercase noun phrase, not a headline. This matches the official examiner frame
  exactly. Keep it.
- `card_sets.payload_json.lineage` is where we record the Part 2 → Part 3 abstraction move. Treat
  it as a first-class field: it is the thing that makes a set *coherent* rather than three loose
  cards. See §3.2 for the vocabulary to use in it.

**Sources disagree** on cue-card bullet count: several coaching sites say "4 bullet points", others
"3 bullets plus an explain line". The official card resolves this — it is three bullets plus an
"and explain…" line, which most sites count as four. Our four-element array with the fourth
starting "and explain" is the faithful representation. Do not author a card whose fourth bullet is
not an "and explain / and say / and describe why" line.

---

## 1. PART 1 — recurring topic areas and the angles they take

### 1.1 The angle grid

Almost every Part 1 question in existence is one of these ten moves applied to a subject. Authors:
build each frame by picking **4–6 different angles**, never two of the same. Sequence them so the
frame *opens easy and closes with a light opinion* — that is the real examiner rhythm.

| # | Angle | What it forces | Typical answer length |
|---|---|---|---|
| A1 | **Orientation** — what kind of X is it / tell me about your X | present simple, descriptive adjectives; the "safe opener" | 2–3 sentences |
| A2 | **Preference / favourite** — which X do you like most | superlatives, reason clauses (`because`, `what I like about it is…`) | 2–3 |
| A3 | **Frequency / habit** — how often, when, do you usually | present simple + adverbs of frequency, time adjuncts | 2 |
| A4 | **Like / dislike + why** — do you enjoy X | opinion + justification; `I'm not particularly keen on…` | 2–3 |
| A5 | **Past vs now** — did you do this as a child / has it changed | past simple, `used to`, present perfect contrast | 3 |
| A6 | **Future / intention** — would you like to, do you plan to | `would like to`, `I'm hoping to`, conditionals | 2–3 |
| A7 | **Country generalisation** — is X popular where you live | quantifiers (`most people`, `a fair number`), `tend to` | 3 |
| A8 | **Mild evaluation** — is X important, is it a good thing | evaluative adjectives + hedging (`I'd say`, `it depends`) | 3 |
| A9 | **Change / would change** — would you change anything about X | second conditional, `if I could…` | 2–3 |
| A10 | **Two-way comparison** — do you prefer X or Y | comparatives, `whereas`, `on balance` | 3 |

Two hard constraints on Part 1 authoring, both derived from the format:

1. **Every question must be answerable in 2–4 sentences.** If it needs a paragraph, it is a Part 3
   question in the wrong place. This is the single most common failure in third-party material.
2. **No question may require specialist knowledge.** Part 1 is about the candidate's own life and
   ordinary observation. "Do you think your government's housing policy is effective?" is out of
   band for Part 1.

Also: A5/A7/A9 are where band 6 candidates leak marks (tense control, quantifier accuracy,
conditionals). Weight our frames so **at least one A5, A7 or A9 appears in every Part 1 card** —
that is a teaching decision, not a fidelity one, but it is defensible: those angles do occur.

### 1.2 The topic areas

**Tier 1 — near-certain, appears in essentially every test.** Every learner needs many variants of
these, because they *will* be asked. Build the deepest coverage here.

| # | Area | Angles that dominate | `topic_id` |
|---|---|---|---|
| 1 | **Work or study** (which one you do, what it involves, why you chose it, best/worst part, future) | A1 A2 A4 A6 A8 | `topic_work` / `topic_education` |
| 2 | **Hometown** (what kind of place, what it's known for, what people do there, whether it's changed, whether it's a good place to live) | A1 A5 A7 A8 A9 | `topic_urbanisation` |
| 3 | **Home / accommodation** (house or flat, how long, favourite room, view, what you'd change, ideal future home) | A1 A3 A6 A9 | `topic_housing` |

**Tier 2 — very frequent rotating everyday set.** These come up constantly as the second or third
frame. Target broad coverage: at least one frame per area, two for the starred ones.

| # | Area | Angles that dominate | `topic_id` |
|---|---|---|---|
| 4 | **Daily routine** ★ | A3 A5 A9 | `topic_work` |
| 5 | **Free time / leisure** ★ | A2 A3 A4 | `topic_sport` |
| 6 | **Food and cooking** ★ | A2 A3 A5 A7 | `topic_food` |
| 7 | **Weather and seasons** ★ | A2 A4 A7 A10 | `topic_environment` |
| 8 | **Friends** | A1 A3 A5 A8 | `topic_family` |
| 9 | **Family** | A1 A5 A7 | `topic_family` |
| 10 | **Holidays and travel** ★ | A2 A5 A6 | `topic_tourism` |
| 11 | **Transport / getting around** ★ | A3 A7 A9 A10 | `topic_transport` |
| 12 | **Shopping** | A2 A3 A5 A10 | `topic_money` |
| 13 | **Music** ★ | A2 A3 A5 A7 | `topic_culture` |
| 14 | **Sport and exercise** ★ | A3 A4 A6 A7 | `topic_sport` |
| 15 | **Reading and books** | A2 A3 A5 A8 | `topic_education` |
| 16 | **Television and films** | A2 A3 A7 A10 | `topic_media` |
| 17 | **Mobile phones** ★ | A3 A5 A8 A9 | `topic_technology` |
| 18 | **The internet / social media** ★ | A3 A7 A8 | `topic_technology` |
| 19 | **Clothes and what you wear** | A2 A3 A5 A7 | `topic_culture` |
| 20 | **Sleep** | A3 A5 A8 | `topic_health` |
| 21 | **Childhood** | A5 A2 A4 | `topic_family` |
| 22 | **Future plans** | A6 A8 | `topic_work` |
| 23 | **Neighbours and neighbourhood** | A1 A5 A7 A8 | `topic_housing` |
| 24 | **Animals and pets** | A2 A4 A7 | `topic_environment` |
| 25 | **Photographs and taking photos** | A3 A5 A8 | `topic_media` |
| 26 | **Celebrations, festivals and birthdays** | A2 A5 A7 | `topic_culture` |
| 27 | **Gifts and giving** | A3 A5 A7 | `topic_culture` |
| 28 | **Languages and learning English** | A5 A6 A8 | `topic_communication` |
| 29 | **Keeping healthy** | A3 A4 A8 A9 | `topic_health` |
| 30 | **Parks, nature and being outdoors** | A2 A3 A5 A8 | `topic_environment` |

**Tier 3 — the rotating "quirky" set.** These are the ones that panic candidates, precisely because
they are not on the memorised lists. They are documented as genuinely occurring and are the
reason a practice pack must go wide, not just deep. One frame each is enough; the *value* is in
proving to the learner that any everyday noun can be a Part 1 topic.

| # | Area | Angles that dominate | `topic_id` |
|---|---|---|---|
| 31 | **Art, drawing and painting** | A4 A5 A8 | `topic_culture` |
| 32 | **Handwriting / writing by hand** | A3 A5 A8 | `topic_communication` |
| 33 | **Patience and waiting** | A4 A5 A8 | `topic_communication` |
| 34 | **Boredom** | A3 A4 A9 | `topic_health` |
| 35 | **Noise and quiet** | A4 A7 A9 | `topic_urbanisation` |
| 36 | **Concentration and focus** | A3 A8 A9 | `topic_education` |
| 37 | **Punctuality and being late** | A3 A7 A8 | `topic_culture` |
| 38 | **Dreams — both kinds** (what you dream at night; what you dream of doing) | A3 A6 A8 | `topic_health` |
| 39 | **Names** (yours, naming customs, whether names matter) | A1 A5 A7 | `topic_culture` |
| 40 | **Numbers and maths in daily life** | A3 A4 A8 | `topic_science` |
| 41 | **Colours** | A2 A4 A7 | `topic_culture` |
| 42 | **Flowers and plants** | A2 A3 A7 | `topic_environment` |
| 43 | **Rain, snow and extreme weather** | A4 A5 A7 | `topic_environment` |
| 44 | **Public places — libraries, markets, squares** | A3 A5 A8 | `topic_urbanisation` |
| 45 | **Advertisements** | A3 A4 A8 | `topic_media` |
| 46 | **News and how you follow it** | A3 A5 A8 | `topic_media` |
| 47 | **Maps, directions and finding your way** | A3 A5 A9 | `topic_transport` |
| 48 | **Rubbish and recycling** | A3 A7 A8 | `topic_environment` |
| 49 | **Furniture and the things in your room** | A1 A2 A9 | `topic_housing` |
| 50 | **Emails, letters and messages** | A3 A5 A10 | `topic_communication` |
| 51 | **Robots and AI in everyday life** (newer, rising) | A3 A6 A8 | `topic_technology` |
| 52 | **Memory and remembering things** | A3 A4 A9 | `topic_science` |
| 53 | **Politeness and good manners** | A5 A7 A8 | `topic_culture` |
| 54 | **Confidence** | A4 A5 A8 | `topic_education` |
| 55 | **Small shops and local businesses** | A3 A5 A7 | `topic_economy` |
| 56 | **Apps you use** | A2 A3 A9 | `topic_technology` |
| 57 | **Saving and spending money** | A3 A5 A8 | `topic_money` |
| 58 | **Helping others / volunteering** | A3 A4 A7 | `topic_family` |
| 59 | **Talking to people you don't know** | A3 A4 A7 | `topic_communication` |
| 60 | **Games and toys** | A2 A5 A7 | `topic_sport` |

That is **60 areas**, comfortably over the 30 target, and every one maps to an existing `topic_id`.
Three of our twenty topics — `topic_crime`, `topic_globalisation`, `topic_economy` — are **weak fits
for Part 1** and should mostly carry Part 3 cards instead (see §4.3).

---

## 2. PART 2 — cue-card taxonomy

### 2.1 The families

Sources converge on five to eight families. The five-family view (person / place / object / event /
activity) is the classic one and is what most teaching material uses; several sources report a
finer eight-way split that separates **experience** from **event**, pulls **media** out of
**object**, and adds an **abstract** family. The eight-way split is more useful to us because the
extra three behave differently *grammatically*, which is what our teaching notes hang on. We adopt
eight families.

For each family below: the bullet grammar the format imposes, and the **language load** — the
tense and functional exponents the card forces a candidate to produce. That language load is the
teaching hook. A card that does not force distinctive language is a weak card.

---

**F1 · DESCRIBE A PERSON**

*Bullet grammar:* who they are · how you know them / how you met · what they are like *or* what
they do · **and explain why** you feel as you do about them.

*Language load:* present simple for enduring traits; past simple for how you met; **character
adjectives beyond `nice`/`kind`** (`down-to-earth`, `unflappable`, `generous with her time`);
relative clauses (`someone who…`, `the kind of person who…`); `what I admire about him is…` cleft
structures. Danger: candidates narrate a biography and never *characterise*.

*Sub-split that matters:* "a person" (may be famous) vs "a person **you know**" (must be personal).
Misreading this is one of the most common Part 2 failures. We should ship cards of both kinds and
say so in the teaching note.

Subjects (16):
1. an older person you enjoy talking to
2. a family member you take after
3. a friend you have known the longest
4. a teacher who changed how you think about a subject
5. a person who is good at their job
6. someone who helped you when you were struggling
7. a person you know who is very ambitious
8. a neighbour you get on well with
9. a well-known person from your country you respect
10. a young person who has achieved something
11. someone who is good with money
12. a person who makes you laugh
13. someone you would like to work with
14. a person who gave you useful advice
15. someone who is calm under pressure
16. a person you met once and still remember

---

**F2 · DESCRIBE A PLACE**

*Bullet grammar:* where it is · how you came to know it / when you go there · what you do there
*or* what it is like · **and explain why** you like it / why it matters to you.

*Language load:* **prepositions of place and location** (`on the outskirts of`, `overlooking`,
`tucked away behind`); `there is/are` + existential structures; sensory adjectives; present simple
for permanent description shifting to past for a visit. Danger: flat listing (`there is a shop,
there is a park`) — the teaching note must push relative clauses and evaluation.

Widely reported as **the single most common family**. Weight coverage accordingly.

Subjects (14):
17. a quiet place you go to think
18. a place in your town that visitors always go to
19. a place near water — a river, lake or coast
20. a building you find impressive
21. a shop you like going into
22. a park or green space you use
23. a place you visited that was different from what you expected
24. a country you would like to live in for a year
25. a place where you like to eat
26. a room in a house you spend a lot of time in
27. a place you go to study or work that isn't your home or office
28. a historic place in your country
29. a place that gets very crowded
30. a place you used to go to as a child

---

**F3 · DESCRIBE AN OBJECT**

*Bullet grammar:* what it is · where you got it / who gave it to you · what you use it for / how
often you use it · **and explain why** it is important to you.

*Language load:* **material and shape vocabulary** (`wooden`, `leather-bound`, `about the size
of…`); present perfect for possession duration (`I've had it for…`, `I've had it since…`) — this is
the tense the official sample card explicitly targets; purpose clauses (`I use it for -ing`, `it
comes in handy when…`); sentimental-value language (`it has a lot of sentimental value`).

Reported as historically less common than person/place but **rising**, often tied to technology and
everyday utility.

Subjects (14):
31. something you own that you have had a long time
32. a gift you were given that surprised you
33. a piece of technology you would find hard to live without
34. something you bought that turned out to be a waste of money
35. an item of clothing you wear often
36. something handmade that you own or were given
37. something you own that was passed down in your family
38. a piece of equipment you use for a hobby
39. something in your home that needs replacing
40. a bag or container you carry with you
41. something you borrowed and found very useful
42. an object that reminds you of a particular time in your life
43. something you own that other people comment on
44. a tool that makes a household job easier

---

**F4 · DESCRIBE AN EVENT OR OCCASION**

*Bullet grammar:* when and where it happened · who you were with · what happened / what you did ·
**and explain how you felt** about it.

*Language load:* **past simple + past continuous for background** (`we were waiting when…`); past
perfect for backshift (`we had already booked…`); time sequencers (`to begin with`, `not long
after`, `by the end`); narrative emotion vocabulary. This family is the tense-control workout.
Danger: candidates stay in present simple and lose Grammatical Range and Accuracy marks.

Subjects (12):
45. a celebration you attended that you enjoyed
46. an occasion when you had to speak in front of people
47. a day that did not go according to plan
48. a time you received good news
49. a public event you went to — a match, concert or festival
50. an occasion when you were given a responsibility
51. a family gathering you remember
52. a time you were surprised by someone's kindness
53. an event in your country that most people remember
54. a time when the weather affected your plans
55. an occasion when you had to wait a long time
56. a meal you remember well

---

**F5 · DESCRIBE AN EXPERIENCE ("a time when…")**

Distinct from F4: an *event* is a bounded occasion with a name; an *experience* is a slice of the
candidate's life framed around a problem or a lesson. It is a very large family and the one that
produces the best speaking, because it has a built-in narrative arc.

*Bullet grammar:* what the situation was · why it happened / what you had to do · how it turned
out · **and explain what you learned** / how you felt afterwards.

*Language load:* past narrative **plus** evaluative retrospect (`looking back`, `in hindsight`,
`if I'm honest`); `had to` / `managed to` / `ended up -ing`; **third conditional** for regret
(`I should have…`, `if I'd known…`). This is where a band 7 candidate separates from a band 6.

Subjects (14):
57. a time you helped someone solve a problem
58. a time you learned something from a mistake
59. a time you had to change a plan at short notice
60. a time you worked with other people towards a goal
61. a time you were late for something important
62. a time you disagreed with someone and it turned out well
63. a time you tried something you were not good at
64. a time you had to be patient
65. a time you spent a whole day outdoors
66. a time you got lost
67. a time someone gave you honest feedback
68. a time you saved up for something
69. a journey that took much longer than expected
70. a time you had to explain something difficult to someone

---

**F6 · DESCRIBE AN ACTIVITY OR HABIT**

*Bullet grammar:* what it is · when and how often you do it · who you do it with / how you started
· **and explain why** you enjoy it / why you keep doing it.

*Language load:* present simple + frequency adverbs; **`used to` / `would` for lapsed habits**;
gerunds after verbs of liking (`I'm into…`, `I've got into the habit of -ing`); process language
(`first you…, then…`).

Subjects (10):
71. an activity you do to relax after work or study
72. a form of exercise that suits you
73. something you do at the weekend that you look forward to
74. a hobby you would like to take up
75. a skill you practise regularly
76. something you do that other people find unusual
77. an activity you enjoy doing alone
78. something you do with your family regularly
79. a job around the house you don't mind doing
80. an activity you gave up and might return to

---

**F7 · DESCRIBE MEDIA (a book, film, song, programme, website, app)**

Often folded into F3, but the language load is different enough to justify separating it.

*Bullet grammar:* what it is · when you first came across it · what it is about / what it does ·
**and explain why** it stayed with you / why you would recommend it.

*Language load:* **present simple for plot and content** (`it's set in…`, `it follows a man who…`)
— candidates routinely and wrongly use past tense here; `it's about`, `it deals with`,
`the point it makes is…`; recommendation exponents (`I'd definitely recommend it to anyone who…`).

Subjects (10):
81. a book you have read more than once
82. a film that made you think differently about something
83. a song that means something to you
84. a television programme people in your country watch
85. a website or app you use almost every day
86. a piece of news you followed closely
87. an advertisement you thought was clever
88. a photograph you value
89. a podcast, channel or online series you follow
90. a piece of art or a performance you saw

---

**F8 · DESCRIBE AN ABSTRACT IDEA (a plan, a decision, a change, a skill, a goal, a rule)**

The hardest family and the least well covered by third-party material — which is exactly why we
should cover it well.

*Bullet grammar:* what it is/was · why it came about · what it involved / how you went about it ·
**and explain how you feel** about it now / what difference it made.

*Language load:* **future forms for plans** (`I'm planning to`, `I'm hoping to`, `the idea is
to…`); **`decide to` / `end up -ing` / weighing language** for decisions (`on the one hand`,
`what tipped the balance was…`); **present perfect for change** (`things have got a lot better
since…`); process language for skills. Highest teaching value per card.

Subjects (12):
91. a plan you have for the next few years
92. a decision you took a long time to make
93. a change in your life that turned out well
94. a skill you taught yourself
95. a goal you are working towards at the moment
96. a rule at your school or workplace that you agree with
97. a change you would like to see in your town
98. a piece of advice you would give to someone younger
99. a subject you would like to know more about
100. a habit you have managed to break or build
101. a way of doing something that you have improved
102. a promise you made to yourself

**Total: 102 cue-card subjects across 8 families** (target was 40+).

### 2.2 Rounding-off questions

Format fact: after the long turn the examiner asks **1–2 very short follow-ups**, answered in a
sentence or two, that pivot slightly off the card. In the official sample (object card) they probe
*monetary value* and *replaceability*. Good rounding-off questions are:

- a different *attribute* of the same thing (value, frequency, who else knows about it),
- a *counterfactual* (would you do it again / could you replace it),
- a *social* probe (do other people you know do this too).

They must be answerable without a second long turn. Authors: never write a rounding-off question
that is really a Part 3 question.

---

## 3. PART 3 — deriving discussion themes

### 3.1 The abstraction moves

Part 3 is generated by applying a transformation to the Part 2 subject. There are ten moves that
account for essentially everything. Name the move you used in `card_sets.payload_json.lineage`.

| # | Move | Transformation | Language it forces |
|---|---|---|---|
| M1 | **Individual → society** | the candidate's instance becomes "people in general" | quantifiers, `tend to`, `by and large` |
| M2 | **Present → future** | current state becomes a prediction | `will`, `is likely to`, `I can see X -ing`, hedging |
| M3 | **Present → past (generations)** | compare with parents'/grandparents' time | `used to`, present perfect, comparatives |
| M4 | **Cause** | why does this happen | `stems from`, `is largely down to`, `owing to` |
| M5 | **Effect / consequence** | what follows from it | `leads to`, `means that`, `as a result` |
| M6 | **Responsibility** | who should act — individual, family, employer, school, government | modals of obligation, `it's down to`, passive `should be regulated` |
| M7 | **Trade-off / evaluation** | benefits vs drawbacks, is it worth it | `on balance`, concession (`while…, …`), `the downside is` |
| M8 | **Comparison of groups** | young vs old, rural vs urban, men vs women, rich vs poor, one country vs another | comparatives, `whereas`, `in contrast` |
| M9 | **Hypothetical** | what if it disappeared / what if everyone did it | second conditional, `supposing`, `I imagine` |
| M10 | **Definition / criteria** | what counts as X, what makes a good X | defining relative clauses, `by that I mean` |

**Authoring rule for a `part3_themes` block:** two or three themes; within a theme, the three
questions should use **three different moves**, and at least one should be M2, M6 or M9 (the moves
that separate band 7 from band 6). Our existing `counterpoint` field should hold a one-line
*opposing position* the candidate can be pushed onto — this mirrors the real examiner behaviour of
challenging an answer ("You don't think of it as a healthy way of thinking?" in the official
transcript). Keep writing them; they are the most distinctive teaching asset we have.

### 3.2 How the derivation actually runs

Worked derivation, using our own subjects (this is the pattern, not a reproduction):

- Part 2 *a teacher who changed how you think about a subject* → **not** "your teacher". Themes:
  *what makes teaching effective* (M10, M7), *how learning has changed* (M3, M2).
- Part 2 *a time you were late for something important* → themes: *attitudes to punctuality*
  (M1, M8 across cultures), *how people manage their time now* (M3, M5).
- Part 2 *something you bought that was a waste of money* → themes: *why people buy things they
  don't need* (M4), *advertising and pressure to spend* (M5, M6).
- Part 2 *a quiet place you go to think* → themes: *noise in cities* (M1, M5), *whether cities can
  be designed for calm* (M6, M9).

Record this in `lineage` as a single sentence naming the Part 2 instance and the two themes with
their moves, e.g. *"Part 2 asks about one lapsed habit; Part 3 generalises (M1) to why habits fail
and projects forward (M2) to whether technology can sustain them."*

### 3.3 Theme patterns (30)

These are the recurring *discussion themes* that Part 3 lands on, regardless of which Part 2
subject fed into them. Each is a legitimate `part3_themes[].title` seed. Mapped to `topic_id`
because Part 3 cards are the ones that should carry our society-level topics.

| # | Theme pattern | Usual moves | `topic_id` |
|---|---|---|---|
| T1 | how the education people receive is changing | M3 M2 | `topic_education` |
| T2 | what makes someone good at teaching or learning | M10 M7 | `topic_education` |
| T3 | who should pay for education and training | M6 M7 | `topic_education` |
| T4 | how the nature of work is changing | M3 M2 | `topic_work` |
| T5 | how people choose a career, and how much choice they really have | M4 M8 | `topic_work` |
| T6 | the balance between work and the rest of life | M7 M6 | `topic_work` |
| T7 | how technology has changed the way people talk to each other | M3 M5 | `topic_communication` |
| T8 | whether new technology helps or isolates people | M7 M9 | `topic_technology` |
| T9 | automation, AI and what happens to jobs | M2 M5 | `topic_technology` |
| T10 | how cities change and who decides | M4 M6 | `topic_urbanisation` |
| T11 | the cost and availability of housing | M4 M6 | `topic_housing` |
| T12 | the pull of cities and the emptying of rural areas | M5 M8 | `topic_urbanisation` |
| T13 | who is responsible for protecting the environment | M6 M7 | `topic_environment` |
| T14 | changing habits around waste and consumption | M3 M5 | `topic_environment` |
| T15 | how climate affects the way people live | M5 M2 | `topic_environment` |
| T16 | personal choice versus public responsibility for health | M6 M7 | `topic_health` |
| T17 | how diets and eating habits have changed | M3 M4 | `topic_food` |
| T18 | stress, rest and mental wellbeing in modern life | M4 M5 | `topic_health` |
| T19 | how families are organised, and how that has shifted | M3 M8 | `topic_family` |
| T20 | what older and younger generations expect of each other | M8 M1 | `topic_family` |
| T21 | how people spend money and why they spend it that way | M4 M5 | `topic_money` |
| T22 | advertising, persuasion and what confers status | M5 M10 | `topic_media` |
| T23 | how people get their news and whether they trust it | M3 M7 | `topic_media` |
| T24 | keeping traditions alive when life changes fast | M7 M9 | `topic_culture` |
| T25 | what travel does to places and to travellers | M5 M7 | `topic_tourism` |
| T26 | how people move around, and how they will in future | M2 M6 | `topic_transport` |
| T27 | rules, fairness and how societies enforce them | M6 M10 | `topic_crime` |
| T28 | what a global culture gains and loses | M7 M8 | `topic_globalisation` |
| T29 | how countries develop and who benefits | M4 M8 | `topic_economy` |
| T30 | why some skills and interests spread and others fade | M4 M2 | `topic_sport` / `topic_culture` |

Five more that recur but sit across topics: **T31** what counts as success (M10 M8,
`topic_work`); **T32** how much people trust institutions (M6 M3, `topic_media`); **T33** the
value of doing things slowly or by hand (M7 M3, `topic_culture`); **T34** how research and science
reach ordinary life (M5 M6, `topic_science`); **T35** whether people are more or less connected
than they used to be (M3 M7, `topic_communication`).

**Total: 35 theme patterns** (target was 25+).

---

## 4. Weighting — what is heavily represented, what is rare

### 4.1 Part 1

- **Always present:** work/study, hometown, home. Sources are unanimous, and the official sample
  test opens on hometown → accommodation. **Build 5–6 distinct frames each** so a learner can
  practise the guaranteed content repeatedly without memorising a single set.
- **Heavily represented:** the everyday Tier 2 set — routine, free time, food, weather, travel,
  transport, music, sport, phones, internet. **2 frames each.**
- **Rare but real:** Tier 3. **1 frame each**, and label them in tags so the UI can offer a
  "curveball" practice mode. Their teaching value is disproportionate: they train the candidate to
  *generate content about anything*, which is the actual Part 1 skill.
- **Rising, per recent reporting:** AI/robots in daily life, apps, mental wellbeing, remote/hybrid
  working, sustainability habits. Worth over-indexing slightly relative to historic lists.

### 4.2 Part 2

Approximate weighting for our pack, reflecting reported frequency rather than equal division:

| Family | Share of our cards | Why |
|---|---|---|
| F2 Place | ~18% | most frequently reported family |
| F5 Experience ("a time when…") | ~18% | very large family, best language load |
| F1 Person | ~15% | classic, always present |
| F4 Event/occasion | ~13% | classic |
| F3 Object | ~13% | historically lighter but reported rising |
| F6 Activity/habit | ~10% | steady |
| F7 Media | ~7% | steady, narrow |
| F8 Abstract | ~6% of cards but **flag every one as `stretch`** | rarest and hardest; under-served elsewhere, so a differentiator for us |

One source reports that technology, environment, education and health themes account for roughly
half of recent cue cards. Treat that as directional only — it comes from an aggregator of
test-taker reports, not from the exam boards, and no official frequency data exists. Do not let it
skew us so far that classic person/place/object coverage thins out.

### 4.3 Part 3 and our topic list

Our twenty `topic_id`s split cleanly by part:

- **Part 1-heavy:** `topic_housing`, `topic_food`, `topic_sport`, `topic_family`, `topic_transport`,
  `topic_tourism`, `topic_health`, `topic_environment`, `topic_technology`, `topic_culture`.
- **Part 3-heavy (rarely natural in Part 1):** `topic_crime`, `topic_globalisation`,
  `topic_economy`, `topic_urbanisation`, `topic_science`.
- **Both:** `topic_work`, `topic_education`, `topic_media`, `topic_communication`, `topic_money`.

A card *set* may legitimately have a Part 1 card on `topic_housing` and a Part 3 card on
`topic_urbanisation` — the existing `set_home_neighbourhood_001` already does exactly this, and it
is the correct pattern. The set's own `topic_id` should be the Part 1/Part 2 topic (the concrete
one), not the Part 3 abstraction.

### 4.4 Gaps in our current 12 sets

Present today: housing/neighbourhood, work/study, technology, learning/skills, health/habits,
environment, plus six more. **Not yet covered at all**, and high-priority for the authoring agents:

- **F5 Experience cards** — almost absent, yet it is one of the two biggest families.
- **F1 Person cards** — the classic family, and we appear to have little.
- **F7 Media cards** — books, films, songs, programmes.
- **F8 Abstract cards** — plans, decisions, goals, rules.
- Part 1 Tier 3 curveballs — none.
- `topic_crime`, `topic_globalisation`, `topic_economy`, `topic_science`, `topic_tourism`,
  `topic_food`, `topic_sport`, `topic_money`, `topic_communication` — thin or unrepresented.

---

## 5. Authoring checklist (paste this into every authoring agent's brief)

1. **Say it aloud.** If it doesn't sound like a spoken examiner question, rewrite it. Examiners use
   contractions, short forms and occasional tags. They do not write essay prompts.
2. **One angle per Part 1 question**, 4–6 per frame, no repeats, opening easy and closing on light
   opinion. Every question answerable in 2–4 sentences.
3. **Part 2 = 3 bullets + "and explain…" + 1–2 rounding-off.** Never four plain bullets.
4. **Part 3 = 2–3 named themes, 2–3 questions each, three different abstraction moves per theme,
   at least one of M2/M6/M9, plus a `counterpoint`.**
5. **Name the derivation in `lineage`** using the M-codes from §3.1.
6. **Every card's `tags_json` should include its family (F-code slug) and its dominant language
   load** (`past-narrative`, `present-perfect`, `second-conditional`, `comparatives`, …) so the
   teaching layer can target practice.
7. **Difficulty:** `core` for Part 1 and most Part 2; `stretch` for all Part 3 and all F8 abstract
   cards. Those are the only two allowed values (`validate.py`).
8. **Copyright self-check before you commit a question:** did I read this sentence somewhere? If
   there is any doubt, throw it away and write a different one on the same subject.

---

## Sources

Official / exam-partner material (preferred, and treated as authoritative on format):

- [IELTS Academic: Speaking test format — ielts.org](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-speaking)
- [IELTS General Training: Speaking test format — ielts.org](https://ielts.org/take-a-test/test-types/ielts-general-training-test/ielts-general-training-format-speaking)
- [IELTS Speaking Sample Tasks (PDF) — ielts.org](https://ielts.org/cdn/ielts-sample-tests/ielts-speaking-sample-tasks-2023.pdf) — the single most useful source; supplied the Part 1 frame structure, the exact task-card layout with rounding-off questions, and the Part 3 examiner-frame structure with named sub-themes
- [Three parts of IELTS Speaking, and what to look out for — ielts.org](https://ielts.org/news-and-insights/three-parts-of-ielts-speaking-and-what-to-look-out-for)
- [Demystifying the IELTS Speaking test — ielts.org](https://ielts.org/news-and-insights/demystifying-the-ielts-speaking-test)
- [Free IELTS Speaking practice tests — British Council](https://takeielts.britishcouncil.org/take-ielts/prepare/free-ielts-english-practice-tests/speaking)
- [IELTS Academic Speaking official practice materials — IDP](https://ielts.idp.com/about/ielts-academic-preparation/ielts-academic-speaking)
- [Cue card topics for the Speaking test — IDP](https://ielts.idp.com/thailand/about/news-and-articles/article-cue-card-topics-for-speaking-test) — confirms 1 min prep / 1–2 min turn and that no official frequency breakdown is published

Teaching material, used only to establish which *subject areas* recur (wording discarded):

- [IELTS Speaking Part 1 Topics — IELTS Liz](https://ieltsliz.com/ielts-speaking-part-1-topics/) — broadest Part 1 area list, including the rare/quirky set
- [IELTS Speaking Part 2 Topics — IELTS Liz](https://ieltsliz.com/ielts-speaking-part-2-topics/) — subjects grouped by family
- [IELTS Speaking Part 3 Topics — IELTS Liz](https://ieltsliz.com/ielts-speaking-part-3-topics-2/) — Part 3 theme labels and recurring abstraction patterns
- [IELTS Speaking Topics 2026 — IELTS Liz](https://ieltsliz.com/ielts-speaking-topics-2026/) — confirms the three fixed Part 1 frames and that topics are recycled, not published
- [Part 2 cue card topics and tips — Keith Speaking Academy](https://keithspeakingacademy.com/ielts-speaking-part2-cue-card-topics-tips/) — five-family taxonomy with per-family bullet structures and the "a person" vs "a person you know" distinction
- [Part 3: six common question types — IELTS Focus](https://ieltsfocus.com/2017/08/22/ielts-speaking-part-3-6-common-questions/) — the basis of the abstraction-move table
- [Part 2: the 8 categories — SpeakPrac](https://speakprac.com/ielts-speaking-course/part-2/questions-topics/) — the eight-family split (separating experience, media and decision/change) and the claim that eight families cover ~90% of cards
- [Common Speaking topics for Part 2 — IELTS Buddy](https://www.ieltsbuddy.com/ielts-speaking-topics.html) — cross-check on family membership
- [Part 3: handling abstract questions — 3D Academy](https://3d-universal.com/en/blogs/ielts-speaking-part-3-how-to-handle-abstract-questions.html) — the time / scale / stakeholders / trade-offs / criteria lens set
- [Part 3: question types and assessment — IELTS Material](https://ieltsmaterial.com/speaking/ielts-speaking-part-3/)
- [Part 3: seven common questions — IELTS Advantage](https://www.ieltsadvantage.com/2015/04/03/ielts-speaking-part-3-common-questions/)
- [IELTS Speaking Topics 2026 — Cathoven](https://resources.cathoven.com/ielts-speaking/topics-2026) — four-monthly rotation claim and the "~55% of cue cards fall in four themes" figure
- [Speaking topics 2026 — TalkDrill](https://www.talkdrill.com/blog/exams/ielts-speaking/ielts-speaking-topics-2026/) and [Gradding Part 1 topics](https://www.gradding.com/blog/ielts/ielts-speaking-part-1-questions) — corroboration on the everyday rotating set

### Where sources disagree

1. **Cue-card bullet count** — "4 bullets" (most coaching sites) vs "3 bullets + an explain line"
   (the official card). Resolved in favour of the official card; our 4-element array with an
   "and explain…" fourth element represents it faithfully.
2. **Number of families** — 5 (classic) vs 8 (finer split). We adopt 8 because the extra families
   carry distinct language loads, which is what our teaching notes need.
3. **Frequency claims** — several aggregators publish confident percentages ("90% in 8 categories",
   "55% in four themes", "50% of cards rotate every four months"). **No exam partner publishes
   frequency data.** These figures come from crowd-sourced test-taker reports and should steer
   weighting only mildly. IELTS Liz and IDP both state explicitly that topics are not released.
4. **"Predicted topics" lists** — every prediction site claims currency; they cannot be verified and
   are, in any case, the highest-risk material to read closely. They were used only to note *rising
   subject areas* (AI, remote work, mental health, sustainability). No wording was taken from them.

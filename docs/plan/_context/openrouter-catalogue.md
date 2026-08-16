# Fetching the OpenRouter catalogue

Measured against the live API on 16 August 2026. Written down because the two facts below cost
an hour to find and are not in the obvious place.

## The two facts

**1. Audio models are not in the default model list.** `GET /api/v1/models` returns 413 models
and not one of them is Kokoro, Aura-2, Nova-3, Qwen3 ASR or Voxtral Transcribe. Filtering that
response by `input_modalities` or `output_modalities` containing `audio` finds nothing useful
either: it returns the four chat models that happen to accept or emit audio inline, which are
not what a text-to-speech or transcription request wants.

**2. The modality names for audio models are `speech` and `transcription`, not `audio`.** That
is the whole trick. A text-to-speech model declares `output_modalities: ["speech"]` and a
transcription model declares `output_modalities: ["transcription"]`, and the list endpoint
filters on exactly those strings.

```
GET /api/v1/models                                    -> 413 language models
GET /api/v1/models?output_modalities=speech           ->  18 text-to-speech models
GET /api/v1/models?output_modalities=transcription    ->  19 transcription models
```

No API key is needed to list. A key is needed to call a model.

`?category=` is unrelated: it takes subject matter (`programming`, `roleplay`, `health` and so
on) and rejects anything else with a 400 whose body helpfully lists the valid values.

## What a model object carries

Everything the settings form needs, so nothing has to be hardcoded:

- `id` — what you send as `model`
- `name`, `description` — what to show a learner
- `pricing` — per-token for language models, per-character or per-second for audio
- `context_length`
- `architecture.input_modalities` / `output_modalities`
- `supported_voices` — populated for text-to-speech and empty elsewhere. Deepgram's Aura-2
  lists 90, Flux 36, MAI-Voice-2-Flash 4. This is where a voice picker gets its options rather
  than from a list we maintain by hand.

A single model can also be fetched by id, which is how the audio models were found in the first
place:

```
GET /api/v1/models/hexgrad/kokoro-82m/endpoints
    -> architecture.input_modalities  ["text"]
       architecture.output_modalities ["speech"]
```

## The endpoints these models are called through

- `POST /api/v1/chat/completions` — language models
- `POST /api/v1/audio/speech` — text to speech. Returns raw audio bytes, not JSON.
- `POST /api/v1/audio/transcriptions` — speech to text. Takes base64 audio in an
  `input_audio` object with `data` and `format`; returns `{text, usage}` where usage carries
  seconds, tokens and cost.

Both audio endpoints are shaped like the OpenAI ones.

## Why this matters for the settings screen

The provider list is deliberately short: OpenRouter for anything remote, and Ollama, Kokoro and
Whisper locally. Each of the three jobs is chosen independently, so a learner can send marking
to OpenRouter and keep their voice on the machine, or any other combination.

That makes a hardcoded model list the wrong shape twice over. It goes stale, and it cannot know
which voices a text-to-speech model offers. Fetch the list for the modality being configured,
show name and price, and read the voice options off `supported_voices`.

Cache it. The catalogue changes weekly, not per keystroke, and the settings screen should not
hit the network every time somebody opens a dropdown.

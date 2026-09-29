# Ledger — LinkedIn launch video

56.0 s · 1080×1350 (4:5) · 30 fps CFR · 120 BPM (beat 0.5 s = 15 frames, bar 2 s) · 28 bars.
Muted-autoplay first: every idea lands in type; audio is a bonus.

## Logline

Most observability tells you your LLM app got slower. Ledger tells you why it got dumber: it scores
every trace, a bad score dispatches a diagnostic swarm that fires the matching fix, and when the
evidence splits it refuses to guess.

## Message hierarchy

1. **It scores every trace, not a sample** (RAGAS + DeepEval on every OTel trace).
2. **A bad score diagnoses and fixes itself** (flag → LangGraph swarm → remediation tool, no one paged).
3. **It refuses to guess** (mixed evidence escalates to a human instead of taking the argmax). This is
   the takeaway.
4. Proof, not polish: real code paths, real scenario output, the real UI. CTA: the GitHub repo.

## Truth notes (code wins over README)

| Claim that could drift | What the code actually does | Where |
|---|---|---|
| README shows `reindex:ok` | reindex returns `triggered_stub` (Redis flag + timestamp only); on screen only as "reindex (stub)" | `backend/app/agents/tools/reindex_tool.py:39` |
| Scenario B "rollback applied" | the test seeds v1 active / v2 inactive, so the real result is `rollback:already_applied`, `active_version=1`; copy says "Rollback fired", the callout says `rollback → v1 active` | `data/fixtures/scenario_B.json`, `data/logs/B.log` |
| "malformed payload → 400" | a JSON *syntax* error is a `ValueError` → **415**; structural / protobuf garbage → 400; never 500. Kept off screen | `data/fixtures/ingest.json`, `traces.py:80-85` |
| "never all four" | a mixed signal wakes all 4 diagnostics (scenario C); only a single-domain signal wakes 2 | `data/logs/C.log` |
| Ollama "never skipped" | the floor skips the token bucket and the daily quota, not the enabled / available / quality-gate / health checks | `backend/app/router/selector.py:52-64` |
| Router fall-through in the UI | the TierCascade fall runs on a **simulated outage** fixture; the caption is conditional ("When a tier fails…") | `data/fixtures/ui_router_outage.json` |
| Hook latency chip | 376 ms is the real generation-span latency of the seeded trace (seed 85). No ✓: injected hallucination spans carry status 2 (ERROR) | `data/fixtures/hook_trace.json`, `seed_synthetic_traces.py:70` |
| "OpenTelemetry" | the repo says OTel / OTLP; the pipeline caption is the author's own line, "OTel traces land over OTLP." | `linkedin_post.txt:5` |
| UI timing | scene 6 starts when the page mounts; the first click lands at +0.5 s, before the app's own 750 ms auto-play tick; the last node appears 750 ms after ▶ play, from the app's interval | `tools/capture-ui.js`, `useTrailReplay.ts:3` |
| UI in scene 7 | the four reveals come from scrubbing the app's own replay slider one step per 8th note (native input events), not from a sped-up auto-play | `tools/capture-ui.js` |
| Replay-bar glyphs | ⏮ ◀ ▶ ⏸ render through Segoe UI Emoji on Windows (the app's own Tailwind font stack); captured as-is, not restyled | `frontend/tailwind.config.ts` (default `sans`) |
| Test count | 28 test functions in 7 files (README says "6 suites"); not on screen | `facts.json: tests.count` |

No invented metrics. No throughput, latency benchmark or user counts. No deployed URL.
Meter count-ups pass through transient values; only the landed values (fixtures) are claims.

## Storyboard (bar grid)

Times are seconds. Copy in `code` is monospaced data; copy in "quotes" is display/caption type.
Every technical string is read from `src/data/facts.json` (ids resolve to file:line there) or from
`data/fixtures/*.json`; `tools/qa.js` checks every on-screen token against them.

| bar | time | scene | verbatim on-screen copy | visual | motion | SFX / music | source |
|---|---|---|---|---|---|---|---|
| 1 | 0.00–2.00 | 1 HOOK | `scripts/seed_synthetic_traces.py` · `rag.generation · gen_ai.completion` · "Refunds are processed via carrier pigeon within three lunar cycles." · (0.75) `Q · What is the refund policy?` · (1.75) `rag.retrieval · retrieval.documents` "Our refund policy allows customers to request a full refund within 30 days of purchase." | frame 0 already readable (thumbnail-grade): mono label + huge answer on ruled ink paper, red margin rule | Q slides down (0.5 s enter); the context prints 1.85–2.95 | pad (Fm) + quiet ticks; key ticks every 3 chars while printing | seed.span.generation `seed_synthetic_traces.py:101`, seed.attr.completion `:108`, seed.hallucinated `synthetic_qa.py:61`, seed.question `synthetic_qa.py:18`, seed.span.retrieval `:86`, seed.attr.documents `:94`, seed.context `synthetic_qa.py:21` |
| 2 | 2.00–4.00 | 1 HOOK | (2.50) `376 ms` · (3.50) "Fast." | latency chip under the answer; "Fast." muted caption | chip enter 0.45 s; word enter 0.45 s | pad | `hook_trace.json` generation_latency_ms (seed 85) |
| 3 | 4.00–6.00 | 1 HOOK | (4.00) "Confident." · (5.00) "Wrong." | 5.00: **paper inversion #1**, red strike through every answer line | hard flip on the beat; strikes draw 5.00–5.18 | **low hit** @5.00 | copy |
| 4 | 6.00–8.00 | 2 PROBLEM | `app/eval/drift.py` · "Most observability tools tell you / your LLM app got slower." · `0.85` · `faithfulness · last 20 · baseline 0.85` | hard cut; the line lands with the cut; scenario B's faithfulness window draws below (10 × 0.90, 10 × 0.25), dashed baseline | points 6.2–7.1 (linear) | **pulse enters** (sub on 8ths) | voice.slower `linkedin_post.txt:1`, drift.baseline.faithfulness `drift.py:23`, drift.window `drift.py:30`, `scenario_B.json` faithfulness_history |
| 5 | 8.00–10.00 | 2 PROBLEM | "Almost none / tell you why / it got dumber." · (9.50) `− 0.15` | headline; red underline under "dumber." | words 8.0 (0.05 stagger); underline 8.6–9.0; floor line 9.5 | pulse + pad | voice.dumber `linkedin_post.txt:1`, drift.threshold `drift.py:29` |
| 6 | 10.00–12.00 | 2 PROBLEM | `0.575` · stamp `faithfulness_drift` | the window mean lands on the real 0.575, under the floor; red stamp | mean line 9.5–10.5 (move ease), label 10.5; stamp @10.5 (−3°, 1-frame overshoot) | pulse + pad | `scenario_B.json` drift.window_mean, flag.reason.faithfulness_drift `eval_tasks.py:53` |
| 7 | 12.00–14.00 | 3 TITLE | "Who watches / the watchmen." · README ASCII `LEDGER` | the question lands with the cut, the logo answers, inked cell by cell (SVG grid) | logo 12.5–13.3; hold | pulse + pad | brand.tagline_short `README.md:12`, brand.logo `README.md:4-9` |
| 8 | 14.00–16.00 | 4 PIPELINE | `app/api/v1/endpoints/traces.py` · `OTLP · protobuf \| json` · `POST /api/v1/traces` · `X-API-Key · ingestion` · "OTel traces land over OTLP." | row-insert wipe into one continuous camera move; ◆ (the trace) rides the red margin | wipe 0.5 s; edges draw as the ◆ travels | **full groove** (kick on 1 & 3, sub 8ths, hat 8ths); pad LP opens 900 Hz → 2.4 kHz over the scene | otlp.* `otel_receiver.py:29-31`, api.* `traces.py:68` + `main.py:61`, api.header `security.py:28`, api.scope.ingestion `security.py:15`, voice.otlp `linkedin_post.txt:5` |
| 9 | 16.00–18.00 | 4 PIPELINE | `200 · accepted_spans 3 · traces 1` · `queue · ingestion` · `app/tasks/ingestion_tasks.py` · `ingest_traces` | the real 200 response branches off the endpoint | chip 15.75; camera move 16.5–17.75 (12 rows) | groove | `ingest.json` accepted, celery.queue.ingestion `celery_app.py:45`, task.ingest `ingestion_tasks.py:52` |
| 10 | 18.00–20.00 | 4 PIPELINE | `ClickHouse · ledger.traces` · `MergeTree · daily partitions · 90-day TTL` · `Langfuse · non-fatal` · `eval_trace.delay` · `queue · eval` · "Stored, then scored. / Every trace, not a sample." | ClickHouse branch solid, Langfuse dashed (non-fatal) | branches 18.15–19.3 | groove | ch.* `schema.sql:8-24`, task.langfuse_nonfatal `ingestion_tasks.py:37`, task.eval_chain `ingestion_tasks.py:44`, voice.every_trace `linkedin_post.txt:7` |
| 11 | 20.00–22.00 | 4 PIPELINE | `app/tasks/eval_tasks.py` · `eval_trace` · RAGAS `faithfulness 0.25` `context_precision 0.90` `context_recall 0.90` · DeepEval `answer_relevance 0.30` `hallucination 0.60` · `JudgeRouter · non-paid` `cerebras · groq · ollama` | failing bars turn red when they land | camera 19.5–21.0 (12 rows); count-up 21.0–22.0 | groove | eval.* `ragas_runner.py:67-69`, `deepeval_runner.py:66-67`, `scenario_B.json` eval_scores, judge.* `judge_router.py:24-34` |
| 12 | 22.00–24.00 | 4 PIPELINE | "A bad score doesn't page a human…" · `Scenario B` / `tests/integration/test_diagnostic_swarm.py` · `_flag_reasons: any metric < 0.5,` / `hallucination > 0.5, or faithfulness drift` · stamp `flagged` · `low_faithfulness · low_answer_relevance` / `high_hallucination · faithfulness_drift` | corner tag; the rule prints; ◆ turns red | rule 22.25–23.4; stamp @23.5; reasons 23.75 | groove; key ticks while the rule prints | flag.* `eval_tasks.py:26-67`, `scenario_B.json` flag.reasons, scenario.B `test_diagnostic_swarm.py:77` |
| 13 | 24.00–26.00 | 4 PIPELINE | `run_diagnostic.delay → queue · diagnostic` | camera to the swarm map | camera 25.5–27.0 (16 rows) | groove | task.diag_delay `eval_tasks.py:59`, celery.queue.diagnostic `diagnostic_tasks.py:19` |
| 14 | 26.00–28.00 | 4 PIPELINE | `app/agents/graph.py` · "…it dispatches a diagnostic swarm." · `classifier` · `retrieval_diagnostic` `index_diagnostic` `prompt_diagnostic` `model_diagnostic` | the classifier's targets only: red ◆ packets to prompt + model; retrieval + index stay muted | fan-out 26.5; packets 27.2–27.8 (MotionPath, linear) | groove | swarm.node.* `graph.py:65-72` / `state.py:19-22`, `scenario_B.json` classification.targets |
| 15 | 28.00–30.00 | 4 PIPELINE | `decision` · `remediation` · `reindex (stub) · rollback · reroute` · `human_review` | only the diagnostics that ran join the decision | joins 27.9–28.5; decision 28.4; terminals 28.85; settled 29.3 | groove | remedy.* `remediation.py:5-8`, tool.reindex.is_stub `reindex_tool.py:1` |
| 16 | 30.00–32.00 | 5 ROUTER | `app/router/selector.py` · real TierCascade · chips `unhealthy` · "When a tier fails, the next serves. / Local Ollama is the floor." | hard cut; the app's own card on a simulated-outage fixture, left; selector skip reasons, right; the caption lands with the cut | the real framer-motion fall 30.5–32.0 (captured frame by frame); a chip per tier as the signal passes | groove | router.skip.unhealthy `selector.py:61`, tier.* `tiers.py:42-72`, `ui_router_outage.json` |
| 17 | 32.00–34.00 | 5 ROUTER | chip `floor` · `floor: no token bucket, no daily quota` · `JudgeRouter · paid provider → PaidJudgeError` | green floor chip at ollama | chip 32.0; note 32.25; judge line 32.5 | groove | router.floor_reason `selector.py:64`, router.lua `rate_limiter.py:23`, router.daily `:7`, judge.error `judge_router.py:30` |
| 18 | 34.00–36.00 | 6 AUTO-FIX | `features/diagnostic-swarm/IncidentTrailReplay.tsx` · real UI (incident B) · cursor → `step ▶`, `step ▶`, `▶ play` | hard cut: the app mounts (classifier types its candidate); the cursor clicks where each control really was | cursor 34.0–34.4; clicks 34.5, 35.0, 35.5 (press: scale 0.9 + ring 0→40 px) | groove; **click** ×3 | fe.step_label `IncidentTrailReplay.tsx:58`, fe.play_label `:50`, `api_incident_B.json` |
| 19 | 36.00–38.00 | 6 AUTO-FIX | Remediation reveals · `prompt_regression · 1.00` / `faithfulness 0.90 → 0.25 after v2` · "Root cause: a prompt change. / Rollback fired. No one paged." | 36.25: the app's own 750 ms tick reveals Remediation; camera closes in on culprit + fix; 55 % dim mask, 2 px leader | camera 36.55–37.55; mask 37.0; callout 37.4; caption 37.5 | groove | fe.step_ms `useTrailReplay.ts:3`, `scenario_B.json` findings |
| 20 | 38.00–40.00 | 6 AUTO-FIX | `rollback → v1 active` · stamp `resolved` · terminal strip: B's structlog lines, verbatim | the mask moves to the Remediation node; green stamp | callout 38.5; stamp @39.0 | groove | `scenario_B.json` tool_result, incident.status.resolved `models.py:49`, `data/logs/B.log` |
| 21 | 40.00–42.00 | 6 AUTO-FIX | (hold) | settled | hold | groove (last full bar before the silence) | — |
| 22 | 42.00–44.00 | 7 REFUSES | `app/agents/nodes/decision.py` · real UI (incident C): the four diagnostics · `generation` `model_degradation 1.00` · `retrieval` `retrieval_failure 0.85` · (43.0) "When the evidence splits…" | hard cut; the graph fills the width; all four light **amber** | slider scrubs 42.0 / 42.25 / 42.5 / 42.75; leaders drop 43.0 | **hard silence**; 4 pitched **blips** on the reveals | `api_incident_C.json`, `scenario_C.json` decision.best / runner_up, bucket.* `state.py:32-35` |
| 23 | 44.00–46.00 | 7 REFUSES | "When the evidence splits…" · **"It refuses / to guess."** | **paper inversion #2** | hard flip on the downbeat; hold | **low hit** @44.0; heartbeat starts | voice.refuses `linkedin_post.txt:13` |
| 24 | 46.00–48.00 | 7 REFUSES | `low_confidence  best < 0.55` · `mixed_signal  cross-domain gap < 0.25` · `ambiguous_tie  top-2 gap < 0.10` · `no_candidate  no candidate root cause` · "Four ways to escalate. / One way to act." | the four names land with the flip; the fired one (mixed_signal) turns amber | thresholds print 46.1–47.6; highlight 47.5 | heartbeat; key ticks | decision.reason.* `decision.py:41-67`, thresholds `state.py:26-28`, decision.top2 `state.py:27`, decision.no_candidate_summary `decision.py:35` |
| 25 | 48.00–50.00 | 7 REFUSES | `best model_degradation 1.00` · `vs retrieval_failure 0.85` · `gap 0.15 < 0.25` · `human_review → incident open` · amber stamp `open · needs_human_review` | amber stamp | details 47.65–48.0; outcome 48.0; stamp @48.5 | heartbeat; the only riser 48.5 → 50.0 | `scenario_C.json` (`escalate (mixed_signal): best=model_degradation@1.00 vs retrieval_failure@0.85`), human.* `human_review.py:19-20`, human.flag `_incident.py:39` |
| 26 | 50.00–52.00 | 8 CTA | README ASCII `LEDGER` · `◆ Ledger` · "Not a metric. / A system." · `github.com/smitdighe/Ledger` | row-insert wipe; the app's own green ◆ lockup | logo ink 50.05–50.65; lockup 50.5; closer 51.25; URL prints 51.5 | **full groove returns** | brand.* , voice.metric / voice.system `linkedin_post.txt:24`, brand.repo `.git/config` |
| 27 | 52.00–54.00 | 8 CTA | `FastAPI · LangGraph · Celery · ClickHouse` / `RAGAS · DeepEval · React Flow` | muted stack line | enter 52.0; everything still from 53.0 | groove (VII) | stack.* `pyproject.toml:8-34`, `README.md:213` |
| 28 | 54.00–56.00 | 8 CTA | (final frame, static 53.0–56.0) | static | none | **final chord** (Fm) @54.0, clean stop at 56.0 | — |

Signal colour per scene: 1 red · 2 red · 3 neutral · 4 red (flag) · 5 green (floor) · 6 green (resolved) · 7 amber · 8 green ◆.
Paper inversions: exactly two (5.0 "Wrong.", 44.0 "It refuses to guess.").
Non-tick SFX events: 9 (2 low hits, 3 clicks, 4 blips) + 1 riser.

## Music and sound

120 BPM, F minor, i–VI–III–VII (Fm–D♭–A♭–E♭), one chord per 2 bars; the CTA leans on VII for two
bars and resolves to i on bar 28. Soft kick (sine 110→42 Hz, 0.28 s), sub pulse on 8ths ducked after
each kick, closed hat (noise → HP 7 kHz, 35 ms, low), one pad (3 detuned triangles per chord tone → LP
900 Hz, opening toward 2.4 kHz through scene 4). Arc: bars 1–3 pad + ticks · 4–7 pulse enters · 8–21
full groove · 22 hard silence · 23–25 sparse heartbeat · 26–28 full, final chord, clean stop at 56.0.
Synthesized in-page with a seeded `OfflineAudioContext` (48 kHz stereo); master: compressor → soft
clip, so the two-pass loudnorm stays linear (−14.0 LUFS, −3.2 dBTP). No downloaded audio.

## Voiceover (optional)

Not rendered. For a human read at ~2.3 words/s. Duck music −6 dB under VO.

| in | out | line | words |
|---|---|---|---|
| 0.4 | 3.0 | "Your RAG app just answered a refund question." | 8 |
| 3.4 | 5.6 | "Fast. [beat] Confident. [beat] Wrong." | 3 |
| 6.1 | 11.6 | "Most observability tools tell you your LLM app got slower. Almost none tell you why it got dumber." | 18 |
| 12.1 | 13.9 | "Ledger. Who watches the watchmen." | 5 |
| 14.2 | 21.8 | "OTel traces land over OTLP, get stored, then scored by RAGAS and DeepEval. [beat] Every trace, not a sample." | 19 |
| 22.0 | 29.6 | "A bad score doesn't page a human. [beat] It dispatches a diagnostic swarm that wakes only the diagnostics the signal points at." | 21 |
| 30.1 | 33.8 | "When a tier fails, the next one serves, down to a local Ollama floor." | 14 |
| 34.2 | 41.4 | "Here the swarm finds a prompt change behind the drop and fires the rollback tool. [beat] No one paged." | 18 |
| 42.0 | 43.0 | [silence] | — |
| 43.0 | 45.8 | "When the evidence splits… [beat] it refuses to guess." | 8 |
| 46.1 | 49.7 | "Four ways to escalate. One way to act. The incident stays open for a human." | 15 |
| 50.2 | 53.4 | "Not a metric. A system. Ledger is on GitHub." | 9 |

## Render

All commands run from `video/` on Windows (Node ≥ 20.19). FFmpeg / FFprobe come from `ffmpeg-static`
/ `ffprobe-static` when not on PATH.

```bash
npm install
npx playwright install chromium
npm run facts        # node tools/run-py.js tools/extract_facts.py   -> src/data/facts.json
npm run scenarios    # node tools/run-py.js tools/run_scenarios.py   -> data/fixtures, data/logs (needs Docker)
npm run capture-ui   # node tools/capture-ui.js                       -> assets/ui (+ manifest.json, ui-map.json)
npm run audio        # node tools/render-audio.js                     -> build/audio.wav, audio_sfx.wav, audio_norm.wav, audio_sfx_norm.wav
npm run record       # node record.js                                 -> build/video.mkv (DPR 2, lossless)
npm run encode       # node tools/encode.js                           -> out/final.mp4, out/final_nomusic.mp4, out/thumbnail.png, out/contact-sheet.png
npm run qa           # node tools/qa.js                               -> every gate must pass
```

Stills: `node tools/still.js 5.2 24 44.5 --out out/styleframes`. Segments: `node record.js --from 30 --to 42`
renders `build/seg-030.000-042.000.mkv`; `node tools/encode.js --concat` joins segments losslessly
(concat demuxer, `-c copy`) before the final encode. Drafts: `node record.js --draft` (DPR 1),
`--every 3` (every 3rd frame), `--realtime` (Playwright recordVideo, preview only: drops frames, low bitrate).
Motion strips for review: `node tools/strips.js` → `out/qa/strip-*.png`. Licensed music: drop a file in
`assets/` and run `node tools/render-audio.js --music=assets/music.wav` (trimmed, 0.5 s fades, bar-22
silence kept, mixed under the same SFX).

Exact FFmpeg invocations (`FFMPEG` = the ffmpeg-static binary; the tools print them as they run):

```bash
# frames -> lossless master (record.js; PNG frames piped on stdin, rendered at DPR 2)
FFMPEG -y -f image2pipe -framerate 30 -c:v png -i - -vf "scale=1080:1350:flags=lanczos" -c:v ffv1 -level 3 -pix_fmt bgr0 -r 30 build/video.mkv

# loudness, pass 1 (measure)
FFMPEG -hide_banner -i build/audio.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null -
# loudness, pass 2 (apply the measured values, linear)
FFMPEG -y -i build/audio.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=<I>:measured_TP=<TP>:measured_LRA=<LRA>:measured_thresh=<thresh>:offset=<offset>:linear=true:print_format=summary -ar 48000 -ac 2 -c:a pcm_s24le build/audio_norm.wav
# SFX-only stem at the full mix's gain
FFMPEG -y -i build/audio_sfx.wav -af "volume=<gain>dB,alimiter=limit=0.84:level=false" -ar 48000 -ac 2 -c:a pcm_s24le build/audio_sfx_norm.wav

# final encode
FFMPEG -y -i build/video.mkv -i build/audio_norm.wav -map 0:v -map 1:a -vf "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p" -c:v libx264 -preset slow -crf 17 -tune animation -profile:v high -level:v 4.1 -r 30 -g 60 -bf 2 -maxrate 12M -bufsize 24M -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart -shortest out/final.mp4

# SFX-only version: same picture (stream copy), SFX stem
FFMPEG -y -i out/final.mp4 -i build/audio_sfx_norm.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart -shortest out/final_nomusic.mp4

# thumbnail ("Wrong." frame) and contact sheet
FFMPEG -y -ss 5.5 -i build/video.mkv -frames:v 1 out/thumbnail.png
FFMPEG -y -i out/final.mp4 -vf "fps=1,scale=270:-1:flags=lanczos,tile=8x7:padding=6:color=0x0b0e14" -frames:v 1 out/contact-sheet.png
```

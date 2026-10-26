# Lucky draw reveal: voice-over

The reveal (`website/public/lucky-draw.html`) has a voice-over generated with **Gemini TTS** in
[Google AI Studio](https://aistudio.google.com/), voice **Algenib** ("Gravelly" - a mock-epic, movie-trailer read).
It's ten short clips in `website/public/voiceover/` (mono, 24 kHz, 64 kbps MP3 - about 270 KB in total), each
played at its start time by the `VOICEOVER` list in `lucky-draw.html`. If they can't load, the reveal plays without
them.

The script names no winners, so it's recorded once, before the draw, and works for everyone watching their own
reveal. Tone: a slightly over-the-top game-show host with dry, self-aware jokes (fake "FitCoin®" trademarks, mock
legalese).

## Script and timing

The video is 37 s and stops dead at the end, so every clip has a slot. Start times are on the animation's clock;
lengths are the final processed clips.

| Clip | Start | Picture | Line | Length |
|---|---|---|---|---|
| `line1` | 0:00 | Sunrise, runner jogging, "LUCKY DRAW", "RESULTS ARE IN!" | "Four weeks. One lucky draw." | 2.8 s |
| `line2` | 0:02.82 | Balls on the track, the entry count, medal counts to 20 | "You earned the FitCoin®. Now for the prizes." | 3.0 s |
| `line3` | 0:05.85 | Twenty balls lift off the track as gold medals, sun wipe | "Nobody picks the winners. Not even me." | 3.0 s |
| `line4` | 0:09.0 | "17 × $20": the raffle drum starts pulling names out | "Seventeen of you, twenty dollars each. Enough for a post-run coffee... or two, if you're not fussy." | 7.9 s |
| `line5` | 0:17.4 | The list keeps filling, in draw order | "Straight out of the drum. Full bragging rights. No legal weight whatsoever." | 3.8 s |
| `line6` | 0:23.4 | Top 3 podium: 3rd, 2nd, then a mystery "?" for 1st | "The top three! Sixty for third. A hundred and ten for second." | 4.4 s |
| `line6b` | 0:28.07 | End of the podium, dive into the gold medal | "And... first..." - drawn out, straight into the hit | 2.6 s |
| `line7` | 0:30.8 | "1st PRIZE", "$210" lands | "Two hundred and ten dollars!" | 2.2 s |
| `line8` | 0:33.03 | The 1st place name, then the turn to "Congratulations!" | "Take a bow." | 0.9 s |
| `line9` | 0:34.0 | Pack of runners, "Congratulations!", "to all 20 winners" | "Congrats, winners! The couch awaits the rest of us." | 2.7 s |

The fixed points: `line6b` ends just before the 0:30.8 hit, with no dead air before the payoff; `line7` starts
exactly on it; and `line9` ends before 0:37. The on-screen captions are separate jokes, so the voice-over doesn't
repeat them. No line names a winner - 1st place stays a mystery until the gold medal beat, and "Take a bow." covers
the name.

## Generating it in Google AI Studio

Open the speech generation (TTS) playground, pick the voice, paste the style instructions into the style field (or
at the top of the prompt) and the script as the text to speak. The `[long pause]` tags give gaps to split the take
at. For a lighter game-show host instead of Algenib, try Puck ("Upbeat"), Fenrir ("Excitable") or Sadachbia
("Lively").

### Style instructions

Set the pronunciation for your audience (the current take uses South African English).

```text
AUDIO PROFILE: A warm, slightly over-the-top game-show host announcing the winners of an office fitness
challenge's lucky draw. Playful and confident, never shouty. South African English pronunciation.

SCENE: A 37-second animated results video. Every line has a tight time slot, so keep a brisk, energetic pace
with no dragging. The humour is dry and self-aware: fake trademarks, mock legal disclaimers.

DIRECTOR'S NOTES:
- Comic timing over volume: deadpan on the dry jokes, a small smile in the voice on the punchlines.
- Say "FitCoin" as two words, "fit coin", stressed like a brand name.
- The biggest moment is "Two hundred and ten dollars!": a big, excited payoff, like a jackpot.
- Finish each line cleanly; leave the pauses between lines silent.
```

### Script

`line6` and `line6b` ("And... first...") are generated separately - see below.

```text
[upbeat, punchy] Four weeks. One lucky draw.

[long pause]

[confident] You earned the FitCoin. [short pause] Now for the prizes.

[long pause]

[playful, conspiratorial] Nobody picks the winners. [short pause] [deadpan] Not even me.

[long pause]

[upbeat] Seventeen of you, twenty dollars each. [short pause] Enough for a post-run coffee... [short pause] [wry] or two, if you're not fussy.

[long pause]

[brisk] Straight out of the drum. Full bragging rights. [short pause] [deadpan] No legal weight whatsoever.

[long pause]

[excitedly, jackpot] Two hundred and ten dollars!

[long pause]

[warm, proud] Take a bow.

[long pause]

[cheerful] Congrats, winners! [short pause] [wry] The couch awaits the rest of us.
```

### Lines generated on their own

Any line can be regenerated on its own with the same voice, audio profile and scene. For these two, swap the shared
director's notes for these - notes about lines that aren't in the generation can push jackpot energy into the wrong
words. Generate each 2-3 times and keep the best.

**`line6`** - a complete sentence, ending cleanly on "second". It gets the same 8% speed-up as the other clips (see
below), so the target is for the raw take; up to about 6 s still fits before `line6b`.

```text
DIRECTOR'S NOTES:
- Comic timing over volume: deadpan on the dry jokes, a small smile in the voice on the punchlines.
- Finish each line cleanly.
- This is a complete sentence on its own: land "second" fully and let it ring out, with a natural, confident
  ending - not trailing off, not cut short.
- Target length: about 4 to 5 seconds.
```

```text
[building excitement] The top three! Sixty for third. [short pause] A hundred and ten for second.
```

**`line6b`** - leads straight into the reveal. It can run long (the current take is a drawn-out "Aaand... first..."
of about 2.6 s): it starts right after `line6` and ends just before the hit.

```text
DIRECTOR'S NOTES:
- Build tension on "And first..." and leave it hanging, unresolved.
- This line leads straight into a huge reveal that follows immediately ("Two hundred and ten dollars!"), so it
  must feel unfinished: drawn out, hushed, tension rising, holding the last word as if about to announce a jackpot.
- Stretch "first" a little. Do not drop the pitch at the end like a full stop.
- Target length: about 1 to 1.5 seconds.
```

```text
[slowing, dramatic, hushed] And... first...
```

### What to expect

- **It can skip a line** in a long take - the first take left out `line4`. Check every line is there before
  splitting; a transcript makes this quick (see below).
- **It stretches pauses and short lines** - `[short pause]` can come out as 1.5 s, and short lines run long. That's
  fixed in processing.
- **Check "FitCoin".** A mispronounced take transcribed as "Footcoin". A correct one transcribes as "bitcoin" (the
  transcription model doesn't know the word), so "bitcoin" in a transcript means it's fine.
- **If a tag is read out loud** (it says "deadpan"), that tag isn't supported: remove it and rely on the director's
  notes.

## Processing the clips

Gemini outputs 24 kHz mono WAV. Each clip is cut from the take, cleaned up and encoded with ffmpeg:

1. **Find the lines.** Transcribe the take with word timings to confirm what's where -
   `brew install whisper-cpp`, the [`ggml-base.en.bin`](https://huggingface.co/ggerganov/whisper.cpp/tree/main)
   model, then `whisper-cli -m ggml-base.en.bin -f take-16k.wav -ml 1 -oj` (whisper wants 16 kHz:
   `ffmpeg -i take.wav -ar 16000 -ac 1 take-16k.wav`). `ffmpeg -i take.wav -af silencedetect=noise=-40dB:d=0.4 -f null -`
   lists the pauses to cut at.
2. **Cut each line**, with about 0.05 s before and 0.12 s after the speech: `ffmpeg -ss <start> -to <end> -i take.wav ...`.
3. **Shorten pauses inside a line** to at most 0.2 s, and **speed it up 8%** (pitch kept) - Gemini's pace is a little
   slow for the slots. `line6b` keeps a deliberate 0.25 s beat between "And" and "first" instead, then gets the same
   speed-up.
4. **Even out the loudness** and **encode**:

   ```console
   ffmpeg -i line.wav -af "silenceremove=stop_periods=-1:stop_duration=0.25:stop_threshold=-40dB:stop_silence=0.2,atempo=1.08,loudnorm=I=-16:TP=-1.5:LRA=11" -ac 1 -ar 24000 -c:a libmp3lame -b:a 64k website/public/voiceover/lineN.mp3
   ```

5. **Check the timing.** `ffprobe -show_entries format=duration -of csv=p=0 <clip>` gives each length: a clip must
   end before the next one starts (and `line9` before 0:37). Adjust the start times in `VOICEOVER` in
   `lucky-draw.html` if needed.
6. **Watch it.** Open `/preview-draw?scenario=drawn` locally and press **Watch the reveal**, or render it:
   `npm run ts ./examples/render-reveal.ts -- "http://localhost:5173/preview-draw?scenario=drawn"` (in `functions/`).

To use a human recording instead, record each line as its own clip (Voice Memos is fine - export by dragging a memo
into Finder), trim off the start/stop clicks, and process it the same way, skipping the speed-up if it isn't needed.

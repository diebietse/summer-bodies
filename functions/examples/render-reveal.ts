// Run with: npm run ts ./examples/render-reveal.ts -- <draw link> [output.mp4]
// Requires:
// * ffmpeg on the PATH (e.g. brew install ffmpeg)
// * The draw link's draw time to have passed
// Renders the lucky draw reveal, with the real winners, its sound and the voice-over, to a 1280x720 30 fps MP4
// (default ./excluded/lucky-draw-reveal.mp4). It opens the draw link like any viewer, lets the page draw the winners
// from the drand beacon, then renders the reveal that page would play, frame by frame - so the video matches what
// everyone saw. Works with a local dev link too (http://localhost:5173/draw/<id>).
import puppeteer from "puppeteer";
import { spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";

async function main() {
  const [drawLink, output = "./excluded/lucky-draw-reveal.mp4"] = process.argv.slice(2);
  if (!drawLink) throw new Error("Usage: npm run ts ./examples/render-reveal.ts -- <draw link> [output.mp4]");
  const browser = await puppeteer.launch({ headless: true });
  try {
    // 1. The draw page draws the winners itself once the draw time has passed; "Watch the reveal" then shows the
    //    reveal in an iframe whose URL carries the winners and entry count.
    const page = await browser.newPage();
    await page.goto(drawLink, { waitUntil: "networkidle0" });
    const watch = await page.waitForFunction(
      () => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Watch the reveal")),
      {
        timeout: 60000,
      },
    );
    await watch.asElement()!.evaluate((b) => (b as HTMLButtonElement).click());
    const revealUrl = await (await page.waitForSelector(".reveal iframe"))!.evaluate((f) => (f as HTMLIFrameElement).src);
    console.log(`Drawn - rendering ${revealUrl.split("#")[0]}`);

    // 2. The reveal: wait for the voice-over, render the sound offline, then every frame into ffmpeg.
    const reveal = await browser.newPage();
    await reveal.setViewport({ width: 1280, height: 860 });
    await reveal.goto(revealUrl, { waitUntil: "networkidle0" });
    const duration: number = await reveal.evaluate(async () => {
      await (window as any).eval("voLoaded");
      return (window as any).DURATION;
    });
    const withVoice: boolean = await reveal.evaluate(() => (window as any).eval("voReady"));
    console.log(withVoice ? "Voice-over loaded" : "Warning: voice-over didn't load - rendering without it");
    const audioBase64: string = await reveal.evaluate(async () => {
      const w = window as any;
      const r = await w.SOUND.renderOffline(w.scoreSound, w.DURATION, 48000, { voiceover: w.eval("voReady") });
      const bytes = new Uint8Array(r.inter.buffer);
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    });
    mkdirSync(dirname(output), { recursive: true });
    const audioFile = `${output}.audio.f32`;
    writeFileSync(audioFile, Buffer.from(audioBase64, "base64"));

    const ffmpeg = spawn(
      "ffmpeg",
      [
        ...["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", "30", "-vcodec", "png", "-i", "-"],
        ...["-f", "f32le", "-ar", "48000", "-ac", "2", "-i", audioFile],
        ...["-af", "alimiter=limit=0.89:level=disabled", "-c:v", "libx264", "-pix_fmt", "yuv420p"],
        // crf 23 with the animation tuning looks the same as crf 17 here but is ~8x smaller (about 6 MB, not 47);
        // faststart lets it begin playing (e.g. in Slack) before it has fully downloaded.
        ...["-crf", "23", "-preset", "slow", "-tune", "animation", "-movflags", "+faststart"],
        ...["-c:a", "aac", "-b:a", "192k", "-t", String(duration), output],
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const frames = Math.round(duration * 30);
    for (let i = 0; i < frames; i++) {
      const png: string = await reveal.evaluate((t) => {
        (window as any).seek(t);
        return (document.getElementById("cv") as HTMLCanvasElement).toDataURL("image/png");
      }, i / 30);
      if (!ffmpeg.stdin!.write(Buffer.from(png.split(",")[1], "base64"))) await new Promise((r) => ffmpeg.stdin!.once("drain", r));
      if (i % 150 === 0) console.log(`frame ${i} / ${frames}`);
    }
    ffmpeg.stdin!.end();
    const code = await new Promise((r) => ffmpeg.on("close", r));
    rmSync(audioFile, { force: true });
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
    console.log(`Done: ${output}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

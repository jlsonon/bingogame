import fs from "fs";
import path from "path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { NATURAL_VOICES } from "../src/lib/voices";

const CACHE_DIR = process.env.BINGO_VOICE_CACHE_DIR
  ? path.resolve(process.env.BINGO_VOICE_CACHE_DIR)
  : path.join(process.cwd(), "voice-cache");

const CONCURRENCY = Number(process.env.VOICE_CONCURRENCY || 3);
const PACING_MS = Number(process.env.VOICE_PACING_MS || 120);
const MAX_RETRIES = 6;

interface ClipTask {
  voiceId: string;
  edgeVoice: string;
  fileName: string;
  text: string;
  outPath: string;
}

function getLetter(ballNum: number): string {
  if (ballNum <= 15) return "B";
  if (ballNum <= 30) return "I";
  if (ballNum <= 45) return "N";
  if (ballNum <= 60) return "G";
  return "O";
}

function isValidCachedFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 512;
  } catch {
    return false;
  }
}

async function synthesizeToBuffer(edgeVoice: string, text: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { tts.close(); } catch {}
        reject(new Error(`Timeout synthesizing "${text}" (${edgeVoice})`));
      }
    }, 20_000);

    try {
      const stream = tts.toStream(text);
      stream.audioStream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      stream.audioStream.on("end", () => {
        clearTimeout(timeout);
        try { tts.close(); } catch {}
        if (!settled) {
          settled = true;
          const buf = Buffer.concat(chunks);
          if (buf.length < 512) {
            reject(new Error(`Empty/tiny audio buffer (${buf.length} bytes)`));
          } else {
            resolve(buf);
          }
        }
      });
      stream.audioStream.on("error", (err: unknown) => {
        clearTimeout(timeout);
        try { tts.close(); } catch {}
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
    } catch (err) {
      clearTimeout(timeout);
      try { tts.close(); } catch {}
      if (!settled) {
        settled = true;
        reject(err);
      }
    }
  });
}

async function downloadClip(task: ClipTask): Promise<void> {
  if (isValidCachedFile(task.outPath)) {
    return;
  }
  await fs.promises.mkdir(path.dirname(task.outPath), { recursive: true });

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const buffer = await synthesizeToBuffer(task.edgeVoice, task.text);
      const tmpPath = `${task.outPath}.tmp`;
      await fs.promises.writeFile(tmpPath, buffer);
      await fs.promises.rename(tmpPath, task.outPath);
      if (PACING_MS > 0) {
        await new Promise((r) => setTimeout(r, PACING_MS));
      }
      return;
    } catch (err) {
      lastErr = err;
      const delayMs = Math.min(15000, 1200 * attempt * attempt);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function main() {
  const filterArg = process.argv.slice(2);
  const selectedVoices = filterArg.length > 0
    ? NATURAL_VOICES.filter((v) => filterArg.includes(v.id))
    : NATURAL_VOICES;

  const tasks: ClipTask[] = [];
  for (const voice of selectedVoices) {
    const dir = path.join(CACHE_DIR, voice.id);
    tasks.push({
      voiceId: voice.id,
      edgeVoice: voice.edgeVoice,
      fileName: "preview.mp3",
      text: "Lucky Bingo! B... 12.",
      outPath: path.join(dir, "preview.mp3"),
    });
    for (let ball = 1; ball <= 75; ball++) {
      tasks.push({
        voiceId: voice.id,
        edgeVoice: voice.edgeVoice,
        fileName: `ball_${ball}.mp3`,
        text: `${getLetter(ball)}... ${ball}.`,
        outPath: path.join(dir, `ball_${ball}.mp3`),
      });
    }
  }

  const pending = tasks.filter((t) => !isValidCachedFile(t.outPath));
  const alreadyCached = tasks.length - pending.length;
  console.log(`Offline Voice Cache: ${selectedVoices.length} voices, ${tasks.length} total clips.`);
  console.log(`Already cached: ${alreadyCached} | Remaining to download: ${pending.length}`);
  console.log(`Output directory: ${CACHE_DIR}`);

  if (pending.length === 0) {
    console.log("All natural voice clips are already cached offline!");
    return;
  }

  let cursor = 0;
  let completed = 0;
  let failed = 0;
  const failedTasks: ClipTask[] = [];
  const startTime = Date.now();

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= pending.length) return;
      const task = pending[idx];
      try {
        await downloadClip(task);
        completed++;
        if (completed % 50 === 0 || completed === pending.length) {
          const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
          const pct = Math.round(((alreadyCached + completed) / tasks.length) * 100);
          console.log(`[${pct}%] ${alreadyCached + completed}/${tasks.length} clips ready (${elapsedSec}s elapsed)`);
        }
      } catch (err: any) {
        failed++;
        failedTasks.push(task);
        console.error(`FAILED ${task.voiceId}/${task.fileName}: ${err?.message || err}`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker());
  await Promise.all(workers);

  const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nFinished in ${totalSec}s. Downloaded: ${completed}, Failed: ${failed}.`);

  if (failedTasks.length > 0) {
    console.error(`Missing ${failedTasks.length} clips. Re-run this script to retry missing files.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal cache-voices error:", err);
  process.exit(1);
});

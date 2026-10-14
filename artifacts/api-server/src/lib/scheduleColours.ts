import { spawn } from "node:child_process";

/** Sample original pixels (not quantized colours) to preserve screenshot fills. */
async function samplePixels(image: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("magick", [
      "-limit", "memory", "128MiB", "-limit", "map", "256MiB",
      "-limit", "width", "20000", "-limit", "height", "20000", "-limit", "time", "10",
      "-", "-alpha", "off", "-sample", "256x256!", "-depth", "8", "rgb:-",
    ], { stdio: ["pipe", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    const timer = setTimeout(() => child.kill("SIGKILL"), 12_000);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 256 * 256 * 3) child.kill("SIGKILL");
      else chunks.push(chunk);
    });
    child.stdin.on("error", () => undefined);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error("Screenshot colour sampling failed."));
    });
    child.stdin.end(image);
  });
}

export async function screenshotPalette(images: Buffer[]): Promise<string[]> {
  const counts = new Map<string, number>();
  for (const image of images) {
    if (image.length < 32) continue;
    let pixels: Buffer;
    try { pixels = await samplePixels(image); } catch { continue; }
    for (let index = 0; index + 2 < pixels.length; index += 3) {
      const rgb = [...pixels.subarray(index, index + 3)];
      const max = Math.max(...rgb), min = Math.min(...rgb);
      // Keep neutral inspection and milestone fills; ignore pale row/grid backgrounds.
      if (min > 240 || ((max - min) / Math.max(max, 1) < 0.15 && min >= 160)) continue;
      const hex = `#${pixels.subarray(index, index + 3).toString("hex").toUpperCase()}`;
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }
  return [...counts].filter(([, count]) => count >= 24)
    .sort((a, b) => b[1] - a[1]).slice(0, 32).map(([hex]) => hex);
}

export function matchScreenshotColour(color: string | null, palette: string[]) {
  if (!color || !palette.length) return color;
  const rgb = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const source = rgb(color);
  const ranked = palette.map((hex) => ({
    hex, distance: rgb(hex).reduce((sum, value, index) => sum + (value - source[index]) ** 2, 0),
  })).sort((a, b) => a.distance - b.distance);
  return ranked[0].distance <= 60 ** 2 ? ranked[0].hex : null;
}

const html = await Deno.readTextFile(
  new URL("./lughfilm.html", import.meta.url),
);
let scripts = 0;
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  new Function(match[1]);
  scripts++;
}
const helper = html.slice(
  html.indexOf("function seekExportMedia("),
  html.indexOf("async function exportEditedVideo()"),
);
const seek = new Function(helper + ";return seekExportMedia")();
class Media extends EventTarget {
  seeking = false;
  value = 0;
  get currentTime() {
    return this.value;
  }
  set currentTime(value) {
    this.value = value;
    this.dispatchEvent(new Event("seeked"));
  }
}
await seek(new Media(), 0, new AbortController().signal);
await seek(new Media(), 2, new AbortController().signal);
const controller = new AbortController();
class PendingMedia extends Media {
  set currentTime(value) {
    this.value = value;
  }
  get currentTime() {
    return this.value;
  }
}
const pending = seek(new PendingMedia(), 2, controller.signal);
controller.abort();
try {
  await pending;
  throw new Error("Cancellation failed");
} catch (error) {
  if (error.name !== "AbortError") throw error;
}
console.log(
  `Parsed ${scripts} scripts; unchanged-time seek, synchronous seek, and cancellation passed.`,
);

for (
  const id of ["lugh-composition-clock-fix", "lugh-composition-timeline-engine"]
) {
  if (html.includes(`<script id="${id}">`)) {
    throw new Error("Retired playback clock is still installed");
  }
}
console.log("Competing legacy playback clocks are removed.");

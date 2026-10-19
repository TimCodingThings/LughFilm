import "./editor-core.js";
const Timeline = globalThis.LughTimeline;
const Scale = globalThis.LughTimelineScale;
function equal(actual, expected, name) {
  if (
    typeof actual !== "number" || !Number.isFinite(actual) ||
    Math.abs(actual - expected) > .001
  ) {
    throw new Error(`${name}: ${actual} != ${expected}`);
  }
}
Deno.test("timeline grows horizontally without changing clip widths or time coordinates", () => {
  const scale = new Scale();
  scale.fit(10, 1000);
  const clipWidth = scale.x(3), marker = scale.x(8);
  scale.extend(25);
  equal(scale.width(1000), 2500, "scrollable width");
  equal(scale.x(3), clipWidth, "unchanged clip width");
  equal(scale.x(8), marker, "unchanged marker position");
  equal(scale.time(1800), 18, "pointer beyond old end");
  scale.extend(5);
  equal(scale.width(1000), 2500, "deleting footage does not shrink the view");
  scale.zoom = 2;
  equal(scale.x(3), 600, "explicit zoom changes the scale");
  scale.fit(25, 1000);
  equal(scale.width(1000), 1000, "explicit fit resets scrollable width");
  equal(scale.x(25), 1000, "fit includes complete composition");
});
Deno.test("timeline resize keeps seconds at the same scale until an explicit fit", () => {
  const scale = new Scale();
  scale.fit(6, 1200);
  equal(scale.width(600), 1200, "narrow viewport scrolls");
  equal(scale.x(2), 400, "fixed second marker after resize");
  equal(scale.time(1100), 5.5, "scrolled pointer mapping");
});
Deno.test("live trim clamps range without changing the source or resetting it", () => {
  const t = new Timeline(10);
  t.setRange(2, 7);
  equal(t.length, 5, "kept duration");
  equal(t.sourceAt(3), 3, "source mapping");
  const restored = new Timeline(10, t.serialize());
  equal(restored.range.start, 2, "saved start");
  equal(restored.range.end, 7, "saved end");
});
Deno.test("moving cut footage preserves source boundaries and pushes overlapping clips aside", () => {
  const t = new Timeline(10);
  t.removeRange(2, 4);
  const right = t.clips.find((c) => c.start === 4),
    left = t.clips.find((c) => c.start === 0);
  t.move(right.id, 1);
  equal(right.at, 0, "snap before overlapped clip");
  equal(left.at, 6, "following clip pushed aside");
  equal(right.start, 4, "cut source in preserved");
  equal(right.end, 10, "cut source out preserved");
  t.trimClip(right.id, 0, 10);
  equal(right.start, 4, "removed source cannot return");
  const restored = new Timeline(10, t.serialize());
  equal(
    restored.clips.find((c) => c.id === right.id).sourceMin,
    4,
    "saved source bound",
  );
});
Deno.test("sub-three-second clips retain identity and editable bounds after moving, trimming and undo", () => {
  const t = new Timeline(10);
  t.split(.2);
  t.split(2.2);
  const c = t.at(.3), before = t.serialize();
  t.move(c.id, 8);
  equal(c.start, .2, "source in");
  equal(c.end, 2.2, "source out");
  t.trimClip(c.id, .5, 1.5);
  equal(c.end - c.start, 1, "edited short duration");
  t.trimClip(c.id, -1, 9);
  equal(c.start, .2, "left cut bound");
  equal(c.end, 2.2, "right cut bound");
  const undone = new Timeline(10, before);
  equal(undone.clips.find((x) => x.id === c.id).end, 2.2, "undo");
});
Deno.test("split clips meet at exactly the same timeline and source boundary", () => {
  const t = new Timeline(10);
  if (!t.split(4)) throw new Error("split failed");
  equal(t.sourceAt(3.99), 3.99, "left frame");
  equal(t.sourceAt(4), 4, "right frame");
  equal(t.duration, 10, "split duration");
});
Deno.test("ripple deletion removes footage and shifts following clips", () => {
  const t = new Timeline(10);
  t.split(3);
  t.split(6);
  t.remove(t.at(4).id);
  equal(t.duration, 7, "duration");
  equal(t.sourceAt(3), 6, "next clip starts immediately");
  equal(t.range.end, 7, "export end");
});
Deno.test("moved clips leave explicit gaps and map to the correct source", () => {
  const t = new Timeline(10, { clips: [{ id: "a", start: 2, end: 5, at: 4 }] });
  if (t.sourceAt(1) !== null) throw new Error("gap contains video");
  equal(t.sourceAt(4.5), 2.5, "moved source");
  equal(t.duration, 7, "placed duration");
});
Deno.test("source cut removes the interval and ripples the remaining footage", () => {
  const t = new Timeline(10);
  t.cut(2, 4);
  equal(t.duration, 8, "cut duration");
  equal(t.sourceAt(2), 4, "cut boundary");
});
Deno.test("playhead and pointer coordinates round trip at different widths and zooms", () => {
  for (const width of [300, 1200, 7200]) {
    for (const time of [0, 2.5, 19.75, 20]) {
      equal(
        Timeline.time(Timeline.x(time, 20, width), 20, width),
        time,
        "coordinate",
      );
    }
  }
});
Deno.test("empty and invalid ranges stay finite and inside the timeline", () => {
  const t = new Timeline(10);
  t.setRange(12, -1);
  if (
    !(t.range.start >= 0 && t.range.end <= 10 && t.range.end > t.range.start)
  ) throw new Error("invalid range");
  const empty = new Timeline(10, { clips: [] });
  equal(empty.duration, 0, "empty duration");
  equal(empty.length, 0, "empty length");
});
Deno.test("cutting a timeline interval across split clips ripples every later clip", () => {
  const t = new Timeline(10);
  t.split(3);
  t.split(6);
  t.removeRange(2, 5);
  equal(t.duration, 7, "duration");
  equal(t.sourceAt(2), 5, "cut boundary");
  equal(t.sourceAt(3), 6, "next boundary");
});

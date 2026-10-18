// Local Chrome DevTools QA; no third-party packages or user browser state.
const response = await fetch("http://127.0.0.1:9229/json/new?about:blank", {
  method: "PUT",
});
const target = await response.json(),
  socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) =>
  socket.addEventListener("open", resolve, { once: true })
);
let sequence = 0;
const pending = new Map(), errors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const p = pending.get(message.id);
    pending.delete(message.id);
    message.error ? p.reject(message.error) : p.resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") {
    errors.push(
      message.params.exceptionDetails.text + ": " +
        message.params.exceptionDetails.exception?.description,
    );
  }
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text,
    );
  }
  return result.result.value;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await call("Runtime.enable");
await call("Page.enable");
await call("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
const localPath = Deno.cwd().replaceAll("\\", "/");
await call("Page.navigate", { url: `file:///${localPath}/lughfilm.html` });
await sleep(1700);
const doc = await call("DOM.getDocument");
const fileInput = await call("DOM.querySelector", {
  nodeId: doc.root.nodeId,
  selector: "input[type=file]",
});
await call("DOM.setFileInputFiles", {
  nodeId: fileInput.nodeId,
  files: [Deno.cwd() + "\\editor-test-video.mp4"],
});
await sleep(1800);
await evaluate(`setMode('editor')`);
await sleep(500);
console.log(
  "Loaded",
  await evaluate(
    `({controller:!!window.LughEditor,duration:LughEditor.duration,clips:document.querySelectorAll('.editor-clip').length,mainWidth:document.querySelector('.editor-main').getBoundingClientRect().width})`,
  ),
);
if (!await evaluate("!!window.LughEditor && LughEditor.duration > 5")) {
  throw new Error("Editor did not load");
}
await evaluate(
  `document.getElementById('trimStart').value=1;document.getElementById('trimStart').dispatchEvent(new Event('input'));document.getElementById('trimEnd').value=3;document.getElementById('trimEnd').dispatchEvent(new Event('input'));`,
);
await sleep(300);
const trimmed = await evaluate("LughEditor.serialize().range");
if (trimmed.start !== 1 || trimmed.end !== 3) {
  throw new Error("Live trim was reset");
}
await evaluate("LughEditor.play()");
await sleep(550);
const first = await evaluate("LughEditor.time");
await sleep(550);
const second = await evaluate("LughEditor.time");
if (second <= first + .2) {
  throw new Error(`Playback stalled: ${first}, ${second}`);
}
await sleep(1500);
const stopped = await evaluate(
  `({time:LughEditor.time,paused:document.getElementById('editorVideo').paused,range:LughEditor.serialize().range})`,
);
if (!stopped.paused || Math.abs(stopped.time - 3) > .06) {
  throw new Error(
    "Playback did not stop at trim end: " + JSON.stringify(stopped),
  );
}
console.log("Live trim playback", { first, second, stopped });
await evaluate("LughEditor.seek(2)");
await sleep(200);
const head = await evaluate(
  `(()=>{const content=document.getElementById('editorTimelineContent'),head=document.getElementById('editorTimelinePlayhead');return {expected:LughEditor.time/LughEditor.duration*content.clientWidth,actual:Number(new DOMMatrix(getComputedStyle(head).transform).m41)}})()`,
);
if (Math.abs(head.expected - head.actual) > 1) {
  throw new Error("Playhead misplaced");
}
await evaluate(`document.getElementById('editorSplit').click()`);
if (await evaluate("LughEditor.serialize().clips.length") !== 2) {
  throw new Error("Split failed");
}
await evaluate(`document.getElementById('editorUndo').click()`);
if (await evaluate("LughEditor.serialize().clips.length") !== 1) {
  throw new Error("Undo failed");
}
await evaluate(
  `document.querySelector('[data-editor-tool="export"]').click();document.getElementById('exportEdit').click()`,
);
await sleep(4000);
const exported = await evaluate(
  `({open:document.getElementById('downloadModal').classList.contains('open'),bytes:pendingRecordingBlob?.size,status:document.getElementById('editorStatus').textContent,locked:recordingLocked})`,
);
console.log("Export", exported);
if (!exported.open || !exported.bytes || exported.locked) {
  throw new Error("Export failed");
}
const mp4 = await evaluate(
  `(async()=>{const bytes=new Uint8Array(await pendingRecordingBlob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.slice(i,i+8192));return btoa(text)})()`,
);
await Deno.writeFile(
  "editor-test-export.mp4",
  Uint8Array.from(atob(mp4), (c) => c.charCodeAt(0)),
);
await evaluate(
  `document.getElementById('downloadModal').classList.remove('open');document.querySelector('[data-editor-tool="trim"]').click()`,
);
await evaluate(
  `document.getElementById('applyTrim').click();LughEditor.seek(2);document.getElementById('editorSplit').click();`,
);
await sleep(150);
await evaluate(
  `document.getElementById('cutStart').value=1;document.getElementById('cutEnd').value=3;document.getElementById('addCut').click()`,
);
const cut = await evaluate("LughEditor.serialize()");
if (
  Math.abs(Math.max(...cut.clips.map((c) => c.at + c.end - c.start)) - 4) > .01
) throw new Error("Cut failed to shorten the timeline");
await evaluate(`LughEditor.seek(.5);LughEditor.play()`);
await sleep(1200);
const afterCut = await evaluate(
  `({time:LughEditor.time,source:document.getElementById('editorVideo').currentTime})`,
);
if (afterCut.time < 1.2 || afterCut.source < 3.2) {
  throw new Error(
    "Playback failed at cut boundary: " + JSON.stringify(afterCut),
  );
}
await evaluate(
  `LughEditor.pause();document.getElementById('editorUndo').click();document.getElementById('editorUndo').click();document.getElementById('applyTrim').click();LughEditor.seek(2);document.getElementById('editorZoomIn').click();document.getElementById('editorZoomIn').click();`,
);
await sleep(150);
const zoomedHead = await evaluate(
  `(()=>{const content=document.getElementById('editorTimelineContent'),head=document.getElementById('editorTimelinePlayhead');return {expected:LughEditor.time/LughEditor.duration*content.clientWidth,actual:new DOMMatrix(getComputedStyle(head).transform).m41}})()`,
);
if (Math.abs(zoomedHead.expected - zoomedHead.actual) > 1) {
  throw new Error("Zoomed playhead misplaced");
}
await evaluate(`document.getElementById('editorZoomFit').click()`);
// Actual pointer input verifies that range trimming remains responsive while dragged.
const drag = await evaluate(
  `(()=>{const c=document.getElementById('editorTimelineContent').getBoundingClientRect(),h=document.getElementById('editorRangeStart').getBoundingClientRect();return {x:h.left+h.width/2,y:h.top+h.height/2,target:c.left+c.width/6}})()`,
);
await call("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x: drag.x,
  y: drag.y,
  button: "left",
  clickCount: 1,
});
await call("Input.dispatchMouseEvent", {
  type: "mouseMoved",
  x: drag.target,
  y: drag.y,
  button: "left",
  buttons: 1,
});
await sleep(150);
await call("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x: drag.target,
  y: drag.y,
  button: "left",
  clickCount: 1,
});
const draggedRange = await evaluate("LughEditor.serialize().range");
if (Math.abs(draggedRange.start - 1) > .06) {
  throw new Error("Range drag failed " + JSON.stringify(draggedRange));
}
console.log(
  "Cut boundary, zoom, and range drag passed",
  afterCut,
  draggedRange,
);
await call("Emulation.setDeviceMetricsOverride", {
  width: 640,
  height: 950,
  deviceScaleFactor: 1,
  mobile: false,
});
await sleep(250);
const responsive = await evaluate(
  `({page:document.documentElement.scrollWidth,viewport:innerWidth,inspector:document.querySelector('.editor-inspector').getBoundingClientRect().width})`,
);
if (responsive.page > responsive.viewport + 2 || responsive.inspector < 300) {
  throw new Error("Responsive layout failed " + JSON.stringify(responsive));
}
await call("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await sleep(200);
const timelineBottom = await evaluate(
  `document.querySelector('.editor-timeline').getBoundingClientRect().bottom`,
);
if (timelineBottom > 1000) {
  throw new Error("Timeline fell below desktop viewport: " + timelineBottom);
}
const project = await evaluate("activeProjectId");
await sleep(450);
const savedRange = await evaluate("LughEditor.serialize().range");
await evaluate(`openProject(${JSON.stringify(project)})`);
await sleep(650);
await evaluate(`setMode('editor')`);
const reopened = await evaluate("LughEditor.serialize().range");
if (
  Math.abs(savedRange.start - reopened.start) > .01 ||
  Math.abs(savedRange.end - reopened.end) > .01
) throw new Error("Project trim was not restored");
console.log(
  "Desktop layout",
  await evaluate(
    `({height:innerHeight,shell:document.querySelector('.editor-shell').getBoundingClientRect().height,main:document.querySelector('.editor-main').getBoundingClientRect().height,stage:document.querySelector('.editor-stage').getBoundingClientRect().height,timeline:document.querySelector('.editor-timeline').getBoundingClientRect().bottom})`,
  ),
);
if (
  await evaluate(
    `document.querySelector('.editor-stage').getBoundingClientRect().height`,
  ) < 300
) throw new Error("Desktop preview too short");
const clipDrag = await evaluate(
  `(()=>{const c=document.querySelector('.editor-clip').getBoundingClientRect(),track=document.getElementById('editTimeline').getBoundingClientRect();return {x:c.left+c.width/2,y:c.top+c.height/2,delta:track.width/6}})()`,
);
await call("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x: clipDrag.x,
  y: clipDrag.y,
  button: "left",
  clickCount: 1,
});
await call("Input.dispatchMouseEvent", {
  type: "mouseMoved",
  x: clipDrag.x + clipDrag.delta,
  y: clipDrag.y,
  button: "left",
  buttons: 1,
});
await sleep(120);
await call("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x: clipDrag.x + clipDrag.delta,
  y: clipDrag.y,
  button: "left",
  clickCount: 1,
});
const placed = await evaluate("LughEditor.serialize().clips[0].at");
if (Math.abs(placed - 1) > .04) {
  throw new Error("Clip dragging used the wrong coordinate scale: " + placed);
}
await evaluate(
  `document.getElementById('trimStart').value=0;document.getElementById('trimStart').dispatchEvent(new Event('input'));document.getElementById('trimEnd').value=2;document.getElementById('trimEnd').dispatchEvent(new Event('input'));LughEditor.seek(0);LughEditor.play()`,
);
await sleep(600);
const gap = await evaluate(
  `({time:LughEditor.time,paused:document.getElementById('editorVideo').paused})`,
);
if (gap.time < .3 || !gap.paused) {
  throw new Error("Gap playback failed " + JSON.stringify(gap));
}
await sleep(650);
const resumed = await evaluate(
  `({time:LughEditor.time,paused:document.getElementById('editorVideo').paused})`,
);
if (resumed.time < 1.05 || resumed.paused) {
  throw new Error(
    "Playback did not resume after gap " + JSON.stringify(resumed),
  );
}
await evaluate(
  `LughEditor.pause();document.getElementById('exportEdit').click()`,
);
await sleep(350);
await evaluate(`document.getElementById('cancelEditorExport').click()`);
await sleep(250);
if (await evaluate("recordingLocked")) {
  throw new Error("Cancelled export left editor locked");
}
await evaluate(`document.getElementById('exportEdit').click()`);
await sleep(3500);
const gapExport = await evaluate(
  `({open:document.getElementById('downloadModal').classList.contains('open'),status:document.getElementById('editorStatus').textContent,locked:recordingLocked})`,
);
if (!gapExport.open || gapExport.locked) {
  throw new Error("Export across gap failed " + JSON.stringify(gapExport));
}
await evaluate(
  `document.getElementById('downloadModal').classList.remove('open');document.getElementById('editorUndo').click();document.querySelector('[data-editor-tool="trim"]').click()`,
);
console.log(
  "Clip placement, gap playback, export cancellation, and gap export passed.",
);
// Reproduce short cut pieces being moved over other pieces on the same track.
await evaluate(
  `window.lughPendingTimeline={version:2,clips:[{id:'regression',start:0,end:6,at:0}],range:{start:0,end:6}};document.getElementById('editorVideo').dispatchEvent(new Event('loadedmetadata'));document.getElementById('cutStart').value=.2;document.getElementById('cutEnd').value=.3;document.getElementById('addCut').click();`,
);
const shortId = await evaluate(
  `LughEditor.serialize().clips.find(c=>c.end-c.start<.3).id`,
);
await evaluate(
  `document.getElementById('editorSelectedClip').value=${
    JSON.stringify(shortId)
  };document.getElementById('editorSelectedClip').dispatchEvent(new Event('change'))`,
);
if (await evaluate(`document.getElementById('editorClipFields').hidden`)) {
  throw new Error("Short clip lost its properties");
}
await evaluate(
  `document.getElementById('editorClipOut').value=.15;document.getElementById('editorClipOut').dispatchEvent(new Event('change'))`,
);
if (
  Math.abs(
    await evaluate(
      `LughEditor.serialize().clips.find(c=>c.id===${
        JSON.stringify(shortId)
      }).end`,
    ) - .15,
  ) > .001
) throw new Error("Short clip could not be trimmed numerically");
const shortDrag = await evaluate(
  `(()=>{const c=document.querySelector('[data-clip="${shortId}"]').getBoundingClientRect(),t=document.getElementById('editTimeline').getBoundingClientRect();return {x:c.left+c.width/2,y:c.top+8,delta:t.width*.4}})()`,
);
await call("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x: shortDrag.x,
  y: shortDrag.y,
  button: "left",
  clickCount: 1,
});
for (const portion of [.2, .6, 1]) {
  await call("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: shortDrag.x + shortDrag.delta * portion,
    y: shortDrag.y,
    button: "left",
    buttons: 1,
  });
  await sleep(50);
}
await call("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x: shortDrag.x + shortDrag.delta,
  y: shortDrag.y,
  button: "left",
  clickCount: 1,
});
const movedCuts = await evaluate(`LughEditor.serialize().clips`);
for (const c of movedCuts) {
  for (const other of movedCuts) {
    if (
      c.id !== other.id && c.at < other.at + other.end - other.start - .001 &&
      other.at < c.at + c.end - c.start - .001
    ) throw new Error("Dragging cut clips created an overlap");
  }
}
const shortMoved = movedCuts.find((c) => c.id === shortId);
if (
  shortMoved.at === 0 || shortMoved.start !== 0 ||
  Math.abs(shortMoved.end - .15) > .001
) throw new Error("Dragging changed short clip source properties");
await evaluate(
  `document.getElementById('editorClipOut').value=5;document.getElementById('editorClipOut').dispatchEvent(new Event('change'))`,
);
const bounded = await evaluate(
  `LughEditor.serialize().clips.find(c=>c.id===${JSON.stringify(shortId)})`,
);
if (bounded.end > .20001) {
  throw new Error("Extending a clip restored cut footage");
}
await evaluate(
  `document.getElementById('editorClipIn').value=.05;document.getElementById('editorClipIn').dispatchEvent(new Event('change'))`,
);
if (
  Math.abs(
    await evaluate(
      `LughEditor.serialize().clips.find(c=>c.id===${
        JSON.stringify(shortId)
      }).start`,
    ) - .05,
  ) > .001
) throw new Error("Moved short clip lost source-in editing");
// Even a clip narrower than its handles remains selectable and editable from the inspector.
const beforeTinySplit = await evaluate("LughEditor.serialize().clips.length");
await evaluate(
  `LughEditor.seek(LughEditor.serialize().clips.find(c=>c.id===${
    JSON.stringify(shortId)
  }).at+.05);document.getElementById('editorSplit').click()`,
);
const clipsAfterSplit = await evaluate("LughEditor.serialize().clips");
if (
  clipsAfterSplit.length !== beforeTinySplit + 1 ||
  !clipsAfterSplit.some((c) => c.end - c.start < .06)
) {
  throw new Error("Short clip split failed");
}
await evaluate(
  `document.getElementById('editorSelectedClip').value=${
    JSON.stringify(shortId)
  };document.getElementById('editorSelectedClip').dispatchEvent(new Event('change'));document.getElementById('editorClipOut').value=4;document.getElementById('editorClipOut').dispatchEvent(new Event('change'))`,
);
const tiny = await evaluate(
  `({clip:LughEditor.serialize().clips.find(c=>c.id===${
    JSON.stringify(shortId)
  }),fields:document.getElementById('editorClipFields').hidden,value:Number(document.getElementById('editorClipOut').value)})`,
);
if (
  tiny.fields || tiny.clip.end - tiny.clip.start > .06 ||
  Math.abs(tiny.value - tiny.clip.end) > .001
) throw new Error("Tiny clip properties or clamped field values failed");
console.log(
  "Cut pieces can be dragged without overlap; short clip source controls and cut bounds remain intact.",
);
await evaluate(
  `for(let i=0;i<5;i++)document.getElementById('editorZoomIn').click();document.querySelector('[data-clip="${shortId}"]').scrollIntoView({block:'nearest',inline:'center'})`,
);
await sleep(120);
const frameTrim = await evaluate(
  `(()=>{const h=document.querySelector('[data-clip="${shortId}"] [data-edge="end"]').getBoundingClientRect(),content=document.getElementById('editorTimelineContent');return {x:h.left+h.width/2,y:h.top+h.height/2,delta:.01/LughEditor.duration*content.clientWidth,before:LughEditor.serialize().clips.find(c=>c.id==='${shortId}').end}})()`,
);
await call("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x: frameTrim.x,
  y: frameTrim.y,
  button: "left",
  clickCount: 1,
});
await call("Input.dispatchMouseEvent", {
  type: "mouseMoved",
  x: frameTrim.x - frameTrim.delta,
  y: frameTrim.y,
  button: "left",
  buttons: 1,
});
await sleep(80);
await call("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x: frameTrim.x - frameTrim.delta,
  y: frameTrim.y,
  button: "left",
  clickCount: 1,
});
const frameEnd = await evaluate(
  `LughEditor.serialize().clips.find(c=>c.id==='${shortId}').end`,
);
if (Math.abs(frameEnd - (frameTrim.before - .01)) > .001) {
  throw new Error("Fine trim movement at high zoom was ignored");
}
await evaluate(`document.getElementById('editorZoomFit').click()`);
console.log("Fine trim movement on a 0.05-second clip passed at high zoom.");
await call("Page.captureScreenshot", { format: "png" }).then(async (result) => {
  const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
  await Deno.writeFile("editor-preview.png", bytes);
});
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  "Browser checks passed: live trimming, advancing playback, trim stop, playhead mapping, split, undo, and MP4 export.",
);
socket.close();

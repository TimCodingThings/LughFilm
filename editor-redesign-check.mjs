// Exercise the actual studio UI in an isolated Chrome profile on port 9229.
const target = await (await fetch('http://127.0.0.1:9229/json/new?about:blank', { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map(), errors = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (request) { clearTimeout(request.timer); message.error ? request.reject(message.error) : request.resolve(message.result); }
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: '+method)); }, 12000);
  pending.set(id, { resolve, reject, timer });
  socket.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
function assert(value, message) { if (!value) throw Error(message); }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function click(selector) {
  const point = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  await sleep(70);
}
async function viewport(width, height) {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(120);
}
async function screenshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png' });
  await Deno.writeFile(name, Uint8Array.from(atob(result.data), c => c.charCodeAt(0)));
}
try {
  await call('Runtime.enable');
  await call('Page.enable');
  await viewport(1440, 1000);
  await call('Page.navigate', { url: Deno.args[0] || `file:///${Deno.cwd().replaceAll('\\', '/')}/lughfilm.html` });
  await sleep(900);
  await click('#editorTab');
  assert(await evaluate(`document.getElementById('editorWorkspace').classList.contains('open')&&!document.getElementById('editorEmptyState').hidden&&document.getElementById('editorOpenExport').disabled`), 'Empty editor must open with an import action and disabled export');
  // Import through the editor's own file input.
  const doc = await call('DOM.getDocument');
  const input = await call('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#file' });
  await call('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [Deno.cwd() + '\\editor-test-video.mp4'] });
  await sleep(1600);
  assert(await evaluate(`LughEditor.duration>5&&document.getElementById('editorEmptyState').hidden`), 'Import did not dismiss the empty state');
  const duplicateIds = await evaluate(`(()=>{const ids=[...document.querySelectorAll('#editorWorkspace [id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i)})()`);
  assert(!duplicateIds.length, 'Duplicate control IDs: ' + duplicateIds.join(', '));
  assert(await evaluate(`getComputedStyle(document.getElementById('editorWorkspace')).getPropertyValue('--editor-thumbnail').includes('data:image/jpeg')`), 'Real source thumbnail not generated');
  for (const tool of ['media', 'trim', 'transform', 'text', 'content', 'audio', 'export']) {
    await click(`[data-editor-tool="${tool}"]`);
    assert(await evaluate(`document.getElementById('editorWorkspace').dataset.tool===${JSON.stringify(tool)}&&[...document.querySelectorAll('.editor-inspector>.edit-card')].filter(e=>getComputedStyle(e).display!=='none').length===1`), `Tool ${tool} must show exactly one panel`);
  }
  await click('[data-editor-tool="text"]');
  await click('[data-text-style="title"]');
  assert(await evaluate(`editorShapes.length===1&&editorShapes[0].type==='text'&&document.getElementById('shapeEditor').closest('.edit-card').id==='editor-text'&&getComputedStyle(document.getElementById('shapeEditor')).display!=='none'`), 'Text preset did not expose editable text controls');
  await evaluate(`document.getElementById('shapeText').value='A story worth telling';document.getElementById('shapeText').dispatchEvent(new Event('input'));document.activeElement.blur()`);
  assert(await evaluate(`editorShapes[0].text==='A story worth telling'`), 'Text content did not update');
  await click('[data-editor-tool="content"]');
  await click('[data-add-shape="circle"]');
  assert(await evaluate(`editorShapes.length===2&&editorShapes[1].type==='circle'&&document.getElementById('shapeEditor').closest('.edit-card').id==='editor-content'`), 'Shape controls did not follow the active tool');
  await click('#deleteShape');
  await click('[data-editor-tool="transform"]');
  await evaluate(`document.getElementById('editorAspectControl').value='9:16';document.getElementById('editorAspectControl').dispatchEvent(new Event('change'))`);
  assert(await evaluate(`(()=>{const r=document.querySelector('.editor-stage').getBoundingClientRect();return editorAspect==='9:16'&&document.getElementById('editAspect').value==='9:16'&&Math.abs(r.width/r.height-9/16)<.01})()`), 'Canvas preview and export aspect ratio disagree');
  await evaluate(`document.getElementById('trimEnd').value=.75;document.getElementById('trimEnd').dispatchEvent(new Event('input'))`);
  await click('#editorOpenExport');
  await click('#exportEdit');
  for (let i=0;i<50;i++) {
    await sleep(150);
    if (await evaluate(`document.getElementById('downloadModal').classList.contains('open')`)) break;
  }
  assert(await evaluate(`document.getElementById('downloadModal').classList.contains('open')&&pendingRecordingBlob.size>5000&&!recordingLocked`), 'Portrait text export did not complete');
  const exported = await evaluate(`(async()=>{const bytes=new Uint8Array(await pendingRecordingBlob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.slice(i,i+8192));return btoa(binary)})()`);
  await Deno.writeFile('editor-redesign-test-export.mp4', Uint8Array.from(atob(exported), c=>c.charCodeAt(0)));
  const decode = await new Deno.Command(Deno.cwd()+'\\vendor\\ffmpeg.exe', { args:['-v','error','-i','editor-redesign-test-export.mp4','-f','null','NUL'], stdout:'piped',stderr:'piped' }).output();
  assert(decode.success, 'Exported portrait MP4 did not decode: '+new TextDecoder().decode(decode.stderr));
  await evaluate(`document.getElementById('downloadModal').classList.remove('open');document.getElementById('applyTrim').click()`);
  await evaluate(`document.getElementById('editorAspectControl').value='original';document.getElementById('editorAspectControl').dispatchEvent(new Event('change'))`);
  await click('#editorHelp');
  assert(await evaluate(`!!document.querySelector('.editor-shortcut-dialog[open]')`), 'Keyboard help did not open');
  await click('#editorCloseHelp');
  await click('#editorProjects');
  await sleep(300);
  assert(await evaluate(`document.querySelector('.project-drawer').classList.contains('open')&&getComputedStyle(document.querySelector('.project-drawer')).zIndex>80`), 'Projects drawer is hidden behind the studio');
  await click('#closeProjects');
  await sleep(300);
  assert(await evaluate(`!document.querySelector('.project-drawer').classList.contains('open')`), 'Projects drawer did not close');
  await click('#editorOpenExport');
  assert(await evaluate(`document.getElementById('editorWorkspace').dataset.tool==='export'&&document.getElementById('editorExportSummary').textContent.includes('MP4')`), 'Header export did not open the export controls');
  await click('[data-editor-tool="media"]');
  await screenshot('editor-redesign-preview.png');
  for (const [width, height] of [[1366,768], [1024,768], [640,950], [390,844]]) {
    await viewport(width, height);
    const layout = await evaluate(`(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect();return {left:rect('#editorWorkspace').left,right:rect('#editorWorkspace').right,bottom:rect('.editor-timeline').bottom,stage:rect('.editor-stage').height,panel:rect('.editor-inspector').width,timelineWidth:rect('.editor-timeline').width,width:innerWidth,height:innerHeight,actions:document.querySelector('.editor-timeline-actions').scrollWidth}})()`);
    assert(Math.abs(layout.left)<1&&Math.abs(layout.right-width)<1&&layout.bottom<=height+1&&layout.stage>90&&layout.panel>250&&layout.actions<layout.timelineWidth, 'Layout overflow: '+JSON.stringify(layout));
    console.log('Responsive studio', width, height, layout);
    await click('[data-editor-tool="text"]');
    await click('[data-editor-tool="media"]');
    if (width===390) await screenshot('editor-redesign-mobile.png');
  }
  await viewport(1440,1000);
  await click('#editorBack');
  assert(await evaluate(`!document.getElementById('editorWorkspace').classList.contains('open')&&document.getElementById('reviewTab').classList.contains('active')`), 'Back to Review failed');
  await click('#downloaderTab');
  assert(await evaluate(`document.getElementById('downloaderWorkspace').classList.contains('open')&&!!document.querySelector('script#lugh-direct-mp4-download')`), 'Downloader integration lost');
  assert(!errors.length, errors.join('\n'));
  console.log('Studio UI passed: empty import, unique controls, all panels, source thumbnails, text editing, shapes, canvas, shortcuts, Projects, export entry, responsive layout, Review, Downloader.');
} finally { socket.close(); }

$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$path=Join-Path $root 'lughfilm.html'
$s=[IO.File]::ReadAllText($path)
# Retire the competing preview clocks and legacy split/drag renderers.
$retired=@('lugh-playback-edit-actions-script','lugh-playback-edit-actions-placement-fix','lugh-playback-edit-actions-final-fix','lugh-playback-edit-actions-render-guard','lugh-true-playhead-split','lugh-editable-video-segments','lugh-segment-lanes-and-identity-fix','lugh-independent-segments-and-media-undo','lugh-direct-clip-drag','lugh-project-scoped-timeline-state','lugh-composition-timeline-engine','lugh-composition-clock-fix','lugh-global-composition-playhead','lugh-frame-flash-guard','lugh-composition-canvas','lugh-layer-scroll-sync','lugh-object-track-drawer-script','lugh-object-track-overflow-script','lugh-canvas-decoder-activity-fix','lugh-frame-flash-guard-style','lugh-composition-canvas-style','lugh-global-composition-playhead-style','lugh-editor-v2-style','lugh-editor-v2-script')
$retired+=@('lugh-editor-viewport-script','lugh-editor-viewport-fit','lugh-editor-preview-fit-script','lugh-editor-preview-fit-style','lugh-collapsed-layout-fix')
foreach($id in $retired){$pattern='<(script|style)\b[^>]*id="'+[regex]::Escape($id)+'"[^>]*>[\s\S]*?</\1>';$s=[regex]::Replace($s,$pattern,'')}
$a=$s.IndexOf('function updateEditorTime()');$b=$s.IndexOf('ev.onloadedmetadata=',$a)
if($a -lt 0 -or $b -lt 0){throw 'Missing editor playback integration'}
$s=$s.Substring(0,$a)+'function updateEditorTime(){if(window.LughEditor)window.LughEditor.update()}'+$s.Substring($b)
$a=$s.IndexOf('async function exportEditedVideo()');$b=$s.IndexOf("document.querySelectorAll('[data-add-shape]')",$a)
if($a -lt 0 -or $b -lt 0){throw 'Missing editor export integration'}
$s=$s.Substring(0,$a)+'async function exportEditedVideo(){return window.LughEditor?.exportVideo()}'+$s.Substring($b)
$s=$s.Replace('function shapeIsVisible(s,time=ev.currentTime)','function shapeIsVisible(s,time=window.LughEditor?.time??ev.currentTime)')
$s=$s.Replace('start:ev.currentTime||0,end:Math.min(ev.duration||999999,(ev.currentTime||0)+5)', 'start:window.LughEditor?.time||ev.currentTime||0,end:Math.min(window.LughEditor?.duration||ev.duration||999999,(window.LughEditor?.time||ev.currentTime||0)+5)')
$s=$s.Replace('let duration=ev.duration||0;q(''shapeTracks'')','let duration=window.LughEditor?.duration||ev.duration||0;q(''shapeTracks'')')
$s=$s.Replace('function renderShapeTracks(){let duration=ev.duration||0;', 'function renderShapeTracks(){let duration=window.LughEditor?.duration||ev.duration||0;')
$s=$s.Replace('function renderAudioTrack(){let duration=ev.duration||0;', 'function renderAudioTrack(){let duration=window.LughEditor?.duration||ev.duration||0;')
if(!$s.Contains('editorTimeline:window.LughEditor')){$s=$s.Replace('editorAspect,videoFade,audioFade,savedAt:', 'editorAspect,videoFade,audioFade,editorTimeline:window.LughEditor?.serialize(),savedAt:')}
if(!$s.Contains('lughPendingTimeline=project.editorTimeline')){$s=$s.Replace('if(!project||!savedVideo)return;', 'if(!project||!savedVideo)return;window.lughPendingTimeline=project.editorTimeline||null;')}
$seekBridge='if(window.LughEditor)window.LughEditor.seek(window.LughEditor.time);else '
$legacySeek='ev.currentTime=Math.min(v.currentTime||0,ev.duration||0);'
$s=[regex]::Replace($s,'(?:'+[regex]::Escape($seekBridge)+')*'+[regex]::Escape($legacySeek),$seekBridge+$legacySeek)
$s=$s.Replace('}else ev.pause();if(downloading)', '}else{if(window.LughEditor)window.LughEditor.pause();else ev.pause()}if(downloading)')
$css=[IO.File]::ReadAllText((Join-Path $root 'editor-ui.css'))
$s=$s.Replace('let duration=ev.duration||0,t=Math.max(', 'let duration=window.LughEditor?.duration||ev.duration||0,t=Math.max(')
$s=$s.Replace('window.LughEditor?.time||ev.currentTime||0','(window.LughEditor?.time??ev.currentTime??0)')
$s=$s.Replace('const p=Math.max(0,Math.min(1,(ev.currentTime-s.start)/.35))','const p=Math.max(0,Math.min(1,((window.LughEditor?.time??ev.currentTime)-s.start)/.35))')
$s=$s.Replace('ec.font=`bold ${Math.max(12,s.fontSize/1080*h)}px Arial`','ec.font=`bold ${Math.max(12,s.fontSize/1080*h)}px ${s.fontFamily||''Arial''}`')
$js=[IO.File]::ReadAllText((Join-Path $root 'editor-core.js'))
if(!$s.Contains('window.LughEditor?.timelineTime(e.clientX)')){$s=$s.Replace('(e.clientX-timelineDrag.track.left)/timelineDrag.track.width*duration','(window.LughEditor?.timelineTime(e.clientX)??((e.clientX-timelineDrag.track.left)/timelineDrag.track.width*duration))')}
$s=$s.Replace('</body>',('<style id="lugh-editor-v2-style">'+$css+'</style><script id="lugh-editor-v2-script">'+$js+'</script></body>'))
[IO.File]::WriteAllText($path,$s,[Text.UTF8Encoding]::new($false))
'Embedded editor v2; retired '+$retired.Count+' legacy blocks.'

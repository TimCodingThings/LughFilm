/* LughFilm editor: one timeline model and one playback owner. Embedded by sync-editor.ps1. */
class LughTimeline {
  constructor(duration, state = {}) {
    this.sourceDuration = duration;
    this.clips =
      (state.clips || [{ id: "clip-1", start: 0, end: duration, at: 0 }])
        .filter((c) =>
          Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start
        )
        .map((c) => ({
          ...c,
          start: Math.max(0, c.start),
          end: Math.min(duration, c.end),
          at: Math.max(0, c.at || 0),
          sourceMin: Math.max(0, c.sourceMin ?? c.start),
          sourceMax: Math.min(duration, c.sourceMax ?? c.end),
        }));
    this.range = { start: 0, end: this.duration, ...state.range };
    this.setRange(this.range.start, this.range.end);
  }
  get duration() {
    return Math.max(0, ...this.clips.map((c) => c.at + c.end - c.start));
  }
  get length() {
    return Math.max(0, this.range.end - this.range.start);
  }
  at(time) {
    return [...this.clips].sort((a, b) => b.at - a.at).find((c) =>
      time >= c.at && time < c.at + c.end - c.start
    );
  }
  sourceAt(time) {
    const c = this.at(time);
    return c ? c.start + time - c.at : null;
  }
  next(time) {
    return [...this.clips].sort((a, b) => a.at - b.at).find((c) => c.at > time);
  }
  setRange(start, end) {
    const duration = this.duration;
    this.range = {
      start: Math.max(0, Math.min(duration, Number(start) || 0)),
      end: Math.max(0, Math.min(duration, Number(end) || 0)),
    };
    if (duration && this.range.end <= this.range.start) {
      this.range.end = Math.min(duration, this.range.start + 1 / 30);
    }
    if (this.range.end <= this.range.start && duration) {
      this.range.start = Math.max(0, this.range.end - 1 / 30);
    }
  }
  split(time) {
    const c = this.at(time), source = this.sourceAt(time);
    if (!c || source - c.start < 1 / 30 || c.end - source < 1 / 30) {
      return false;
    }
    const right = {
      ...c,
      id: `${c.id}-${source.toFixed(3)}`,
      start: source,
      at: time,
      sourceMin: source,
    };
    c.end = source;
    c.sourceMax = source;
    this.clips.splice(this.clips.indexOf(c) + 1, 0, right);
    return true;
  }
  remove(id, ripple = true) {
    const c = this.clips.find((c) => c.id === id);
    if (!c) return;
    const length = c.end - c.start, oldDuration = this.duration;
    this.clips = this.clips.filter((item) => item !== c);
    if (ripple) {
      this.clips.forEach((item) => {
        if (item.at >= c.at + length - .001) item.at -= length;
      });
    }
    this.setRange(
      this.range.start,
      this.range.end - (oldDuration - this.duration),
    );
  }
  cut(start, end) {
    if (end <= start) return;
    const result = [];
    for (const c of this.clips) {
      const left = Math.max(c.start, start), right = Math.min(c.end, end);
      if (left >= right) {
        result.push(c);
        continue;
      }
      if (c.start < left) result.push({ ...c, end: left, sourceMax: left });
      if (right < c.end) {
        result.push({
          ...c,
          id: `${c.id}-cut-${right}`,
          start: right,
          sourceMin: right,
          at: c.at + left - c.start,
        });
      }
    }
    // Source cuts ripple through clips in source order; preserve deliberate placement gaps.
    const removedBefore = (source) =>
      Math.max(0, Math.min(end, source) - start);
    for (const c of result) {
      const original = this.clips.find((old) =>
        c.start >= old.start && c.start < old.end
      );
      if (original && c.start >= end) {
        c.at = Math.max(
          0,
          original.at + c.start - original.start - removedBefore(c.start),
        );
      }
    }
    const oldDuration = this.duration;
    this.clips = result;
    this.setRange(
      this.range.start,
      this.range.end - (oldDuration - this.duration),
    );
  }
  removeRange(start, end) {
    start = Math.max(0, start);
    end = Math.min(this.duration, end);
    if (end <= start) return false;
    const result = [], length = end - start, oldEnd = this.range.end;
    for (const c of this.clips) {
      const clipEnd = c.at + c.end - c.start;
      if (clipEnd <= start) result.push({ ...c });
      else if (c.at >= end) result.push({ ...c, at: c.at - length });
      else {
        if (c.at < start) {
          result.push({
            ...c,
            end: c.start + start - c.at,
            sourceMax: c.start + start - c.at,
          });
        }
        if (clipEnd > end) {
          result.push({
            ...c,
            id: `${c.id}-range-${end.toFixed(3)}`,
            start: c.start + end - c.at,
            sourceMin: c.start + end - c.at,
            at: start,
          });
        }
      }
    }
    this.clips = result;
    this.setRange(
      this.range.start > end
        ? this.range.start - length
        : Math.min(this.range.start, start),
      oldEnd > end ? oldEnd - length : Math.min(oldEnd, start),
    );
    return true;
  }
  move(id, at) {
    const clip = this.clips.find((c) => c.id === id);
    if (!clip) return;
    const followsEnd = Math.abs(this.range.end - this.duration) < .002;
    const others = this.clips.filter((c) => c !== clip).sort((a, b) =>
      a.at - b.at
    );
    at = Math.max(0, at);
    const covering = others.find((c) =>
      at > c.at && at < c.at + c.end - c.start
    );
    if (covering) {
      at = at <= covering.at + (covering.end - covering.start) / 2
        ? covering.at
        : covering.at + covering.end - covering.start;
    }
    clip.at = at;
    let edge = at + clip.end - clip.start;
    for (const other of others) {
      if (other.at + other.end - other.start <= at + .000001) continue;
      other.at = Math.max(other.at, edge);
      edge = other.at + other.end - other.start;
    }
    if (followsEnd) this.range.end = this.duration;
    this.setRange(this.range.start, this.range.end);
  }
  trimClip(id, start, end) {
    const c = this.clips.find((c) => c.id === id);
    if (!c) return;
    const followsEnd = Math.abs(this.range.end - this.duration) < .002;
    const next =
      this.clips.filter((other) => other !== c && other.at >= c.at).sort((
        a,
        b,
      ) => a.at - b.at)[0];
    c.start = Math.max(c.sourceMin, Math.min(c.end - 1 / 30, Number(start)));
    const maxEnd = Math.min(
      c.sourceMax,
      next ? c.start + next.at - c.at : c.sourceMax,
    );
    c.end = Math.max(c.start + 1 / 30, Math.min(maxEnd, Number(end)));
    if (followsEnd) this.range.end = this.duration;
    this.setRange(this.range.start, this.range.end);
  }
  serialize() {
    return {
      version: 2,
      clips: this.clips.map((c) => ({ ...c })),
      range: { ...this.range },
    };
  }
  static x(time, duration, width) {
    return duration ? time / duration * width : 0;
  }
  static time(x, duration, width) {
    return width ? Math.max(0, Math.min(duration, x / width * duration)) : 0;
  }
}
globalThis.LughTimeline = LughTimeline;

// View geometry is independent of the composition's changing duration.
class LughTimelineScale {
  constructor() {
    this.basePixelsPerSecond = 0;
    this.zoom = 1;
    this.end = 0;
  }
  get pixelsPerSecond() { return this.basePixelsPerSecond * this.zoom; }
  fit(duration, width) {
    if (!(duration > 0 && width > 0)) return;
    this.basePixelsPerSecond = width / duration;
    this.zoom = 1;
    this.end = duration;
  }
  extend(duration) { this.end = Math.max(this.end, duration); }
  x(time) { return time * this.pixelsPerSecond; }
  time(x) { return this.pixelsPerSecond ? Math.max(0, x / this.pixelsPerSecond) : 0; }
  width(viewportWidth) { return Math.max(viewportWidth, Math.ceil(this.x(this.end))); }
}
globalThis.LughTimelineScale = LughTimelineScale;

if (typeof document !== "undefined") {
  (() => {
    const $ = (id) => document.getElementById(id),
      video = $("editorVideo"),
      workspace = $("editorWorkspace");
    if (!video || !workspace) return;
    let model = new LughTimeline(0),
      time = 0,
      playing = false,
      frame = 0,
      lastNow = 0,
      currentClip = null;
    let pendingSeek = null,
      seekBusy = false,
      seekFrame = 0,
      zoom = 1,
      selected = "",
      drag = null,
      renderFrame = 0,
      projectKey = "",
      history = [],
      redo = [];
    let timelineScale = new LughTimelineScale(), dragScrollFrame = 0;
    let activeTool = "media";
    let track = $("editTimeline");
    const stage = workspace.querySelector(".editor-stage"),
      timeline = workspace.querySelector(".editor-timeline");
    const format = (t) =>
      `${Math.floor(Math.max(0, t) / 60)}:${
        (Math.max(0, t) % 60).toFixed(2).padStart(5, "0")
      }`;
    const clampTime = (t) =>
      Math.max(model.range.start, Math.min(model.range.end, t));
    const storageKey = () =>
      `lughFilmEditorV2:${
        activeProjectId || $("editorMediaName")?.textContent || "unsaved"
      }`;
    const busy = () => recordingLocked || video.dataset.exporting === "true";
    function message(text) {
      $("editorStatus").textContent = text;
    }
    function persist() {
      try {
        localStorage.setItem(storageKey(), JSON.stringify(model.serialize()));
      } catch (_) {}
      saveState();
    }
    function checkpoint() {
      history.push(model.serialize());
      if (history.length > 60) history.shift();
      redo = [];
    }
    function undo(forward = false) {
      if (busy()) return;
      const from = forward ? redo : history,
        to = forward ? history : redo,
        state = from.pop();
      if (!state) return;
      to.push(model.serialize());
      pause();
      model = new LughTimeline(video.duration, state);
      time = clampTime(time);
      render();
      seek(time);
      persist();
    }
    function requestSeek(source) {
      if (source === null || !Number.isFinite(source)) return;
      pendingSeek = Math.max(
        0,
        Math.min(Math.max(0, video.duration - .001), source),
      );
      if (!seekFrame) seekFrame = requestAnimationFrame(flushSeek);
    }
    function flushSeek() {
      seekFrame = 0;
      if (seekBusy || video.seeking || pendingSeek === null) return;
      const target = pendingSeek;
      pendingSeek = null;
      if (Math.abs(video.currentTime - target) < .002) {
        resumeDecoder();
        return;
      }
      seekBusy = true;
      video.currentTime = target;
    }
    function resumeDecoder() {
      if (
        playing && currentClip && !seekBusy && !video.seeking &&
        pendingSeek === null && video.paused
      ) {
        video.play().catch((error) => {
          pause();
          message(error.message);
        });
      }
    }
    video.addEventListener("seeked", () => {
      seekBusy = false;
      if (pendingSeek !== null) {
        if (!seekFrame) seekFrame = requestAnimationFrame(flushSeek);
      } else resumeDecoder();
    });
    video.addEventListener("error", () => {
      seekBusy = false;
      pause();
      message("This video could not be decoded. Try an MP4 with H.264 video.");
    });
    function seek(value) {
      time = clampTime(value);
      currentClip = model.at(time);
      requestSeek(model.sourceAt(Math.min(time, model.range.end - .001)));
      readout();
    }
    function pause() {
      playing = false;
      cancelAnimationFrame(frame);
      video.pause();
      editorAudio.pause();
      $("editorPlay").textContent = "Play";
      $("editorPlay").setAttribute("aria-label", "Play edited video");
    }
    function play() {
      if (busy() || !model.length) return;
      if (time >= model.range.end - .015) time = model.range.start;
      playing = true;
      lastNow = performance.now();
      seek(time);
      resumeDecoder();
      $("editorPlay").textContent = "Pause";
      $("editorPlay").setAttribute("aria-label", "Pause edited video");
      frame = requestAnimationFrame(tick);
    }
    function tick(now) {
      if (!playing || busy()) return;
      const elapsed = Math.min(.2, (now - lastNow) / 1000);
      lastNow = now;
      if (
        currentClip && !seekBusy && !video.seeking &&
        (!video.paused || video.ended) && video.readyState >= 2
      ) {
        time = currentClip.at + video.currentTime - currentClip.start;
        const clipEnd = currentClip.at + currentClip.end - currentClip.start;
        if (time >= clipEnd - .012 || video.ended) {
          time = clipEnd;
          const next = model.at(time + .001);
          if (
            next && Math.abs(next.start - currentClip.end) < .002
          ) currentClip = next;
          else {
            video.pause();
            currentClip = next;
            requestSeek(model.sourceAt(time + .001));
          }
        }
      } else if (!currentClip) {
        time += elapsed * (Number($("editSpeed").value) || 1);
        const next = model.at(time);
        if (next) {
          currentClip = next;
          requestSeek(model.sourceAt(time));
        }
      }
      if (time >= model.range.end - .003) {
        time = model.range.end;
        pause();
        readout();
        return;
      }
      syncAudio();
      readout();
      frame = requestAnimationFrame(tick);
    }
    function syncAudio() {
      if (!audioDetached) return;
      const audioTime = audioTrimStart + time - model.range.start;
      if (audioTime >= audioTrimEnd || audioTime < audioTrimStart) {
        editorAudio.pause();
        return;
      }
      if (
        Math.abs(editorAudio.currentTime - audioTime) > .15 &&
        !editorAudio.seeking
      ) editorAudio.currentTime = audioTime;
      editorAudio.playbackRate = video.playbackRate;
      if (playing && editorAudio.paused) editorAudio.play().catch(() => {});
    }
    function readout() {
      $("editorScrub").max = model.duration;
      $("editorScrub").value = time;
      $("editorScrub").dataset.compositionTime = String(time);
      $("editorTime").textContent = `${format(time)} / ${
        format(model.duration)
      }`;
      const x = timelineScale.x(time);
      $("editorTimelinePlayhead").style.transform = `translateX(${x}px)`;
      stage.classList.toggle(
        "editor-gap",
        !model.at(Math.min(time, model.range.end - .001)),
      );
      const fade = Math.max(0, videoFade),
        alpha = fade
          ? Math.max(
            0,
            Math.min(
              1,
              (time - model.range.start) / fade,
              (model.range.end - time) / fade,
            ),
          )
          : 1;
      video.style.opacity = alpha;
      updateShapeVisibility();
      if (playing) {
        const viewport = $("editorTimelineViewport");
        if (
          x > viewport.scrollLeft + viewport.clientWidth - 35 ||
          x < viewport.scrollLeft
        ) viewport.scrollLeft = Math.max(0, x - viewport.clientWidth * .3);
      }
    }
    function scheduleRender() {
      if (!renderFrame) {
        renderFrame = requestAnimationFrame(() => {
          renderFrame = 0;
          render();
        });
      }
    }
    function render() {
      if (selected && !model.clips.some((c) => c.id === selected)) {
        selected = "";
      }
      const duration = model.duration || 1;
      const content = $("editorTimelineContent");
      const viewport = $("editorTimelineViewport");
      if (!timelineScale.pixelsPerSecond) timelineScale.fit(model.duration, viewport.clientWidth);
      timelineScale.extend(model.duration);
      content.style.width = `${timelineScale.width(viewport.clientWidth)}px`;
      const px = (t) => timelineScale.x(t);
      track.innerHTML = model.clips.map((c, i) =>
        `<button type="button" class="editor-clip${
          selected === c.id ? " selected" : ""
        }" data-clip="${c.id}" style="left:${px(c.at)}px;width:${
          px(c.end - c.start)
        }px" aria-label="Clip ${i + 1}, source ${format(c.start)} to ${
          format(c.end)
        }"><i data-edge="start" title="Trim clip start"></i><span>Clip ${
          i + 1
        }<small>${
          format(c.end - c.start)
        }</small></span><i data-edge="end" title="Trim clip end"></i></button>`
      ).join("");
      // Render readable ticks for the visible interval, even on a long project.
      const desired = 90 / (timelineScale.pixelsPerSecond || 1),
        magnitude = 10 ** Math.floor(Math.log10(desired)),
        step = [1, 2, 5, 10].find(n => n * magnitude >= desired) * magnitude,
        startTick = Math.max(0, Math.floor(timelineScale.time(viewport.scrollLeft) / step)),
        endTick = Math.ceil(timelineScale.time(viewport.scrollLeft + viewport.clientWidth) / step);
      content.style.setProperty("--editor-tick-spacing", `${px(step) / 5}px`);
      content.style.setProperty("--editor-grid-spacing", `${px(step)}px`);
      $("editorTimelineRuler").innerHTML = Array.from(
        { length: Math.min(100, endTick - startTick + 1) },
        (_, i) => {
          const tick = (startTick + i) * step;
          return `<span data-time="${tick}" style="left:${px(tick)}px">${format(tick)}</span>`;
        },
      ).join("");
      $("editorRange").style.left = `${px(model.range.start)}px`;
      $("editorRange").style.width = `${px(model.length)}px`;
      $("editorRangeStart").style.left = `${px(model.range.start)}px`;
      $("editorRangeEnd").style.left = `${px(model.range.end)}px`;
      $("editorTrimShadeBefore").style.width = `${px(model.range.start)}px`;
      $("editorTrimShadeAfter").style.left = `${px(model.range.end)}px`;
      $("editorTrimShadeAfter").style.width = `${Math.max(0, content.clientWidth - px(model.range.end))}px`;
      $("trimStart").max = duration;
      $("trimEnd").max = duration;
      $("trimStart").value = model.range.start.toFixed(2);
      $("trimEnd").value = model.range.end.toFixed(2);
      $("editorTrimSummary").textContent = `${
        format(model.length)
      } kept · changes apply immediately`;
      $("editorUndo").disabled = !history.length;
      $("editorRedo").disabled = !redo.length;
      $("editorDeleteClip").disabled = !selected;
      $("editorSplit").disabled = !model.at(time);
      $("editorZoomLabel").textContent = `${Math.round(zoom * 100)}%`;
      $("exportEdit").disabled = busy() || !model.length;
      for (const button of workspace.querySelectorAll('[data-text-style],[data-add-shape],#addTextOverlay,#editorPlay,#editorPrev,#editorNext')) {
        button.disabled = busy() || !model.length;
      }
      if ($("editorOpenExport")) $("editorOpenExport").disabled = busy() || !model.length;
      if ($("editorSequenceInfo")) $("editorSequenceInfo").textContent =
        `${model.clips.length} ${model.clips.length === 1 ? "clip" : "clips"} · ${format(model.length)}`;
      if ($("editorExportSummary")) $("editorExportSummary").textContent =
        `${format(model.length)} selected · MP4 · ${editorAspect === "original" ? "Original aspect ratio" : editorAspect}`;
      renderClipProperties();
      renderShapeTracks();
      renderAudioTrack();
      scheduleLayerLayout();
      readout();
    }
    function rangeChanged(edge) {
      if (busy()) return;
      let start = Number($("trimStart").value),
        end = Number($("trimEnd").value);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      if (end <= start) {
        if (edge === "start") start = end - 1 / 30;
        else end = start + 1 / 30;
      }
      model.setRange(start, end);
      trimApplied = true;
      if (time < model.range.start || time >= model.range.end) {
        seek(
          clampTime(time),
        );
      }
      scheduleRender();
      persist();
    }
    function split() {
      if (busy()) return;
      checkpoint();
      if (!model.split(time)) {
        history.pop();
        message("Place the playhead inside a clip to split it.");
        return;
      }
      render();
      persist();
      message("Clip split at the playhead.");
    }
    function remove() {
      if (busy() || !selected) return;
      checkpoint();
      pause();
      model.remove(selected);
      selected = "";
      time = clampTime(time);
      render();
      seek(time);
      persist();
      message("Clip removed. Undo restores it.");
    }
    function changeZoom(value) {
      if (!timelineScale.pixelsPerSecond) return;
      const view = $("editorTimelineViewport"), leftTime = timelineScale.time(view.scrollLeft);
      zoom = Math.max(1, Math.min(8, value));
      timelineScale.zoom = zoom;
      render();
      view.scrollLeft = timelineScale.x(leftTime);
    }
    function pointerTime(event) {
      const rect = $("editorTimelineContent").getBoundingClientRect();
      return Math.max(0, (event.clientX - rect.left) / (drag?.pixelsPerSecond || timelineScale.pixelsPerSecond || 1));
    }
    function renderClipProperties() {
      const select = $("editorSelectedClip"),
        c = model.clips.find((c) => c.id === selected);
      select.innerHTML = '<option value="">Choose a clip</option>' +
        model.clips.map((clip, i) =>
          `<option value="${clip.id}">Clip ${i + 1} · ${
            format(clip.end - clip.start)
          }</option>`
        ).join("");
      select.value = c?.id || "";
      $("editorClipFields").hidden = !c;
      if (!c) return;
      for (
        const [id, value] of [["editorClipPosition", c.at], [
          "editorClipIn",
          c.start,
        ], ["editorClipOut", c.end]]
      ) $(id).value = value.toFixed(3);
      $("editorClipIn").min = c.sourceMin;
      $("editorClipIn").max = c.end - 1 / 30;
      $("editorClipOut").min = c.start + 1 / 30;
      $("editorClipOut").max = c.sourceMax;
      $("editorClipDuration").textContent = `${
        format(c.end - c.start)
      } kept from this clip`;
    }
    function init() {
      workspace.classList.add("editor-v2");
      const properties = document.createElement("section");
      properties.className = "editor-clip-properties";
      properties.innerHTML =
        '<h4>Selected clip</h4><select id="editorSelectedClip" aria-label="Select a clip to edit"></select><div id="editorClipFields" hidden><div class="trim-grid"><label class="trim-field">Timeline position<input id="editorClipPosition" type="number" min="0" step=".001"></label><label class="trim-field">Source in<input id="editorClipIn" type="number" min="0" step=".001"></label><label class="trim-field">Source out<input id="editorClipOut" type="number" min="0" step=".001"></label></div><p id="editorClipDuration"></p></div>';
      $("editor-trim").insertBefore(properties, $("editor-trim").children[1]);
      $("editorSelectedClip").onchange = (event) => {
        if (busy()) return;
        selected = event.target.value;
        pause();
        const clip = model.clips.find((c) => c.id === selected);
        if (clip) seek(clip.at);
        render();
      };
      for (
        const id of ["editorClipPosition", "editorClipIn", "editorClipOut"]
      ) {
        $(id).addEventListener("focus", checkpoint);
        $(id).onchange = () => {
          if (busy()) return;
          const c = model.clips.find((c) => c.id === selected);
          if (!c) return;
          const value = Number($(id).value);
          if (!Number.isFinite(value)) return;
          pause();
          if (id === "editorClipPosition") model.move(selected, value);
          else {model.trimClip(
              selected,
              id === "editorClipIn" ? value : c.start,
              id === "editorClipOut" ? value : c.end,
            );}
          seek(c.at);
          render();
          persist();
        };
      }
      const shapeTracks = $("shapeTracks"), audioTracks = $("audioTrackArea");
      timeline.innerHTML =
        `<div class="editor-timeline-actions"><div><button id="editorSplit" title="Split at playhead (S)">Split</button><button id="editorDeleteClip" title="Delete selected clip">Delete clip</button><button id="editorUndo" title="Undo (Ctrl+Z)">Undo</button><button id="editorRedo" title="Redo (Ctrl+Shift+Z)">Redo</button></div><div><button id="editorZoomOut" aria-label="Zoom out">−</button><output id="editorZoomLabel">100%</output><button id="editorZoomIn" aria-label="Zoom in">+</button><button id="editorZoomFit">Fit</button></div></div><div id="editorTimelineViewport" tabindex="0" aria-label="Editing timeline"><div id="editorTimelineContent"><div id="editorTimelineRuler"></div><div class="editor-range-row"><span id="editorRange"></span><button id="editorRangeStart" data-range="start" aria-label="Trim start" title="Drag to trim start"></button><button id="editorRangeEnd" data-range="end" aria-label="Trim end" title="Drag to trim end"></button></div><div class="timeline-track" id="editTimeline" aria-label="Video track"></div><div class="shape-track-area" id="shapeTracks"></div><div id="audioTrackArea"></div><div id="editorTimelinePlayhead" aria-hidden="true"><i></i></div></div></div><div class="editor-timeline-foot"><span id="editorStatus" role="status">Drag the range handles to trim · drag a clip to move it</span><span>Space: play · I / O: trim · S: split</span></div>`;
      track = $("editTimeline");
      for (const id of ["editorTrimShadeBefore", "editorTrimShadeAfter"]) {
        const shade = document.createElement("div");
        shade.id = id;
        shade.className = "editor-trim-shade";
        $("editorTimelineContent").appendChild(shade);
      }
      $("shapeTracks").replaceWith(shapeTracks);
      $("audioTrackArea").replaceWith(audioTracks);
      // Keep legacy rendering targets detached; baseline controls now delegate to this controller.
      for (
        const id of [
          "editClip",
          "timelineCuts",
          "trimBefore",
          "trimAfter",
          "trimStartCaption",
          "trimEndCaption",
          "trimStartHandle",
          "trimEndHandle",
          "editPlayhead",
        ]
      ) {
        const el = document.createElement("div");
        el.id = id;
        el.hidden = true;
        timeline.appendChild(el);
      }
      const toolbar = document.createElement("div");
      toolbar.className = "editor-v2-header";
      toolbar.innerHTML =
        '<div><b>Video editor</b><span>Trim, arrange, and export your footage</span></div><div><button id="editorImport">Replace video</button><button id="editorOpenExport">Export MP4</button></div>';
      workspace.prepend(toolbar);
      const trimSummary = document.createElement("p");
      trimSummary.id = "editorTrimSummary";
      trimSummary.className = "editor-live-trim";
      $("editor-trim").appendChild(trimSummary);
      $("applyTrim").textContent = "Reset trim";
      $("applyTrim").onclick = () => {
        if (busy()) return;
        checkpoint();
        model.setRange(0, model.duration);
        seek(model.range.start);
        render();
        persist();
      };
      ["start", "end"].forEach((edge) => {
        const input = $(edge === "start" ? "trimStart" : "trimEnd");
        input.addEventListener("focus", checkpoint);
        input.oninput = () => rangeChanged(edge);
        $(edge === "start" ? "setTrimStart" : "setTrimEnd").onclick = () => {
          if (busy()) return;
          checkpoint();
          input.value = time.toFixed(3);
          rangeChanged(edge);
        };
      });
      $("editorPlay").onclick = () => playing ? pause() : play();
      $("editorPrev").onclick = () => {
        pause();
        seek(time - 1 / 30);
      };
      $("editorNext").onclick = () => {
        pause();
        seek(time + 1 / 30);
      };
      $("editorScrub").oninput = (event) => {
        if (busy()) return;
        pause();
        seek(Number(event.target.value));
      };
      $("editorSplit").onclick = split;
      $("editorDeleteClip").onclick = remove;
      $("editorUndo").onclick = () => undo();
      $("editorRedo").onclick = () => undo(true);
      $("editorZoomIn").onclick = () => changeZoom(zoom * 1.5);
      $("editorZoomOut").onclick = () => changeZoom(zoom / 1.5);
      $("editorZoomFit").onclick = () => {
        if (drag) return;
        timelineScale.fit(model.duration, $("editorTimelineViewport").clientWidth);
        zoom = 1;
        $("editorTimelineViewport").scrollLeft = 0;
        render();
      };
      $("editorImport").onclick = () => $("file").click();
      $("editorOpenExport").onclick = () => {
        document.querySelector('[data-editor-tool="export"]')?.click();
        $("exportEdit").scrollIntoView({ block: "nearest" });
      };
      for (
        const id of ["quickClipRange", "quickAttachClip", "quickDeleteObject"]
      ) $(id)?.remove();
      workspace.querySelector(".segment-help")?.remove();
      $("editorPlay").title = "Play / pause (Space)";
      $("editorPrev").title = "Previous frame (←)";
      $("editorNext").title = "Next frame (→)";
      $("setCutStart").onclick = () => {
        $("cutStart").value = time.toFixed(2);
      };
      $("setCutEnd").onclick = () => {
        $("cutEnd").value = time.toFixed(2);
      };
      $("addCut").onclick = () => {
        if (busy()) return;
        const start = Number($("cutStart").value),
          end = Number($("cutEnd").value);
        if (
          !Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
          start < model.range.start || end > model.range.end
        ) {
          message("Choose a cut range inside the kept trim range.");
          return;
        }
        checkpoint();
        pause();
        model.removeRange(start, end);
        time = clampTime(start);
        render();
        seek(time);
        persist();
        message(
          "Section removed and later clips shifted left. Undo restores it.",
        );
      };
      $("cutList").replaceChildren();
      $("editorMediaTile").onclick = () => {
        if (busy()) return;
        seek(model.range.start);
        play();
      };
      const view = $("editorTimelineViewport");
      view.addEventListener("pointerdown", (event) => {
        if (
          busy() || event.button !== 0 ||
          event.target.closest(".shape-segment,.audio-segment")
        ) return;
        const clipEl = event.target.closest("[data-clip]"),
          edge = event.target.dataset.edge,
          range = event.target.dataset.range;
        if (clipEl) selected = clipEl.dataset.clip;
        pause();
        const before = model.serialize(),
          c = model.clips.find((c) => c.id === selected);
        drag = {
          pointer: event.pointerId,
          startX: event.clientX,
          clientX: event.clientX,
          start: pointerTime(event),
          pixelsPerSecond: timelineScale.pixelsPerSecond,
          clip: clipEl ? c : null,
          edge,
          range,
          before,
          moved: false,
        };
        if (!clipEl && !range) seek(pointerTime(event));
        view.setPointerCapture(event.pointerId);
        event.preventDefault();
        scheduleRender();
        dragScrollFrame = requestAnimationFrame(scrollDrag);
      });
      function updateDrag() {
        const target = pointerTime({ clientX: drag.clientX }), delta = target - drag.start;
        if (Math.abs(drag.clientX - drag.startX) >= 2) drag.moved = true;
        if (drag.range) {
          model.setRange(
            drag.range === "start"
              ? Math.min(target, model.range.end - 1 / 30)
              : model.range.start,
            drag.range === "end"
              ? Math.max(target, model.range.start + 1 / 30)
              : model.range.end,
          );
          seek(drag.range === "start" ? model.range.start : model.range.end);
        } else if (drag.clip && drag.moved) {
          const origin = drag.before.clips.find((c) => c.id === drag.clip.id);
          model = new LughTimeline(model.sourceDuration, drag.before);
          const c = model.clips.find((c) => c.id === origin.id);
          drag.clip = c;
          if (drag.edge === "start") {
            const shift = Math.max(
              -Math.min(origin.start - origin.sourceMin, origin.at),
              Math.min(origin.end - origin.start - 1 / 30, delta),
            );
            c.start = origin.start + shift;
            c.at = origin.at + shift;
            seek(c.at);
          } else if (drag.edge === "end") {
            c.end = Math.max(
              c.start + 1 / 30,
              Math.min(origin.sourceMax, origin.end + delta),
            );
            const next = model.clips.filter((other) =>
              other !== c && other.at >= c.at
            ).sort((a, b) => a.at - b.at)[0];
            if (next) c.end = Math.min(c.end, c.start + next.at - c.at);
            seek(c.at + c.end - c.start - .001);
          } else model.move(c.id, origin.at + delta);
          if (
            Math.abs(
              drag.before.range.end -
                Math.max(
                  ...drag.before.clips.map((c) => c.at + c.end - c.start),
                ),
            ) < .002
          ) model.range.end = model.duration;
          model.setRange(model.range.start, model.range.end);
        } else if (!drag.clip) seek(target);
        scheduleRender();
      }
      function scrollDrag() {
        dragScrollFrame = 0;
        if (!drag) return;
        if (drag.moved && (drag.clip || drag.range)) {
          const rect = view.getBoundingClientRect(), zone = 28,
            left = drag.clientX - rect.left, right = rect.right - drag.clientX;
          const velocity = right < zone ? Math.min(18, (zone - right) * .6) :
            left < zone ? -Math.min(18, (zone - left) * .6) : 0;
          if (velocity > 0 && drag.clip) {
            timelineScale.extend(timelineScale.time(view.scrollLeft + view.clientWidth + 90));
            $("editorTimelineContent").style.width = `${timelineScale.width(view.clientWidth)}px`;
          }
          if (velocity) {
            const before = view.scrollLeft;
            view.scrollLeft += velocity;
            if (view.scrollLeft !== before) updateDrag();
          }
        }
        dragScrollFrame = requestAnimationFrame(scrollDrag);
      }
      view.addEventListener("pointermove", (event) => {
        if (!drag || drag.pointer !== event.pointerId) return;
        drag.clientX = event.clientX;
        updateDrag();
      });
      const finishDrag = (event) => {
        if (!drag || drag.pointer !== event.pointerId) return;
        if ((drag.range || drag.clip) && drag.moved) {
          history.push(drag.before);
          redo = [];
          persist();
        } else if (drag.clip) seek(drag.clip.at);
        drag = null;
        cancelAnimationFrame(dragScrollFrame);
        render();
      };
      view.addEventListener("pointerup", finishDrag);
      view.addEventListener("pointercancel", finishDrag);
      video.ontimeupdate = () => {};
      video.onplay = () => {};
      video.onpause = () => {};
      video.addEventListener("loadedmetadata", loadModel);
      video.addEventListener("loadstart", () => {
        pause();
        drag = null;
        cancelAnimationFrame(dragScrollFrame);
        pendingSeek = null;
        seekBusy = false;
        model = new LughTimeline(0);
        timelineScale = new LughTimelineScale();
        zoom = 1;
        time = 0;
        history = [];
        redo = [];
      });
      new ResizeObserver(scheduleRender).observe(view);
      view.addEventListener("scroll", scheduleRender);
      new MutationObserver(scheduleLayerLayout).observe($("shapeTracks"), {
        childList: true,
      });
      new MutationObserver(scheduleLayerLayout).observe($("audioTrackArea"), {
        childList: true,
      });
      window.addEventListener("keydown", (event) => {
        if (
          !workspace.classList.contains("open") ||
          workspace.querySelector("dialog[open]") ||
          event.target.closest(
            'input,select,textarea,[contenteditable="true"]',
          ) || busy()
        ) return;
        let handled = true;
        if (
          (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z"
        ) undo(event.shiftKey);
        else if (event.code === "Space") playing ? pause() : play();
        else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          pause();
          seek(
            time +
              (event.key === "ArrowLeft" ? -1 : 1) *
                (event.shiftKey ? 1 : 1 / 30),
          );
        } else if (
          event.key.toLowerCase() === "s" && !event.ctrlKey && !event.metaKey
        ) split();
        else if (
          event.key.toLowerCase() === "i" || event.key.toLowerCase() === "o"
        ) {
          const edge = event.key.toLowerCase() === "i" ? "start" : "end";
          checkpoint();
          $(edge === "start" ? "trimStart" : "trimEnd").value = time;
          rangeChanged(edge);
        } else if (
          event.key === "Delete" && selected && !selectedShape
        ) remove();
        else handled = false;
        if (handled) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
      workspace.querySelectorAll("[data-editor-tool]").forEach((button) => {
        button.title = button.querySelector("span")?.textContent ||
          button.dataset.editorTool;
      });
      mountWorkspace();
      render();
      if (video.readyState >= 1) loadModel();
    }
    const icons = {
      media: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/>',
      trim: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 12 12M8 16 20 4"/>',
      transform: '<path d="M7 3v14a2 2 0 0 0 2 2h12M3 7h14a2 2 0 0 1 2 2v12"/>',
      text: '<path d="M4 5h16M12 5v15M8 20h8"/>',
      content: '<rect x="3" y="3" width="10" height="10" rx="2"/><circle cx="16" cy="16" r="5"/>',
      audio: '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/>',
      export: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
      undo: '<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12"/>',
      redo: '<path d="m16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12"/>',
      trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
      back: '<path d="m14 5-7 7 7 7"/>',
      plus: '<path d="M12 4v16M4 12h16"/>',
    };
    const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.media}</svg>`;
    const toolNames = { media: "Your media", trim: "Trim & cut", transform: "Video", text: "Text", content: "Shapes", audio: "Audio", export: "Export" };
    function selectTool(name, focus = false) {
      activeTool = name;
      const inspector = workspace.querySelector(".editor-inspector");
      inspector.classList.toggle("export-only", name === "export");
      inspector.classList.add("tool-filter");
      workspace.dataset.tool = name;
      workspace.querySelectorAll("[data-editor-tool]").forEach((button) => {
        const active = button.dataset.editorTool === name;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      inspector.querySelector(".editor-inspector-title").textContent = toolNames[name];
      inspector.querySelectorAll(".edit-card").forEach((panel) => {
        const visible = name === "export" ? panel.classList.contains("export-panel") :
          panel.id === ({ media: "editor-media-info", trim: "editor-trim", transform: "editor-transform", text: "editor-text", content: "editor-content", audio: "editor-audio" })[name];
        panel.classList.toggle("tool-visible", visible);
        panel.setAttribute("aria-hidden", String(!visible));
      });
      // Text and shapes share the same real selection controls, without duplicating IDs.
      const destination = name === "text" ? $("editor-text") : $("editor-content");
      for (const node of [$("shapeEditor"), workspace.querySelector(".shape-layer-actions"), $("deleteShape")]) {
        if (node) destination.appendChild(node);
      }
      inspector.scrollTop = 0;
      if (focus) inspector.querySelector(".tool-visible input,.tool-visible button")?.focus({ preventScroll: true });
    }
    let thumbnailSource = "", thumbnailDecoder = null;
    function fitPreview() {
      const container = workspace.querySelector(".editor-stage-shell"),
        card = workspace.querySelector(".editor-preview-card");
      if (!container.clientWidth || !container.clientHeight) return;
      const css = getComputedStyle(container),
        availableW = Math.max(1, container.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)),
        availableH = Math.max(1, container.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)),
        vw = video.videoWidth || 1920, vh = video.videoHeight || 1080,
        sideways = editRotation % 180 !== 0,
        baseW = sideways ? vh : vw, baseH = sideways ? vw : vh,
        ratio = ({ "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:3": 4 / 3 })[editorAspect] || baseW / baseH,
        height = Math.min(availableH, Math.min(availableW, 1100) / ratio),
        width = height * ratio;
      card.style.setProperty("width", `${width}px`, "important");
      card.style.setProperty("height", `${height}px`, "important");
      const scale = Math.max(width / baseW, height / baseH);
      // Use the same crop and rotation as export; overlays now sit on the actual frame.
      video.style.setProperty("width", `${vw * scale}px`, "important");
      video.style.setProperty("height", `${vh * scale}px`, "important");
      video.style.inset = "auto";
      video.style.left = "50%";
      video.style.top = "50%";
      video.style.transform = `translate(-50%,-50%) rotate(${editRotation}deg) scaleX(${editFlipped ? -1 : 1})`;
      const outputW = Math.max(2, Math.floor(Math.min(baseW, baseH * ratio) / 2) * 2),
        outputH = Math.max(2, Math.floor(outputW / ratio / 2) * 2);
      for (const shape of editorShapes.filter(s => s.type === "text")) {
        const text = $("editorOverlay").querySelector(`[data-shape-id="${shape.id}"] .shape-visual.text`);
        if (text) text.style.fontSize = `${Math.max(12, shape.fontSize / 1080 * outputH) * height / outputH}px`;
      }
    }
    function refreshMedia() {
      $("editorSourceDetails").textContent = `${video.videoWidth} × ${video.videoHeight} · ${format(video.duration)} · Source video`;
      $("editorAspectControl").value = $("editAspect").value;
      $("editorEmptyState").hidden = !!model.duration;
      fitPreview();
      if (thumbnailSource === video.src) return;
      thumbnailSource = video.src;
      workspace.style.removeProperty("--editor-thumbnail");
      if (thumbnailDecoder) {
        thumbnailDecoder.pause();
        thumbnailDecoder.removeAttribute("src");
        thumbnailDecoder.load();
      }
      const decoder = document.createElement("video");
      thumbnailDecoder = decoder;
      decoder.muted = true;
      decoder.preload = "auto";
      decoder.onloadeddata = () => { decoder.currentTime = Math.min(.25, decoder.duration / 4); };
      decoder.onseeked = () => {
        if (decoder !== thumbnailDecoder) return;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = Math.max(1, Math.round(320 * decoder.videoHeight / decoder.videoWidth));
          canvas.getContext("2d").drawImage(decoder, 0, 0, canvas.width, canvas.height);
          workspace.style.setProperty("--editor-thumbnail", `url("${canvas.toDataURL("image/jpeg", .75)}")`);
        } catch (_) { /* The source remains usable if a thumbnail cannot be decoded. */ }
        decoder.removeAttribute("src");
        decoder.load();
      };
      decoder.src = video.src;
    }
    function mountWorkspace() {
      workspace.classList.add("editor-redesign");
      const originalLook = applyEditorLook, originalShapes = renderEditorShapes;
      applyEditorLook = function () { originalLook(); fitPreview(); };
      renderEditorShapes = function () { originalShapes(); fitPreview(); };
      new ResizeObserver(fitPreview).observe(workspace.querySelector(".editor-stage-shell"));
      const shell = workspace.querySelector(".editor-shell"),
        inspector = workspace.querySelector(".editor-inspector"),
        toolbar = workspace.querySelector(".editor-v2-header"),
        topbar = workspace.querySelector(".editor-topbar"),
        projectName = $("editorProjectName");
      toolbar.innerHTML = `<div class="editor-brand-group"><button id="editorBack" class="editor-icon-button" title="Back to review" aria-label="Back to review">${icon("back")}</button><span class="editor-wordmark">lugh<span>film</span><small>EDITOR</small></span><span class="editor-header-divider"></span></div><div class="editor-project-heading"><span id="editorProjectSlot"></span><span class="editor-local-label"><i></i>Local project</span></div><div class="editor-header-actions"><button id="editorProjects">Projects</button><button id="editorHelp" class="editor-icon-button" aria-label="Editor keyboard shortcuts" title="Keyboard shortcuts">?</button><button id="editorOpenExport" class="editor-primary">${icon("export")}<span>Export MP4</span></button></div>`;
      $("editorProjectSlot").appendChild(projectName);
      $("editorBack").onclick = () => setMode("review");
      $("editorProjects").onclick = () => { pause(); $("openProjects").click(); };
      $("editorOpenExport").onclick = () => { selectTool("export", true); render(); };
      // The old topbar had duplicate undo/redo IDs. Only the timeline owns these actions.
      topbar.replaceChildren();
      $("editorUndo").onclick = () => undo();
      $("editorRedo").onclick = () => undo(true);
      topbar.innerHTML = '<span class="editor-preview-label"><i></i>Preview</span><label class="editor-canvas-label">Canvas <select id="editorAspectControl" aria-label="Canvas aspect ratio"></select></label>';
      $("editorAspectControl").innerHTML = $("editAspect").innerHTML;
      $("editorAspectControl").onchange = (event) => {
        if (busy()) return;
        $("editAspect").value = event.target.value;
        $("editAspect").dispatchEvent(new Event("change"));
        render();
      };
      $("editAspect").addEventListener("change", () => { $("editorAspectControl").value = $("editAspect").value; render(); });
      shell.appendChild(timeline);
      const sequenceHeading = document.createElement("div");
      sequenceHeading.className = "editor-sequence-heading";
      sequenceHeading.innerHTML = '<strong>Timeline</strong><span id="editorSequenceInfo"></span><span class="editor-timeline-hint">Drag clip edges to trim</span>';
      timeline.prepend(sequenceHeading);
      for (const [id, name, label] of [["editorSplit", "trim", "Split"], ["editorDeleteClip", "trash", "Delete"], ["editorUndo", "undo", "Undo"], ["editorRedo", "redo", "Redo"]]) {
        $(id).innerHTML = `${icon(name)}<span>${label}</span>`;
        $(id).setAttribute("aria-label", label);
      }
      $("editorZoomOut").textContent = "−";
      $("editorZoomFit").textContent = "Fit timeline";
      $("editorStatus").textContent = "Select a clip to get started. Split, trim, and arrange your story.";
      timeline.querySelector(".editor-timeline-foot > span:last-child").innerHTML = '<kbd>Space</kbd> Play / pause <kbd>S</kbd> Split <button id="editorTimelineHelp">All shortcuts ↗</button>';
      workspace.querySelector(".editor-rail").setAttribute("aria-label", "Editing tools");
      for (const name of ["media", "text", "content", "trim", "transform", "audio", "export"]) {
        const button = workspace.querySelector(`[data-editor-tool="${name}"]`);
        if (!button) continue;
        workspace.querySelector(".editor-rail").appendChild(button);
        button.innerHTML = `${icon(name)}<span>${toolNames[name]}</span>`;
        button.title = toolNames[name];
        button.onclick = () => selectTool(name);
      }
      inspector.setAttribute("aria-label", "Editing tool settings");
      const media = $("editor-media-info");
      media.querySelector("h3").textContent = "Project files";
      media.querySelector(".editor-card-help").textContent = "Your footage stays on this device. Select the video to preview it.";
      const importButton = $("editorAddMedia");
      importButton.innerHTML = `${icon("plus")}<span>Import / replace video</span>`;
      importButton.onclick = () => { if (!busy()) $("file").click(); };
      media.insertBefore(importButton, media.children[1]);
      const details = document.createElement("p");
      details.id = "editorSourceDetails";
      details.className = "editor-card-help";
      details.textContent = "MP4 video · stored locally";
      $("editorMediaTile").appendChild(details);
      $("editorMediaTile").querySelector("small").textContent = "On your timeline";
      $("editorMediaTile").querySelector(".media-thumb").innerHTML = '<span class="editor-media-play">▶</span><span class="editor-media-badge">VIDEO</span>';
      $("editorAudioTile").onclick = () => selectTool("audio");
      $("editorAudioTile").querySelector("strong").textContent = "Original audio";
      $("editorAudioTile").querySelector("small").textContent = "Manage volume and detach audio";
      const empty = document.createElement("div");
      empty.id = "editorEmptyState";
      empty.className = "editor-empty-state";
      empty.innerHTML = `${icon("media")}<h2>A little footage. A great story.</h2><p>Import a video, make it yours, and export your final cut.</p><button class="editor-primary" id="editorEmptyImport">Import a video</button><small>MP4 · stays on this device</small>`;
      stage.appendChild(empty);
      $("editorEmptyImport").onclick = () => importButton.click();
      const textPanel = $("editor-text"), textPresets = document.createElement("div");
      textPanel.querySelector("h3").textContent = "Say it your way";
      textPanel.querySelector(".editor-card-help").textContent = "Choose a style. Then edit your words right here.";
      textPresets.className = "editor-text-presets";
      textPresets.innerHTML = '<button data-text-style="title"><b>Your title here</b><span>Simple title</span></button><button data-text-style="lower"><b>A name worth knowing</b><span>Lower third</span></button><button data-text-style="caption"><b>Make every word count.</b><span>Caption</span></button>';
      textPanel.insertBefore(textPresets, $("addTextOverlay"));
      textPresets.onclick = (event) => {
        const button = event.target.closest("[data-text-style]");
        if (!button || busy() || !model.length) return;
        addEditorShape("text");
        const shape = editorShapes.find((s) => s.id === selectedShape), type = button.dataset.textStyle;
        Object.assign(shape, { color: "#ffffff", text: type === "title" ? "Your title here" : type === "lower" ? "Your name" : "Make every word count.", fontSize: type === "title" ? 64 : 38, x: type === "lower" ? 8 : 15, y: type === "title" ? 40 : 75, w: 70, h: 16 });
        renderEditorShapes();
        selectTool("text");
        saveState();
        $("shapeText").focus();
        $("shapeText").select();
      };
      $("addTextOverlay").onclick = () => {
        if (busy() || !model.length) return;
        addEditorShape("text"); selectTool("text"); $("shapeText").focus(); $("shapeText").select();
      };
      for (const [id, text] of [["editor-trim", "Keep the best parts"], ["editor-transform", "Make it fit"], ["editor-audio", "Find the right balance"], ["editor-content", "Add a little emphasis"]]) {
        $(id).querySelector("h3").textContent = text;
      }
      // Fold advanced video controls into clear sections instead of a wall of settings.
      for (const section of [...$("editor-transform").querySelectorAll(":scope > .inspector-section")]) {
        const heading = section.querySelector("h4");
        if (!heading) continue;
        const disclosure = document.createElement("details"), summary = document.createElement("summary");
        summary.textContent = heading.textContent;
        heading.remove();
        disclosure.className = "editor-disclosure";
        disclosure.append(summary, ...section.childNodes);
        section.replaceWith(disclosure);
      }
      const exportPanel = inspector.querySelector(".export-panel"), summary = document.createElement("p");
      summary.id = "editorExportSummary";
      summary.className = "editor-export-summary";
      exportPanel.insertBefore(summary, exportPanel.children[1]);
      const exportHelp = document.createElement("p");
      exportHelp.className = "editor-card-help";
      exportHelp.textContent = "Includes your selected range, video adjustments, text, shapes, and audio. Preview the MP4 before saving.";
      exportPanel.appendChild(exportHelp);
      const shortcutDialog = document.createElement("dialog");
      shortcutDialog.className = "editor-shortcut-dialog";
      shortcutDialog.setAttribute("aria-labelledby", "editorShortcutsTitle");
      shortcutDialog.innerHTML = '<div><h2 id="editorShortcutsTitle">A few keys. A faster edit.</h2><button id="editorCloseHelp" aria-label="Close shortcuts">×</button></div><p>Keep your focus on the story.</p><dl><dt>Play / pause</dt><dd><kbd>Space</kbd></dd><dt>Split at playhead</dt><dd><kbd>S</kbd></dd><dt>Set range start / end</dt><dd><kbd>I</kbd> <kbd>O</kbd></dd><dt>Previous / next frame</dt><dd><kbd>←</kbd> <kbd>→</kbd></dd><dt>Jump one second</dt><dd><kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>→</kbd></dd><dt>Undo / redo timeline edit</dt><dd><kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Shift</kbd> + <kbd>Z</kbd></dd><dt>Delete selection</dt><dd><kbd>Delete</kbd></dd></dl><p>Drag a clip to move it. Drag its edges to trim. Green handles select the range to export.</p>';
      workspace.appendChild(shortcutDialog);
      const openHelp = () => shortcutDialog.showModal();
      $("editorHelp").onclick = openHelp;
      $("editorTimelineHelp").onclick = openHelp;
      $("editorCloseHelp").onclick = () => shortcutDialog.close();
      shortcutDialog.onclick = (event) => { if (event.target === shortcutDialog) shortcutDialog.close(); };
      const showSelectedOverlay = () => {
        const shape = editorShapes.find((s) => s.id === selectedShape);
        if (shape) { selected = ""; selectTool(shape.type === "text" ? "text" : "content"); }
      };
      $("editorOverlay").addEventListener("pointerdown", showSelectedOverlay);
      $("shapeTracks").addEventListener("click", showSelectedOverlay);
      $("editorTimelineViewport").addEventListener("pointerdown", (event) => {
        if (!event.target.closest("[data-clip]")) return;
        selectedShape = null;
        renderEditorShapes();
        selectTool("trim");
      });
      selectTool("media");
    }
    function scheduleLayerLayout() {
      $("shapeTracks").querySelectorAll("[data-track-shape]").forEach((el) => {
        const s = editorShapes.find((s) => s.id === el.dataset.trackShape);
        if (s) {
          el.style.left = `${timelineScale.x(s.start)}px`;
          el.style.width = `${timelineScale.x(Math.max(0, s.end - s.start))}px`;
        }
      });
      const audio = $("audioTrackArea").querySelector(".audio-segment");
      if (audio) {
        audio.style.left = `${
          timelineScale.x(audioDetached ? audioTrimStart : 0)
        }px`;
        audio.style.width = `${
          timelineScale.x(audioDetached ? audioTrimEnd - audioTrimStart : model.duration)
        }px`;
      }
    }
    function loadModel() {
      if (!Number.isFinite(video.duration)) return;
      projectKey = storageKey();
      let state = globalThis.lughPendingTimeline;
      globalThis.lughPendingTimeline = null;
      if (!state) {
        try {
          state = JSON.parse(localStorage.getItem(projectKey) || "null");
        } catch (_) {}
      }
      if (!state) {
        // Import the previous split/position data once; future state belongs to this project.
        const read = (key, fallback) => {
          try {
            return JSON.parse(
              localStorage.getItem(key) || JSON.stringify(fallback),
            );
          } catch (_) {
            return fallback;
          }
        };
        const signature = `${($("editorMediaName").textContent || "").trim()}|${
          video.duration.toFixed(3)
        }`;
        if (
          localStorage.getItem("lughFilmTimelineMediaSignature") === signature
        ) {
          const points = [
              0,
              ...read("lughFilmTimelineSplits", []).filter((t) =>
                t > 0 && t < video.duration
              ).sort((a, b) => a - b),
              video.duration,
            ],
            deleted = read("lughFilmDeletedSegments", []),
            positions = read("lughFilmTimelinePositions", {});
          state = {
            clips: points.slice(0, -1).map((start, i) => {
              const end = points[i + 1],
                id = `${start.toFixed(3)}-${end.toFixed(3)}`;
              return {
                id,
                start,
                end,
                at: positions[id] == null
                  ? start
                  : positions[id] / 100 * video.duration,
              };
            }).filter((c) => !deleted.includes(c.id)),
          };
        }
      }
      model = new LughTimeline(video.duration, state || {});
      timelineScale = new LughTimelineScale();
      zoom = 1;
      $("editorTimelineViewport").scrollLeft = 0;
      refreshMedia();
      if (!state?.version) {
        for (const cut of editorCuts) {
          model.cut(cut.start, cut.end);
        }
      }
      time = model.range.start;
      selected = "";
      currentClip = model.at(time);
      seek(time);
      render();
      message("Ready · trims update as you drag");
    }
    // Export uses an independent decoder and the exact same timeline mapping as playback.
    // Preview controls therefore cannot seek or pause the export source.
    let cancelExport = null;
    async function exportVideo() {
      if (busy() || !model.length) return;
      const mime = typeof MediaRecorder === "undefined" ? null : [
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4;codecs=avc1.42E01E",
        "video/mp4",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      if (!mime) {
        message("MP4 export requires a current Chrome or Edge browser.");
        return;
      }
      pause();
      recordingLocked = true;
      video.dataset.exporting = "true";
      render();
      const snapshot = new LughTimeline(
          model.sourceDuration,
          model.serialize(),
        ),
        progress = $("editorProgress"),
        controller = new AbortController();
      let decoder,
        audio,
        ctx,
        stream,
        recorder,
        raf = 0,
        gain,
        audioSource,
        destination;
      progress.classList.add("show");
      progress.textContent = "Preparing export…";
      cancelExport = () => controller.abort();
      function loadMedia(element) {
        return new Promise((resolve, reject) => {
          const clean = () => {
            clearTimeout(timer);
            element.removeEventListener("loadeddata", ready);
            element.removeEventListener("error", fail);
            controller.signal.removeEventListener("abort", abort);
          };
          const ready = () => {
              clean();
              resolve();
            },
            fail = () => {
              clean();
              reject(new Error("Cannot read the source video."));
            },
            abort = () => {
              clean();
              reject(new DOMException("Export cancelled", "AbortError"));
            };
          const timer = setTimeout(fail, 15000);
          element.addEventListener("loadeddata", ready);
          element.addEventListener("error", fail);
          controller.signal.addEventListener("abort", abort, { once: true });
          if (controller.signal.aborted) abort();
          else if (element.readyState >= 2) ready();
          else element.load();
        });
      }
      try {
        // Resume audio while still in the user click gesture, before asynchronous media loading.
        ctx = new AudioContext();
        await ctx.resume();
        decoder = document.createElement("video");
        decoder.src = video.currentSrc || video.src;
        decoder.preload = "auto";
        decoder.playsInline = true;
        decoder.style.cssText =
          "position:fixed;width:2px;height:2px;opacity:.001;pointer-events:none;bottom:0;left:0";
        document.body.appendChild(decoder);
        await loadMedia(decoder);
        audio = audioDetached ? document.createElement("audio") : decoder;
        if (audioDetached) {
          audio.src = editorAudio.currentSrc || decoder.src;
          audio.preload = "auto";
          await loadMedia(audio);
        }
        const vw = decoder.videoWidth,
          vh = decoder.videoHeight,
          sideways = editRotation % 180 !== 0,
          baseW = sideways ? vh : vw,
          baseH = sideways ? vw : vh;
        const out = document.createElement("canvas"),
          ratios = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:3": 4 / 3 },
          ratio = ratios[editorAspect] || baseW / baseH;
        out.width = Math.max(
          2,
          Math.floor(Math.min(baseW, baseH * ratio) / 2) * 2,
        );
        out.height = Math.max(2, Math.floor(out.width / ratio / 2) * 2);
        const paint = out.getContext("2d"), chunks = [];
        stream = out.captureStream(30);
        gain = ctx.createGain();
        destination = ctx.createMediaStreamDestination();
        audioSource = ctx.createMediaElementSource(audio);
        audioSource.connect(gain).connect(destination);
        destination.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
        recorder = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: 8000000,
        });
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        let exportTime = snapshot.range.start,
          active = null,
          waiting = false,
          previous = performance.now(),
          rate = Number($("editSpeed").value) || 1;
        const changeClip = async (c) => {
          waiting = true;
          decoder.pause();
          active = c;
          if (c) {
            await seekExportMedia(
              decoder,
              snapshot.sourceAt(exportTime),
              controller.signal,
            );
            decoder.playbackRate = rate;
            await decoder.play();
          }
          waiting = false;
          previous = performance.now();
        };
        await changeClip(snapshot.at(exportTime));
        if (audioDetached) {
          await seekExportMedia(audio, audioTrimStart, controller.signal);
          audio.playbackRate = rate;
          await audio.play();
        }
        const draw = () => {
          paint.fillStyle = "#02070d";
          paint.fillRect(0, 0, out.width, out.height);
          if (active && !waiting && decoder.readyState >= 2) {
            paint.save();
            paint.translate(out.width / 2, out.height / 2);
            const cover = Math.max(out.width / baseW, out.height / baseH);
            paint.scale(cover * (editFlipped ? -1 : 1), cover);
            paint.rotate(editRotation * Math.PI / 180);
            paint.filter = `brightness(${$("brightness").value}%) contrast(${
              $("contrast").value
            }%) saturate(${$("saturation").value}%)`;
            paint.drawImage(decoder, -vw / 2, -vh / 2, vw, vh);
            paint.restore();
          }
          drawEditorShapes(paint, out.width, out.height, exportTime);
          const fade = videoFade
            ? Math.max(
              0,
              Math.min(
                1,
                (exportTime - snapshot.range.start) / videoFade,
                (snapshot.range.end - exportTime) / videoFade,
              ),
            )
            : 1;
          if (fade < 1) {
            paint.fillStyle = `rgba(2,7,13,${1 - fade})`;
            paint.fillRect(0, 0, out.width, out.height);
          }
          const af = audioFade
            ? Math.max(
              0,
              Math.min(
                1,
                (exportTime - snapshot.range.start) / audioFade,
                (snapshot.range.end - exportTime) / audioFade,
              ),
            )
            : 1;
          const audioPresent = audioDetached
            ? audioTrimStart + exportTime - snapshot.range.start < audioTrimEnd
            : !!active;
          gain.gain.value = audioPresent
            ? Number($("editVolume").value) / 100 * af
            : 0;
        };
        draw();
        recorder.start(1000);
        await new Promise((resolve, reject) => {
          const abort = () =>
            reject(new DOMException("Export cancelled", "AbortError"));
          controller.signal.addEventListener("abort", abort, { once: true });
          recorder.onerror = (event) =>
            reject(event.error || new Error("Recording failed."));
          const step = (now) => {
            if (controller.signal.aborted) return;
            if (!waiting) {
              if (active) {
                exportTime = active.at + decoder.currentTime - active.start;
              } else {exportTime += Math.min(.2, (now - previous) / 1000) *
                  rate;}
              if (exportTime >= snapshot.range.end - .01) {
                exportTime = snapshot.range.end;
                draw();
                controller.signal.removeEventListener("abort", abort);
                resolve();
                return;
              }
              const next = snapshot.at(exportTime);
              if (
                next?.id !== active?.id ||
                (active &&
                  (decoder.currentTime >= active.end - .01 || decoder.ended))
              ) {
                if (active) exportTime = active.at + active.end - active.start;
                const following = snapshot.at(exportTime + .001);
                if (
                  following && active &&
                  Math.abs(following.start - active.end) < .002
                ) active = following;
                else {
                  if (recorder.state === "recording") recorder.pause();
                  changeClip(following).then(() => {
                    if (
                      !controller.signal.aborted && recorder.state === "paused"
                    ) recorder.resume();
                  }).catch(reject);
                }
              }
            }
            previous = now;
            draw();
            progress.textContent = `Exporting in real time · ${
              Math.min(
                100,
                Math.floor(
                  (exportTime - snapshot.range.start) / snapshot.length * 100,
                ),
              )
            }%`;
            raf = requestAnimationFrame(step);
          };
          raf = requestAnimationFrame(step);
        });
        await new Promise((resolve) => {
          recorder.onstop = resolve;
          recorder.stop();
        });
        const blob = new Blob(chunks, { type: mime });
        if (!blob.size) throw new Error("The recording contained no video.");
        if (pendingRecordingUrl) URL.revokeObjectURL(pendingRecordingUrl);
        pendingRecordingBlob = blob;
        pendingRecordingUrl = URL.createObjectURL(blob);
        $("recordPreview").src = pendingRecordingUrl;
        $("downloadName").value =
          ($("exportFileName")?.value || "lughfilm-edited").replace(
            /\.mp4$/i,
            "",
          ).replace(/[<>:"/\\|?*]/g, "-");
        $("downloadModal").classList.add("open");
        message("Export ready to preview and download.");
      } catch (error) {
        message(
          error.name === "AbortError"
            ? "Export cancelled."
            : `Export failed: ${error.message}`,
        );
        console.error(error);
      } finally {
        cancelAnimationFrame(raf);
        if (recorder && recorder.state !== "inactive") {
          recorder.onstop = null;
          recorder.stop();
        }
        decoder?.pause();
        if (audio && audio !== decoder) audio.pause();
        decoder?.remove();
        audioSource?.disconnect();
        gain?.disconnect();
        destination?.disconnect();
        stream?.getTracks().forEach((t) => t.stop());
        await ctx?.close();
        cancelExport = null;
        recordingLocked = false;
        delete video.dataset.exporting;
        progress.classList.remove("show");
        render();
      }
    }
    globalThis.LughEditor = {
      get time() {
        return time;
      },
      get duration() {
        return model.duration;
      },
      serialize: () => model.serialize(),
      update: readout,
      pause,
      play,
      seek,
      exportVideo,
      cancelExport: () => cancelExport?.(),
      cut: (start, end) => {
        if (busy()) return;
        checkpoint();
        pause();
        model.cut(start, end);
        time = clampTime(time);
        render();
        seek(time);
        persist();
      },
      renderLayers: scheduleLayerLayout,
      timelineTime: (clientX) => pointerTime({ clientX }),
    };
    init();
    $("exportEdit").onclick = exportVideo;
    $("cancelEditorExport").onclick = () => cancelExport?.();
  })();
}

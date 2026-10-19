# LughFilm

LughFilm is a private, on-device video review studio. Review gameplay frame by frame, annotate decisions, mark important moments, record coaching sessions, and make basic edits without uploading source footage to a third-party service.

[**Download LughFilm for Windows**](https://github.com/TimCodingThings/LughFilm/releases/latest/download/LughFilm-Setup.exe)

## Quick start

1. Download and run `LughFilm-Setup.exe`.
2. Choose whether to create a desktop shortcut and finish the installation.
3. Open LughFilm from the Start menu or desktop shortcut. LughFilm stays available from the Windows system tray after the browser closes.
4. LughFilm opens at `http://127.0.0.1:8765` in your browser.
5. Drop in an MP4, open an existing local project, or use the Downloader tab.

If Windows SmartScreen appears for this unsigned community build, select **More info** and then **Run anyway**.

Bookmarks to `127.0.0.1:8765` work while the LughFilm tray application is running. After restarting Windows or choosing **Exit LughFilm** from the tray menu, launch `LughFilm.exe` before opening the bookmark.

The Windows installer includes its own Java runtime, FFmpeg, `yt-dlp`, and Deno. Recipients do not need VS Code, Java, FFmpeg, or a separate `yt-dlp` installation.

## Updates

Use **Check for yt-dlp updates** in the Downloader tab when a supported website changes or downloads begin failing. LughFilm updates the bundled downloader from yt-dlp's stable channel without reinstalling the application. Downloader updates and video imports run one at a time so the executable cannot be replaced during a download.

For LughFilm application updates, exit LughFilm from its system-tray menu, download the newest `LughFilm-Setup.exe` from the Releases page, and run it. Installers use the same Windows upgrade identity, so a higher version replaces the existing installation. Projects and preferences remain in browser storage for `http://127.0.0.1:8765` and normally survive an application update.

## Requirements

- Windows 10 or newer
- A modern version of Chrome or Edge

Developers running the source version through `start-lughfilm.bat` need Java 17 or newer. Opening `lughfilm.html` directly works for review and editing, but not link-based downloading.

## Review studio

- Drag-and-drop or file-picker MP4 loading
- Fully local playback with no source upload
- Play, pause, five-second seek, and remappable keyboard shortcuts
- Playback speeds from `0.1×` through `2×`
- Previous-frame and next-frame controls with estimated frame numbers
- Zoom, pan, zoom reset, mute, and pointer mode
- Fullscreen playback with a dedicated progress bar, timestamp markers, and video-volume slider
- Fullscreen annotation dock that can be shown or hidden
- Pen, arrow, and circle annotations in multiple colors
- Undo with the toolbar or `Ctrl+Z`, plus clear-all controls
- Gameplay timestamps displayed on the progress bar
- Preset marker colors: red, green, blue, yellow, orange, white, purple, and cyan
- Timestamped marker notes suitable for coaching review

## Coaching recording and export

- Record a complete review session with optional microphone commentary
- Independent microphone and gameplay-audio levels
- Select a microphone from inside LughFilm
- Echo-cancellation and noise-suppression options
- Mic commentary stays at normal pitch and speed during slow-motion playback
- Exported recordings include visible annotations, zoom/pan state, and timestamp marker callouts
- MP4 preview before download
- Editable exported filename with download confirmation
- Recording lock that prevents accidentally starting more than one recording

MP4 recording support depends on the formats exposed by the browser. Current Chrome or Edge versions are recommended.

## Persistent projects

- Projects are stored locally in the browser on the current device
- Project drawer for opening saved reviews
- Create a new review or replace the current video
- Rename and permanently delete projects
- Saved markers, annotations, and review state
- Source footage remains on-device

Browser storage capacity varies by device and browser. Large projects may be limited by available disk space or browser storage quotas.

## Downloader

- Paste a supported video-site link into a dedicated Downloader tab
- Uses local `yt-dlp` processing
- Prefers the best available MP4 video and M4A audio streams, then converts incompatible fallbacks to a real MP4 when needed
- Downloads one video at a time and targets MP4 output
- **Download to Review** creates a new LughFilm Review project when finished
- **Download MP4** lets you rename the file first, then saves it directly to the local Windows `Downloads` folder without using OneDrive or the browser's download location
- Estimates the selected video's file size after a link is pasted; sites that do not publish size metadata may show the estimate as unavailable
- Optional **Compress MP4** re-encodes video with H.264/AAC and shows an approximate compressed-size projection; the original is kept automatically if it is already smaller
- Includes Deno for YouTube JavaScript challenge support
- Checks for and installs stable yt-dlp updates from inside the Downloader tab
- Keeps temporary download processing on the local computer
- Shows live percentage, transferred size, speed, ETA, and a clear completion notice with the final local path
- Retries transient network and fragment failures, and saves the last yt-dlp failure log under `%TEMP%\LughFilm\downloads\last-download.log`
- Enforces a 4 GB limit for **Download to Review**; **Download MP4** can save larger files directly

Only download footage you own or have permission to use. Site compatibility depends on the installed `yt-dlp` version and the source website.

## Video editor

The editor opens as a dedicated studio inspired by the simple tool panels of 123apps and the media-and-timeline layout of Clipchamp. Open **Video Editor** and import an MP4 directly, or bring in your current Review video. **Your media**, **Text**, **Shapes**, **Trim & cut**, **Video**, and **Audio** each open one focused panel beside the preview. **Projects** opens your saved local projects; the back arrow returns to Review.

Choose a title, lower third, or caption in **Text**, then edit its words and appearance in the same panel. Selecting an overlay on the preview or timeline opens its matching controls. The **Canvas** selector above the preview changes the export aspect ratio; the preview uses the same crop, rotation, and text scaling as the exported frame. Advanced color, canvas, and speed settings expand individually in **Video**.

The timeline spans the workspace below the tools and preview. Select a video clip to open its position and source controls automatically. **Export MP4** opens the filename and range summary before rendering, and **?** opens the editor's keyboard shortcuts. At narrow widths, the controls move below the preview while the timeline remains visible.

Moving a clip beyond the end extends the timeline horizontally while keeping clip widths and the time scale unchanged. Hold a dragged clip near either edge to scroll. **Fit timeline** explicitly fits the complete project into view; the zoom controls change the scale without changing your edits.

Trim changes apply to playback immediately. Drag the green range handles above the video track, enter start/end times, or use **I** and **O** at the playhead. The shaded footage is outside the kept range; **Reset trim** restores the full timeline.

The Trim panel's **Selected clip** menu exposes timeline position and source in/out controls for every clip, including clips too narrow to grab easily. Sliding a clip into another clip snaps it to that clip's boundary and pushes following clips aside. Cut boundaries remain attached to their source footage, so extending a trim cannot bring a removed section back.

Use **Space** to play, arrow keys to step one frame, and **S** to split at the playhead. Drag a clip to move it or its edges to trim that clip. **Delete clip** closes the removed clip's gap, and **Undo / Redo** restores timeline edits. The ruler, playhead, video, overlays, and audio share one timeline; zoom and horizontal scrolling keep their positions aligned. Click **Export MP4** to open export settings and preview the result before downloading.

- Live trim preview with queued seeks during dragging
- Timeline zoom, frame stepping, split, clip movement, and undo/redo
- Project-specific timeline and trim persistence
- MP4 export from an independent decoder using the same timeline mapping as preview
- Clip start/end trimming
- Cut and remove selected portions
- Timeline visualization for kept, trimmed, and removed sections
- Drag clip ends directly on the timeline to adjust trim points
- Previous-frame and next-frame preview controls
- Playback speed and volume controls
- Rotate left/right and horizontal flip
- Brightness, contrast, and saturation adjustment
- Detach source audio into its own timeline track
- Independent detached-audio timing controls
- Rectangle, circle, arrow, and text/title overlays
- Editable shape color, opacity, fill opacity, blur, position, and dimensions
- Drag shapes around the preview and resize them from their edges
- Individual shape timeline tracks with draggable start/end handles
- Duplicate overlays and change their layer order
- Original, 16:9, 9:16, 1:1, and 4:3 export aspect ratios
- Video and audio fade-in/fade-out controls
- Full-width responsive editor that fits the browser viewport
- Delete selected overlays
- Export the edited result as MP4

## Administration and customization

- Local password-protected admin mode
- Permanently edit supported interface text on the current browser
- Save changes, restore defaults, change the admin password, or exit editing mode
- Video hotkeys are suppressed while editing text and form fields
- Blue esports-focused visual theme and responsive layout

Admin settings are local browser preferences, not server-side user authentication. Anyone with access to the local browser profile may be able to clear or replace its stored data.

## Privacy

LughFilm does not require an account and does not upload review projects to a LughFilm service. Videos, annotations, projects, and admin preferences stay in the local browser or local download folder unless you intentionally export or share them.

## Files

- `editor-core.js` and `editor-ui.css` — editor timeline, playback/export controller, and layout sources
- `sync-editor.ps1` — embeds the editor sources into `lughfilm.html` for the standalone app
- `editor-model.test.mjs` and `editor-browser-check.mjs` — timeline regression tests and local Chrome checks

- `lughfilm.html` — complete LughFilm interface and browser application
- `LughFilmServer.java` — local web server and `yt-dlp` bridge
- `start-lughfilm.bat` — source-mode Windows launcher
- `build-lughfilm-exe.ps1` — reproducible Windows package build script
- `dist/LughFilm-Setup.exe` — complete Windows installer, published as a GitHub Release asset

### Building the Windows package

Place the official Windows `yt-dlp.exe` and `deno.exe` binaries plus `ffmpeg.exe` in `vendor/`, then run `build-lughfilm-exe.ps1 -Version X.Y.Z` with a JDK that includes `jpackage`. The script downloads portable WiX 3.14 when needed. Increment the version for every published update. Keep yt-dlp and Deno updated for site compatibility.

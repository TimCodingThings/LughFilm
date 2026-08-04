# Framekey

Framekey is a private, on-device video review studio. Review gameplay frame by frame, annotate decisions, mark important moments, record coaching sessions, and make basic edits without uploading source footage to a third-party service.

[**Download the latest Framekey ZIP**](https://github.com/TimCodingThings/framekey/raw/main/dist/Framekey-Windows.zip)

## Quick start

1. Download the ZIP above and extract it.
2. Open the `Framekey` folder.
3. Double-click `Framekey.exe` and keep its small server window open.
4. Framekey opens at `http://127.0.0.1:8765` in your browser.
5. Drop in an MP4, open an existing local project, or use the Downloader tab.

If Windows SmartScreen appears for this unsigned community build, select **More info** and then **Run anyway**.

The Windows package includes its own Java runtime and `yt-dlp`. Recipients do not need VS Code, Java, FFmpeg, or a separate `yt-dlp` installation.

## Requirements

- Windows 10 or newer
- A modern version of Chrome or Edge

Developers running the source version through `start-framekey.bat` need Java 17 or newer. Opening `framekey.html` directly works for review and editing, but not link-based downloading.

## Review studio

- Drag-and-drop or file-picker MP4 loading
- Fully local playback with no source upload
- Play, pause, five-second seek, and remappable keyboard shortcuts
- Playback speeds from `0.1×` through `2×`
- Previous-frame and next-frame controls with estimated frame numbers
- Zoom, pan, zoom reset, mute, and pointer mode
- Fullscreen playback with a dedicated progress bar and timestamp markers
- Fullscreen annotation dock that can be shown or hidden
- Pen, arrow, and circle annotations in multiple colors
- Undo with the toolbar or `Ctrl+Z`, plus clear-all controls
- Gameplay timestamps and categorized markers displayed on the progress bar
- Marker categories for key plays, eliminations, deaths, objectives, team fights, rotations, utility, and mistakes
- Timestamped marker notes suitable for coaching review

## Coaching recording and export

- Record a complete review session with optional microphone commentary
- Independent microphone and gameplay-audio levels
- Select a microphone from inside Framekey
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
- Downloads one video at a time and targets MP4 output
- Automatically creates a new Framekey Review project when finished
- Keeps temporary download processing on the local computer
- Includes progress and error feedback
- Enforces a 4 GB maximum download size

Only download footage you own or have permission to use. Site compatibility depends on the installed `yt-dlp` version and the source website.

## Video editor

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
- Basic rectangle, circle, and arrow overlays
- Editable shape color, opacity, fill opacity, blur, position, and dimensions
- Drag shapes around the preview and resize them from their edges
- Individual shape timeline tracks with draggable start/end handles
- Delete selected shapes
- Export the edited result as MP4

## Administration and customization

- Local password-protected admin mode
- Permanently edit supported interface text on the current browser
- Save changes, restore defaults, change the admin password, or exit editing mode
- Video hotkeys are suppressed while editing text and form fields
- Blue esports-focused visual theme and responsive layout

Admin settings are local browser preferences, not server-side user authentication. Anyone with access to the local browser profile may be able to clear or replace its stored data.

## Privacy

Framekey does not require an account and does not upload review projects to a Framekey service. Videos, annotations, projects, and admin preferences stay in the local browser or local download folder unless you intentionally export or share them.

## Files

- `framekey.html` — complete Framekey interface and browser application
- `FramekeyServer.java` — local web server and `yt-dlp` bridge
- `start-framekey.bat` — source-mode Windows launcher
- `build-framekey-exe.ps1` — reproducible Windows package build script
- `dist/Framekey-Windows.zip` — ready-to-run public Windows package

## Updating

Download the latest Windows ZIP again whenever you want the newest version. Existing projects are stored in the browser profile associated with `http://127.0.0.1:8765`, so replacing the application files normally does not remove those projects.

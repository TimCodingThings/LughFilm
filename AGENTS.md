# LughFilm workflow

After every LughFilm implementation, editor, downloader, packaging, or installation change, perform a final synchronization audit before reporting completion. This requirement applies in every Codex session, including a new chat.

Use the checks that apply to the change:

- Run `sync-editor.ps1` after changes to `editor-core.js` or `editor-ui.css`, then verify each editor block is embedded exactly once in `lughfilm.html` and matches its source byte-for-byte.
- Preserve standalone additions such as the direct MP4 download handler when regenerating `lughfilm.html`.
- Run the relevant regression and export checks after synchronization.
- When build outputs are in scope, rebuild them and verify the source HTML matches the HTML in the app-image JAR and portable ZIP JAR.
- When the installed app is in scope, update its JAR, restart it through the Smart App Control-compatible launcher, verify the live page responds successfully, and confirm the installed content matches the source/build content.
- Do not claim that updates are synchronized unless the applicable comparisons and runtime checks were actually observed.

Preserve unrelated and pre-existing working-tree changes. Do not commit, push, publish, or install beyond the user-requested scope without authorization.

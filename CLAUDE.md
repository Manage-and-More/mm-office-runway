@AGENTS.md

## Claude Code specifics

- Before editing, work out which workstream the task belongs to (see the ownership table above) and confirm it with the user if it's unclear. Then stay inside that workstream's paths. If the change needs a contract edit or a file owned by someone else, stop and say so instead of editing it.
- Verify visually with the preview server (`.claude/launch.json` → `npm run dev`), using `?debug` and `?only=<module>`. Check the console for errors, and use the debug panel's lose/donate/crash buttons to test every mood.
- After changing `data/avatars/`, run `npm run avatars` so the page picks up the change.
- Run `npm run check` before committing.
- Never read, copy, describe or commit files in `tools/avatar-maker/photos/`. Derive avatars only from what the user tells you or shows you in the conversation.

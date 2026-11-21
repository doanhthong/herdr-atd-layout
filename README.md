# herdr-atd-layout

A Herdr layout (`atd`) based on the shipped `main` layout:

- **Space switcher** (`mods/atd-spaces`): the sidebar shows one button with the current space
  (avatar, name, branch, tab count, a badge counting other spaces that need you).
  Click it for a dropdown: type to filter, ↑/↓ + Enter to switch, worktree spaces nested under
  their repo, `+` on the highlighted row = new worktree from that space, right-click a space for its
  menu (rename, close, new/open/remove worktree…), plus New space / New worktree / Open worktree.
  Right-click the button for the current space's menu. Bind a key with `"mod.open:atd-spaces"`.
- **Agents** (`mods/atd-agents`): the shipped agents list (priority / grouped), each agent on two lines:
  1. project (space) · branch · machine · named tab, time, status
  2. title (the agent's own terminal title, else the tab's name)
- **Tab bar** (`mods/atd-tabs`): the shipped `tabs` mod (cloned from 0.1.16) with a **Sessions**
  button after Files and Changes.
- **Agent sessions** (`mods/agent-session`): a dialog listing past coding-agent sessions, newest
  first, with the transcript beside the list. Type to filter, ↑/↓ to pick, Enter (or Resume)
  reopens the session in a new tab in its folder. Also in the command palette as "Agent Sessions".
  Today it reads Claude Code sessions from `~/.claude`, every `~/.claude-*` folder and
  `$CLAUDE_CONFIG_DIR`. It runs `python3` and reads those transcripts; it keeps a cache in
  `~/.cache/herdr-agent-session/`. To add environment variables when resuming from a config
  folder, write `~/.config/herdr-app/agent-session.json`:

  ```json
  { "claude": { "env": { "~/.claude-work": { "ENABLE_CLAUDEAI_MCP_SERVERS": "false" } } } }
  ```

## Needs

- [`convo-reader`](https://github.com/doanhthong/herdr-atd-convo-readmode) for the docked Read
  Mode block (`readmode`, hidden by default). Without it, delete that block from the layout.
- `better-files` (optional) for the Files panel and `gitview` (optional) for the Changes panel.
  The tab bar hides the Files or Changes button when its mod isn't installed (and Sessions when
  `agent-session` isn't). To use Herdr's own panels instead, set the `files` block's content to
  `{ "mod": "files" }` and the `changes` block's to `{ "mod": "changes" }`.
- `python3` for `agent-session`.

## Install

```sh
git clone https://github.com/doanhthong/herdr-atd-layout ~/git-projects/herdr-atd-layout
ln -sfn ~/git-projects/herdr-atd-layout/layouts/atd.json ~/.config/herdr-app/layouts/atd.json
ln -sfn ~/git-projects/herdr-atd-layout/mods/atd-spaces ~/.config/herdr-app/mods/atd-spaces
ln -sfn ~/git-projects/herdr-atd-layout/mods/atd-agents ~/.config/herdr-app/mods/atd-agents
ln -sfn ~/git-projects/herdr-atd-layout/mods/atd-tabs ~/.config/herdr-app/mods/atd-tabs
ln -sfn ~/git-projects/herdr-atd-layout/mods/agent-session ~/.config/herdr-app/mods/agent-session
herdr-app do layout.switch --name atd
```

`ctrl-shift-l` cycles layouts back to `main`.

See [RECIPE.md](RECIPE.md) for the full brief. MIT licensed.

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

## Install

```sh
ln -sfn ~/git-projects/herdr-atd-layout/layouts/atd.json ~/.config/herdr-app/layouts/atd.json
ln -sfn ~/git-projects/herdr-atd-layout/mods/atd-spaces ~/.config/herdr-app/mods/atd-spaces
ln -sfn ~/git-projects/herdr-atd-layout/mods/atd-agents ~/.config/herdr-app/mods/atd-agents
herdr-app do layout.switch --name atd
```

`ctrl-shift-l` cycles layouts back to `main`.

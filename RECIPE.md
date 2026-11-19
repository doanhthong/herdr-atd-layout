# ATD (`atd`)

A Herdr layout built on the shipped `main` layout, with a compact sidebar: a single button for the current space that drops down every space, and an agents list where each agent takes two lines (where it runs, then what it's doing). The tab bar adds a **Sessions** button that opens a browser of past agent sessions, where you can read a transcript and resume the session in a new tab.

![ATD](preview.png)

## What you see

Left to right: a 300px sidebar, then the work column. No system title bar; macOS traffic lights sit at (12, 16).

- **Sidebar** (`chrome` background, 300px, not resizable by drag, min 44, max 480), top to bottom:
  - **Brand bar**, 46px: the shipped `workspace-chrome` (Herdr logo, search, sidebar toggle). Dragging it moves the window.
  - **Space button**, 52px (`atd-spaces`): a bordered button on `surface` with the current space's avatar (20px rounded square in the space's color, white initial), its name (13px semibold), and under it the machine (for a remote space), the branch (unless `main`/`master`) and `N tabs` (11px, `dim`). On the right a count badge when *other* spaces need you (blocked or done; tinted with the most urgent status color), then a chevron. A 28px **+** beside it starts a new space.
  - **Agents** (`atd-agents`), the rest of the height: a header "Agents" with a sort icon (Priority or Grouped by space). Each agent is two lines:
    1. the agent's icon, the space name (12.5px semibold, `dim`), then branch · machine · named tab (11px, `dim`), the time since its status last changed (`<1m`, `5m`, `2h`, `3d`), and its status.
    2. its title (12px): the agent's own terminal title, else the tab's name. Idle agents that aren't focused show it in `muted`.
    Status marks: working = spinner, blocked = a "Needs you" pill (a `!` square in priority view), done = a filled dot, idle = a ring. Sub-agents sit under their parent with tree lines.
  - **Footer**, 69px: the shipped `workspace-chrome` footer (Settings, Add machine).
- **Work column**:
  - **Tab bar**, 42px (`atd-tabs`): the shipped tab pills, **+**, **Files**, **Changes**, then **Sessions** (clock icon, 12px label, `muted`).
  - **Body**, 8px padding and gap: the tab's panes as cards (radius 10, `background`, 1px `border`, `accent` border when focused, a 30px `pane` header on top, framed even when alone). Beside them a hidden 520px **Read Mode** block (`convo-reader`, docked), and a hidden 368px right **panel** stacking **Files** (`files`) and **Changes** (`gitview`, standing in for `changes`).
  - **Status bar**, 28px: the shipped `workspace-status`.
- **Agent sessions** dialog (90% × 88% of the window, `popover` background):
  - **Left, 400px** (`chrome`): title "Agent sessions" and an **Esc** button; filter chips **All** plus one per config folder (`~/.claude`, `~/.claude-work`, …), each with its count; a search field with an `accent` border; the session list; a key hint line at the bottom.
  - Each session row: the title (13px semibold; the session's custom or generated title, else its first prompt) and how long ago (`just now`, `8m ago`, `3d ago`, then a date); the first prompt under it (12px, `muted`) when there's a title; then a small colored tag naming the config folder (`claude`, `claude-work`), the folder with `~` for home, `⎇ branch`, and `· N prompts`. The selected row has the `selected` background.
  - **Right**: the session title (16px semibold), **Hide tools** / **Show tools**, **Resume ↵** (a `solid` button); under them the tag, folder, age and the first 8 characters of the id. Then the transcript: your messages in `raised` cards labelled "You" (in `accent`) with the time, the agent's replies as markdown labelled with the agent's name, slash commands in `accent` monospace, tool calls as one monospace line each (`▸ Bash  description`, `✗` and the `blocked` color when they failed).

## How it behaves

- **Space button**: click opens a 360 × 580 popup under it. The field filters by name, branch and folder; ↑/↓ and Enter switch; hovering moves the highlight. Once a second machine is known (`machines()` or a space on it), spaces are grouped under a header per machine (This computer first): server/monitor icon, name, `loading`/`offline` when its layout isn't ready, a **+** for a new space there, a green dot when connected, and a chevron; click the header to fold it (remembered in `localStorage`). A machine with no spaces shows "New space there" (or "Not connected"). The filter also matches the machine name. Spaces in Herdr worktrees (`~/.herdr/worktrees/<repo>/<branch>`) are nested under their repo's space on the same machine with a branch icon. The highlighted row shows a **+** for "New worktree from this space". Below a divider: New space (on the current space's machine), New worktree from the current space, Open worktree. Right-click a space (or the button) for the shipped space menu. Esc closes.
- **Agents**: Priority view sorts by urgency (blocked > done > working > idle), then by the most recent status change, and groups under "Needs you", "Done", "Working", "Idle" headers. Grouped view groups by space. Pinned agents come first under "Pinned". Click a header to fold its group; a folded group shows its count and most urgent status. Click an agent to focus its pane; hover shows a pin button in place of the time. An agent you look at after it finished stays in Done until you leave it. A parent with sub-agents has a fold chevron; folded, it shows how many and the most urgent status. The list sets Herdr's agent order, so `agent.next`/`agent.prev` follow it. Under 160px wide the sidebar becomes a rail of numbers and status marks.
- **Sessions**: the button opens the dialog (`mod.open` `agent-session`). Sessions load in about a second the first time and a fraction of that afterwards. Typing filters on title, first prompt, folder, branch and id (every word must match). ↑/↓ and PageUp/PageDown pick; the transcript loads for the picked session. Tab / Shift-Tab cycle the source chips. Enter, double-click or **Resume** closes the dialog and opens a new tab named after the session, in its folder, running the agent's resume command. Esc closes. The list shows 300 rows at most ("N more: type to narrow the list"); transcripts show their last 160 parts with a **Show N earlier turns** button.
- **Read Mode** and **Changes** keep their own mods' behaviour (`cmd-alt-m` toggles the docked Read Mode in the convo-reader repo's keys).

## Built from

- `layouts/atd.json`: root `row` (`titlebar: none`, `traffic_lights: [12, 16]`, `background: canvas`, `terminal_padding: [14, 12]`) → `sidebar` column (`brand` 46, `sidebar-lists` column with `space-switch` 52 and `agents` weight 1 min 90, `sidebar-footer` 69) and `work` column (`tabs` 42, `work-body` row padding 8 gap 8 with `main-row` [`main` tab block, `readmode`] and `panel` → `panel-body` stack [`files`, `changes`], `status` 28).
- `mods/atd-spaces`: one mod, two roles. In the sidebar it's the button; opened as an overlay (`props().overlay` set) it's the dropdown. Uses `spaces()`, `panes()` (a space's place is its first terminal's `cwd`), `run("space.select" | "space.new")`, `openOverlay` for the shipped `menu` (`{tab: "space", target: {id}}`) and `worktree` (`{space, folder, action}`) mods. Avatar colors follow the shipped rule in shared `space.colors`.
- `mods/atd-agents`: a rewrite of the shipped `agents` list. `agents()`, `terminals()` (sub-agents by `parent`), `panes()`, `spaces()`, `focused().agent`, `setAgentOrder`, `run("pane.focus" | "terminal.peek" | "terminal.pin")`. Shared `agents.sort`; status-change times in `localStorage`. Its sort menu is itself opened as a popup (`props().sortMenu`).
- `mods/atd-tabs`: `mod.clone` of the shipped `tabs` (0.1.16) with one extra button running `mod.open {name: "agent-session"}`.
- `mods/agent-session`: `main.js` draws the dialog; `index.py` lists sessions and `show.py` reads one transcript, both run with `exec("python3", ["-I", …])`. Each agent is a provider in `index.py` (`PROVIDERS`) and a reader in `show.py` (`READERS`); the session JSON carries `resume`, the argv to reopen it, so `main.js` knows nothing agent-specific. Claude Code: transcripts are `<config>/projects/<folder>/<id>.jsonl` for `~/.claude`, every `~/.claude-*` and `$CLAUDE_CONFIG_DIR`; titles come from `custom-title`, then `ai-title`, then `summary` lines; resume is `claude --resume <id>`, behind `env CLAUDE_CONFIG_DIR=<dir>` for a non-default folder. Optional `<herdr-app home>/agent-session.json` adds env per folder: `{"claude": {"env": {"~/.claude-work": {"KEY": "value"}}}}`. Cache: `~/.cache/herdr-agent-session/index.json`, keyed by file size and mtime.
- Shipped mods used as-is: `workspace-chrome` (and its icons: `clock`, `search`, `spinner`, `chevron-*`, `plus`, `branch`, `pin`, `layers`, `check`), `pane`, `files`, `workspace-status`, `menu`, `worktree`.
- Mods from elsewhere: `convo-reader` ([herdr-atd-convo-readmode](https://github.com/doanhthong/herdr-atd-convo-readmode)) and `gitview` (optional; see Watch out).

## Watch out

- **`gitview` isn't shipped and isn't in this repo.** Without it, set the `changes` block's content to `{ "mod": "changes" }` to use Herdr's own Changes panel.
- **`convo-reader` comes from another repo.** Without it, delete the `readmode` block (it's hidden by default).
- `atd-tabs` is a clone: it won't get Herdr's later fixes to `tabs`. To refresh, clone `tabs` again and re-add the Sessions button (search for `open-agent-session`).
- `agent-session` runs `python3` and reads every Claude Code transcript under your home's `.claude*` folders. It writes only its cache. The transcript files can be large (hundreds of MB in total); `index.py` only JSON-parses title lines and user lines, and skips files whose size and mtime haven't changed.
- The list is read when the dialog opens; reopen it to see new sessions.
- A resumed session starts with `env …` in front of `claude` when it came from a non-default config folder, so the tab's program can show as `env` until Claude reports its status.
- Herdr's built-in command palette may not list the `palette` entry in `agent-session/mod.json`; the Sessions button and `mod.open:agent-session` always work.
- `atd-spaces` places its dropdown at a fixed spot (x 10, y 94 at zoom 1), under the brand bar and the button. Moving those blocks means changing that offset.
- In `herdr-app check`, `agent-session` returns before running Python (`checking()`), so a passing check doesn't exercise the indexer.

## Done when

- `herdr-app check` passes for `atd-spaces`, `atd-agents`, `atd-tabs` and `agent-session`, and `herdr-app status` shows no errors after `layout.switch {name: "atd"}`.
- The sidebar shows the current space's button; clicking it lists every space, typing filters, Enter switches.
- An agent that finishes while you look elsewhere shows under "Done" with a filled dot; one waiting on you shows "Needs you".
- The tab bar shows Files, Changes and Sessions; Sessions opens the dialog with one chip per Claude config folder that has sessions, and the counts add up to All.
- Picking a session shows its transcript; Hide tools removes the tool lines; Resume opens a new tab in the session's folder running `claude --resume <id>`.
- `python3 -I mods/agent-session/index.py` prints a JSON array, and a second run is noticeably faster (the cache is used).

// Agent sessions: past coding-agent sessions, newest first (today: Claude Code, from ~/.claude
// and every ~/.claude-* config folder). Type to filter, ↑/↓ to pick, the transcript shows on the
// right. Enter (or Resume) reopens the session in a new tab in its folder. Esc closes.
//
// The agent-specific parts are in Python: index.py lists the sessions and how to resume each
// (cached by mtime in ~/.cache/herdr-agent-session); show.py reads one transcript.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView, ScrollHandle } from "gpui-base";
import { checking, exec, appHome, home, theme, settings, props, closeOverlay, run, notify } from "herdr";

const DIR = () => `${appHome()}/mods/agent-session`;
const MAX_ROWS = 300; // rows drawn at once; filtering narrows the rest
const RECENT_PARTS = 160; // transcript parts drawn before "Show earlier"

function ago(sec) {
  const d = Date.now() / 1000 - sec;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`;
  return new Date(sec * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function oneLine(s, n = 140) {
  const l = (s ?? "").replace(/\s+/g, " ").trim();
  return l.length > n ? `${l.slice(0, n)}…` : l;
}

export default class AgentSessions extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.sessions = null; // null: loading
    this.error = null;
    this.source = "all";
    this.filter = "";
    this.at = 0;
    this.shownId = null;
    this.convo = null; // {id, state: "loading" | "ready" | "error", title, turns, text}
    this.showTools = true;
    this.showAll = false;
    this.listScroll = ScrollHandle.new();
    this.input = InputState.new({ placeholder: "Filter by title, prompt, folder or branch…" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.at = 0;
      this.listScroll.scroll_to_item(0);
      this.loadSelected(cx);
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.resume(this.rows()[this.at]));
    this.input.focus();
    if (checking()) { this.sessions = []; return; }
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", `${DIR()}/index.py`, appHome()], { timeout: 180000 });
        this.sessions = JSON.parse(r.stdout || "[]");
        if (!Array.isArray(this.sessions)) throw new Error(r.stderr.trim() || "no sessions");
      } catch (e) {
        this.sessions = [];
        this.error = String(e?.message ?? e);
      }
      this.loadSelected(cx);
      cx.notify();
    });
  }

  close() {
    try { this.listScroll.release(); } catch {}
  }

  exit() {
    closeOverlay(props().overlay);
  }

  rows() {
    if (!this.sessions) return [];
    const words = this.filter.toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (const s of this.sessions) {
      if (this.source !== "all" && s.source !== this.source) continue;
      if (words.length) {
        const hay = [s.title, s.prompt, s.cwd, s.branch, s.id].join(" ").toLowerCase();
        if (!words.every((w) => hay.includes(w))) continue;
      }
      out.push(s);
    }
    return out;
  }

  count(source) {
    return (this.sessions ?? []).filter((s) => source === "all" || s.source === source).length;
  }

  select(i, cx) {
    const rows = this.rows();
    if (!rows.length) return;
    this.at = Math.max(0, Math.min(i, Math.min(rows.length, MAX_ROWS) - 1));
    this.listScroll.scroll_to_item(this.at);
    this.loadSelected(cx);
    cx.notify();
  }

  loadSelected(cx) {
    const s = this.rows()[this.at];
    if (!s) { this.convo = null; return; }
    if (this.convo?.id === s.id) return;
    this.convo = { id: s.id, state: "loading" };
    this.showAll = false;
    cx.spawn(async (cx) => {
      let next;
      try {
        const r = await exec("python3", ["-I", `${DIR()}/show.py`, s.agent, s.path], { timeout: 60000 });
        const d = JSON.parse(r.stdout || "null");
        if (!d) throw new Error(r.stderr.trim() || "no output");
        next = d.error ? { id: s.id, state: "error", text: d.error } : { id: s.id, state: "ready", ...d };
      } catch (e) {
        next = { id: s.id, state: "error", text: String(e?.message ?? e) };
      }
      if (this.convo?.id !== s.id) return; // the selection moved on
      this.convo = next;
      cx.notify();
    });
  }

  resume(s) {
    if (!s) return;
    const argv = s.resume;
    const name = oneLine(s.title || s.prompt, 40) || s.agent_name;
    this.exit();
    const r = run("tab.new", { name, folder: s.cwd || home(), argv });
    if (r && r.error) notify({ title: "Couldn't resume the session", body: r.error, level: "error" });
  }

  sources() {
    return [...new Set((this.sessions ?? []).map((s) => s.source))].sort();
  }

  // Each source keeps one theme color, by its place in the list of sources.
  sourceTag(t, source) {
    const colors = [t.ansi3, t.ansi4, t.ansi5, t.ansi2, t.ansi6, t.ansi1];
    const i = Math.max(0, this.sources().indexOf(source));
    return div().flex_none().px(5).rounded(4).text_size(10.5)
      .bg(colors[i % colors.length]).text_color(t.background).opacity(0.85)
      .child(source.replace(/^~\/\.?/, ""));
  }

  renderList(t, rows) {
    const shown = rows.slice(0, MAX_ROWS);
    const sel = shown[this.at];
    return v_flex()
      .id("cs-list")
      .flex_1()
      .min_h(0)
      .overflow_y_scrollbar()
      .track_scroll(this.listScroll)
      .children([
        ...shown.map((s, i) => {
          const folder = (s.cwd ?? "").replace(home(), "~");
          return v_flex()
            .id(`cs-${s.source}-${s.id}`)
            .mx(6)
            .px(10)
            .py(7)
            .gap(3)
            .rounded(7)
            .cursor_pointer()
            .when(s === sel, (el) => el.bg(t.selected))
            .hover((el) => el.bg(t.hover))
            .on_click((e, cx) => {
              if (e.click_count === 2) return this.resume(s);
              this.select(i, cx);
            })
            .child(
              h_flex().gap(6).items_center()
                .child(div().flex_1().min_w(0).truncate().text_size(13).font_semibold().text_color(t.foreground)
                  .child(oneLine(s.title || s.prompt, 120) || "(no prompt)"))
                .child(div().flex_none().text_size(11).text_color(t.dim).child(ago(s.mtime))),
            )
            .when(!!s.title && !!s.prompt, (el) =>
              el.child(div().truncate().text_size(12).text_color(t.muted).child(oneLine(s.prompt))))
            .child(
              h_flex().gap(6).items_center().text_size(11).text_color(t.dim)
                .child(this.sourceTag(t, s.source))
                .child(div().min_w(0).truncate().child(folder + (s.branch && s.branch !== "HEAD" ? `  ⎇ ${s.branch}` : "")))
                .child(div().flex_none().child(`· ${s.prompts} prompt${s.prompts === 1 ? "" : "s"}`)),
            );
        }),
        rows.length > MAX_ROWS
          ? div().px(16).py(10).text_size(11.5).text_color(t.dim).child(`${rows.length - MAX_ROWS} more: type to narrow the list`)
          : null,
      ].filter(Boolean));
  }

  renderPart(t, p, key) {
    if (p.kind === "tool") {
      return h_flex().gap(8).items_start().text_size(12).text_color(p.error ? t.blocked : t.dim)
        .font_family(settings().font ?? "JetBrains Mono")
        .child(div().flex_none().child(p.error ? "✗" : "▸"))
        .child(div().flex_none().font_semibold().child(p.name))
        .child(div().min_w(0).truncate().child(p.text));
    }
    if (p.kind === "command") {
      return div().text_size(13).font_family(settings().font ?? "JetBrains Mono").text_color(t.accent).child(oneLine(p.text, 400));
    }
    if (p.kind === "note") {
      return div().text_size(12).text_color(t.dim).font_family(settings().font ?? "JetBrains Mono").child(oneLine(p.text, 600));
    }
    return TextView.markdown(key, p.text).selectable(true).w_full().text_size(14).text_color(t.foreground);
  }

  renderTranscript(t, s) {
    const c = this.convo;
    if (!s) return v_flex().flex_1().h_full().items_center().justify_center().text_color(t.dim).child(this.sessions ? "No session matches." : "");
    const folder = (s.cwd ?? "").replace(home(), "~");
    const header = v_flex().flex_none().px(22).pt(16).pb(12).gap(6).border_b(1).border_color(t.border)
      .child(
        h_flex().gap(10).items_center()
          .child(div().flex_1().min_w(0).truncate().text_size(16).font_semibold().text_color(t.foreground)
            .child(oneLine(c?.title || s.title || s.prompt, 160)))
          .child(div().id("cs-tools").px(8).py(3).rounded(6).text_size(12).cursor_pointer()
            .text_color(this.showTools ? t.foreground : t.dim).border_1().border_color(t.border)
            .hover((el) => el.bg(t.hover))
            .on_click((_e, cx) => { this.showTools = !this.showTools; cx.notify(); })
            .child(this.showTools ? "Hide tools" : "Show tools"))
          .child(div().id("cs-resume").px(10).py(3).rounded(6).text_size(12).font_semibold().cursor_pointer()
            .bg(t.solid).text_color(t.solid_foreground)
            .hover((el) => el.opacity(0.9))
            .on_click(() => this.resume(s))
            .child("Resume ↵")),
      )
      .child(
        h_flex().gap(8).items_center().text_size(11.5).text_color(t.dim)
          .child(this.sourceTag(t, s.source))
          .child(div().min_w(0).truncate().child(folder))
          .child(div().flex_none().child(`· ${ago(s.mtime)} · ${s.id.slice(0, 8)}`)),
      );

    let body;
    if (!c || c.state === "loading") {
      body = div().p(22).text_color(t.dim).child("Reading the transcript…");
    } else if (c.state === "error") {
      body = div().p(22).text_color(t.blocked).child(c.text);
    } else {
      const turns = c.turns
        .map((turn) => ({ ...turn, parts: turn.parts.filter((p) => this.showTools || p.kind !== "tool") }))
        .filter((turn) => turn.parts.length);
      // Long sessions: draw the most recent parts first.
      let budget = this.showAll ? Infinity : RECENT_PARTS;
      let from = turns.length;
      while (from > 0 && budget > 0) budget -= turns[--from].parts.length;
      const hidden = from;
      const els = turns.slice(from).map((turn, i) => {
        const user = turn.role === "user";
        const time = turn.time ? new Date(turn.time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
        return v_flex().gap(6).px(14).py(10).rounded(9)
          .when(user, (el) => el.bg(t.raised).border_1().border_color(t.border))
          .child(h_flex().gap(8).text_size(11).text_color(t.dim)
            .child(div().font_semibold().text_color(user ? t.accent : t.muted).child(user ? "You" : s.agent_name))
            .child(time))
          .children(turn.parts.map((p, j) => this.renderPart(t, p, `cs-p-${c.id}-${from + i}-${j}`)));
      });
      body = v_flex().gap(10).px(18).py(14)
        .when(hidden > 0, (el) => el.child(
          div().id("cs-earlier").px(10).py(6).rounded(6).text_size(12).text_color(t.muted).cursor_pointer()
            .hover((x) => x.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { this.showAll = true; cx.notify(); })
            .child(`Show ${hidden} earlier turn${hidden === 1 ? "" : "s"}`)))
        .children(els.length ? els : [div().text_color(t.dim).child("Nothing to show.")]);
    }
    return v_flex().flex_1().h_full().min_w(0).min_h(0)
      .child(header)
      .child(div().id(`cs-body-${s.id}`).flex_1().min_h(0).overflow_y_scrollbar().child(body));
  }

  render() {
    const t = theme();
    const rows = this.rows();
    if (this.at >= Math.min(rows.length, MAX_ROWS)) this.at = Math.max(0, Math.min(rows.length, MAX_ROWS) - 1);
    const sel = rows[this.at];

    const sources = ["all", ...this.sources()];
    const chips = h_flex().gap(4).flex_wrap().children(sources.map((src) =>
      div().id(`cs-src-${src}`).px(8).py(3).rounded(6).text_size(12).cursor_pointer()
        .when(this.source === src, (el) => el.bg(t.selected).text_color(t.foreground))
        .when(this.source !== src, (el) => el.text_color(t.muted))
        .hover((el) => el.bg(t.hover))
        .on_click((_e, cx) => { this.source = src; this.at = 0; this.listScroll.scroll_to_item(0); this.loadSelected(cx); this.input.focus(); cx.notify(); })
        .child(`${src === "all" ? "All" : src} ${this.sessions ? this.count(src) : ""}`)));

    const left = v_flex().w(400).h_full().flex_none().min_h(0).border_r(1).border_color(t.border).bg(t.chrome)
      .child(
        v_flex().flex_none().px(14).pt(16).pb(10).gap(10)
          .child(h_flex().items_center()
            .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Agent sessions"))
            .child(div().id("cs-esc").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
              .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => this.exit()).child("Esc")))
          .child(chips)
          .child(h_flex().h(34).flex_none().px(10).gap(8).items_center().rounded(8).border_1().border_color(t.accent).bg(t.background)
            .child(svg("mods/workspace-chrome/search.svg").size(14).text_color(t.dim))
            .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground))),
      )
      .child(
        this.sessions === null
          ? div().px(16).py(10).text_size(12.5).text_color(t.dim).child("Reading sessions… (the first time takes a few seconds)")
          : this.error
            ? div().px(16).py(10).text_size(12.5).text_color(t.blocked).child(this.error)
            : this.renderList(t, rows),
      )
      .child(div().flex_none().px(14).py(8).border_t(1).border_color(t.border).text_size(11).text_color(t.dim)
        .child("↑↓ pick · ↵ resume in a new tab · Tab switch source · Esc close"));

    return h_flex()
      .id("agent-session")
      .track_focus(this.handle)
      .size_full()
      .bg(t.popover)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.exit();
        if (k === "down") this.select(this.at + 1, cx);
        else if (k === "up") this.select(this.at - 1, cx);
        else if (k === "pagedown") this.select(this.at + 10, cx);
        else if (k === "pageup") this.select(this.at - 10, cx);
        else if (k === "tab") {
          const all = ["all", ...this.sources()];
          this.source = all[(all.indexOf(this.source) + (e.modifiers.shift ? all.length - 1 : 1)) % all.length];
          this.at = 0;
          this.listScroll.scroll_to_item(0);
          this.loadSelected(cx);
          cx.notify();
        } else return;
        cx.stop_propagation();
      })
      .child(left)
      .child(this.renderTranscript(t, sel));
  }
}

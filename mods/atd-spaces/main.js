// ATD space switcher. In the sidebar: one button showing the current space.
// Click it: a dropdown of every space (worktrees nested under their repo),
// type to filter, ↑/↓ + Enter to switch, right-click a space for its menu,
// and actions for a new space / new worktree / open worktree.
// The same mod draws both: as an overlay it's the dropdown.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, run, openOverlay, closeOverlay, props, theme, shared, setShared, settings } from "herdr";

const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const PALETTE = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const DROPDOWN = { width: 360, height: 580 };

// Same color rule as the shipped spaces/picker mods, so avatars agree everywhere.
function colors() {
  const sp = spaces();
  const ids = new Set(sp.map((p) => p.id));
  const all = shared("space.colors") ?? {};
  const kept = Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id)));
  let changed = Object.keys(kept).length !== Object.keys(all).length;
  for (const p of sp) {
    if (kept[p.id] || p.name === "~") continue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[p.id] = PALETTE.reduce((best, c) => (uses(c) < uses(best) ? c : best));
    changed = true;
  }
  if (changed) setShared("space.colors", kept);
  return kept;
}
function fill(t, s, kept) {
  if (s.name === "~") return t.dim;
  const c = kept[s.id] ?? PALETTE[0];
  return c.startsWith("#") ? c : (MARK[c] ?? t[c]);
}
const avatar = (t, s, kept, size = 20) =>
  h_flex().size(size).flex_none().rounded(5).bg(fill(t, s, kept)).items_center().justify_center()
    .text_size(size * 0.55).font_bold().text_color("#ffffff").child([...s.name][0]?.toUpperCase() ?? "?");

// Shown as an overlay (a click on the button, or `mod.open:atd-spaces` from a key) = the dropdown.
const isDropdown = () => Boolean(props()?.overlay);
const base = (p) => (p ?? "").replace(/\/+$/, "").split("/").pop();

// Where each space is now (its first terminal's folder), and whether it's a
// Herdr worktree (~/.herdr/worktrees/<repo>/<branch>) of another space's repo.
function ordered() {
  const sp = spaces();
  const ps = panes();
  const place = (s) => {
    const tabs = new Set(s.tabs.map((x) => x.id));
    return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder || "";
  };
  const rows = sp.map((s) => {
    const at = place(s);
    const m = at.match(/\/\.herdr\/worktrees\/([^/]+)\//);
    return { s, at, wtRepo: m ? m[1] : null, repo: base(at) };
  });
  const out = [];
  const used = new Set();
  for (const r of rows) {
    if (r.wtRepo && rows.some((o) => !o.wtRepo && o.repo === r.wtRepo)) continue;
    out.push({ ...r, tree: false });
    if (r.wtRepo) continue;
    for (const k of rows) if (k.wtRepo === r.repo && !used.has(k.s.id)) { used.add(k.s.id); out.push({ ...k, tree: true }); }
  }
  return out;
}

function glyph(t, st) {
  if (st === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
  if (st === "blocked") return div().flex_none().px(5).h(16).rounded(4).bg(t.blocked + "26").text_size(10).font_semibold().text_color(t.blocked).flex().items_center().child("needs you");
  if (st === "done") return div().size(7).mx(2).flex_none().rounded(4).bg(t.done);
  if (st === "idle") return div().size(7).mx(2).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
  return div().w(11).flex_none();
}

export default class AtdSpaces extends View {
  init(_props, cx) {
    if (!isDropdown()) return;
    this.filter = "";
    this.at = null;
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Switch space…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.at = 0; cx.notify(); });
    this.input.on("submit", () => this.go(this.items()[this.at ?? 0]));
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
  }

  // ---------- the sidebar button ----------
  open() {
    const z = settings().zoom ?? 1;
    // Under the button: brand bar (46) + this block (52), in logical px.
    openOverlay({ mod: "atd-spaces", kind: "popup", width: DROPDOWN.width, height: DROPDOWN.height, at: { x: 10 * z, y: 94 * z }, props: { dropdown: true } });
  }

  button(t) {
    const sp = spaces();
    const kept = colors();
    const cur = sp.find((s) => s.active);
    // Other spaces that want you: shown as a badge on the button.
    const others = sp.filter((s) => !s.active && (s.status === "blocked" || s.status === "done"));
    const worst = others.reduce((m, s) => ((RANK[s.status] ?? 0) > (RANK[m] ?? 0) ? s.status : m), null);
    const sub = [cur?.branch && !["main", "master"].includes(cur.branch) ? cur.branch : null, cur ? `${cur.tabs.length} tab${cur.tabs.length === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
    return h_flex().size_full().bg(t.chrome).px(8).py(6).gap(6).items_center()
      .child(h_flex().id("atd-space-button").flex_1().min_w(0).h_full().px(8).gap(9).items_center().rounded(8)
        .border_1().border_color(t.border).bg(t.surface).cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click(() => this.open())
        .on_mouse_down("right", () => cur && openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: cur.id } } }))
        .child(cur ? avatar(t, cur, kept) : div())
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().text_size(13).font_semibold().text_color(t.foreground).child(cur?.name ?? "No space"))
          .when(Boolean(sub), (el) => el.child(div().truncate().text_size(11).text_color(t.dim).child(sub))))
        .when(Boolean(worst), (el) => el.child(div().flex_none().px(5).h(16).rounded(8).bg((t[worst] ?? t.dim) + "33").text_size(10.5).font_bold().text_color(t[worst] ?? t.dim).flex().items_center().child(String(others.length))))
        .child(svg("mods/workspace-chrome/chevron-down.svg").size(12).flex_none().text_color(t.dim)))
      .child(div().id("atd-space-new").size(28).flex_none().flex().items_center().justify_center().rounded(7).text_color(t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("New space")
        .on_click(() => run("space.new")).child(svg("mods/workspace-chrome/plus.svg").size(14)));
  }

  // ---------- the dropdown ----------
  close() { closeOverlay(props().overlay); }

  items() {
    const f = this.filter.toLowerCase();
    const cur = spaces().find((s) => s.active);
    const list = ordered().filter((r) => !f || `${r.s.name} ${r.s.branch ?? ""} ${r.at}`.toLowerCase().includes(f));
    const acts = [
      { kind: "act", id: "new-space", icon: "plus", label: "New space", go: () => run("space.new") },
      ...(cur ? [
        { kind: "act", id: "new-wt", icon: "branch", label: `New worktree from ${cur.name}…`, go: () => this.worktree(cur, "new") },
        { kind: "act", id: "open-wt", icon: "branch", label: "Open worktree…", go: () => this.worktree(cur, "open") },
      ] : []),
    ].filter((a) => !f || a.label.toLowerCase().includes(f));
    return [...list.map((r) => ({ kind: "space", ...r })), ...acts];
  }

  worktree(s, action) {
    const tabs = new Set(s.tabs.map((x) => x.id));
    const folder = panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd ?? s.folder;
    openOverlay({ mod: "worktree", kind: "dialog", ...(action === "open" ? { width: 560, height: 480 } : { width: 460, height: 280 }), props: { space: s.id, folder, action } });
  }

  go(it) {
    if (!it) return;
    this.close();
    if (it.kind === "space") run("space.select", { id: it.s.id });
    else it.go();
  }

  dropdown(t) {
    const kept = colors();
    const items = this.items();
    if (this.at === null) this.at = Math.max(0, items.findIndex((i) => i.kind === "space" && i.s.active));
    this.at = Math.max(0, Math.min(this.at, items.length - 1));
    const firstAct = items.findIndex((i) => i.kind === "act");

    const spaceRow = (it, i) => {
      const s = it.s;
      const on = i === this.at;
      const tail = [s.branch && s.branch !== s.name && !["main", "master"].includes(s.branch) ? s.branch : null, s.machine].filter(Boolean).join(" · ");
      return h_flex().id(`dd-${s.id}`).mx(4).h(34).flex_none().px(8).gap(9).items_center().rounded(7).cursor_pointer()
        .when(on, (el) => el.bg(t.hover))
        .when(s.active, (el) => el.bg(t.selected))
        .hover((x) => x.bg(t.hover))
        .on_hover((h, cx) => { if (h && this.at !== i) { this.at = i; cx.notify(); } })
        .on_click(() => this.go(it))
        .on_mouse_down("right", () => { this.close(); openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } }); })
        .when(it.tree, (el) => el.pl(26).child(svg("mods/workspace-chrome/branch.svg").size(13).flex_none().text_color(t.dim)))
        .when(!it.tree, (el) => el.child(avatar(t, s, kept, 18)))
        .child(div().flex_shrink(0).max_w(150).truncate().text_color(t.foreground).when(s.active, (d) => d.font_semibold()).child(s.name))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(tail))
        .when(on && !s.machine, (el) => el.child(div().id(`dd-wt-${s.id}`).flex_none().p(3).rounded(4).text_color(t.dim)
          .hover((x) => x.bg(t.raised).text_color(t.foreground)).tooltip("New worktree from this space")
          .on_click((_e, cx) => { cx.stop_propagation(); this.close(); this.worktree(s, "new"); })
          .child(svg("mods/workspace-chrome/plus.svg").size(12))))
        .child(glyph(t, s.status));
    };
    const actRow = (it, i) => h_flex().id(`dd-${it.id}`).mx(4).h(32).flex_none().px(8).gap(9).items_center().rounded(7).cursor_pointer()
      .text_color(t.muted).when(i === this.at, (el) => el.bg(t.hover)).hover((x) => x.bg(t.hover).text_color(t.foreground))
      .on_hover((h, cx) => { if (h && this.at !== i) { this.at = i; cx.notify(); } })
      .on_click(() => this.go(it))
      .child(svg(`mods/workspace-chrome/${it.icon}.svg`).size(14).flex_none())
      .child(div().flex_1().truncate().child(it.label));

    const rows = [];
    let listH = 0;
    items.forEach((it) => { listH += it.kind === "space" ? 34 : 32; });
    if (firstAct > 0) listH += 11;
    listH = Math.min(listH, 440);
    items.forEach((it, i) => {
      if (i === firstAct) rows.push(div().mx(10).my(5).h(1).flex_none().bg(t.border));
      rows.push(it.kind === "space" ? spaceRow(it, i) : actRow(it, i));
    });

    return v_flex().id("atd-dropdown").track_focus(this.handle).w_full().bg(t.popover).text_size(13).py(6)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (k === "down") this.at = (this.at + 1) % items.length;
        else if (k === "up") this.at = (this.at + items.length - 1) % items.length;
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().mx(8).mb(6).h(32).flex_none().px(9).gap(8).items_center().rounded(8).border_1().border_color(t.input).bg(t.background)
        .child(svg("mods/workspace-chrome/search.svg").size(14).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)))
      .child(div().px(14).pb(3).text_size(11).text_color(t.dim).child(`Spaces · ${spaces().length}`))
      .child(v_flex().id("dd-list").h(listH).flex_none().overflow_y_scrollbar().children(rows))
      .child(div().px(14).pt(5).text_size(10.5).text_color(t.dim).child("↑↓ Enter · right-click a space for its menu"));
  }

  render() {
    const t = theme();
    return isDropdown() ? this.dropdown(t) : this.button(t);
  }
}

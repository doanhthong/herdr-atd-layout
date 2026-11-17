#!/usr/bin/env python3
"""Turn one agent transcript into JSON the agent-session mod draws.

    show.py <agent> <transcript>

Prints {"title", "turns": [{"role": "user" | "assistant", "time", "parts": [...]}]}, where a
part is {"kind": "text" | "command" | "note", "text"} or {"kind": "tool", "name", "text", "error"}.
READERS maps an agent (as index.py names it) to its transcript reader. Today: Claude Code,
whose parsing follows the convo-reader mod's extract.py.
"""
import json
import re
import sys

REMINDER = re.compile(r"<system-reminder>.*?</system-reminder>", re.S)
TAG = lambda name: re.compile(rf"<{name}>(.*?)</{name}>", re.S)
CMD_NAME, CMD_ARGS, CMD_OUT = TAG("command-name"), TAG("command-args"), TAG("local-command-stdout")
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
TEXT_CHARS = 20000


def clean_user_text(s):
    s = REMINDER.sub("", s)
    if "<local-command-caveat>" in s:
        return None
    m = CMD_NAME.search(s)
    if m:
        args = CMD_ARGS.search(s)
        a = args.group(1).strip() if args else ""
        return {"kind": "command", "text": f"{m.group(1).strip()} {a}".strip()}
    m = CMD_OUT.search(s)
    if m:
        out = ANSI.sub("", m.group(1)).strip()
        return {"kind": "note", "text": out[:2000]} if out else None
    if s.lstrip().startswith("<") and re.match(r"\s*<[a-z-]+>", s) and s.rstrip().endswith(">"):
        return None
    s = s.strip()
    return {"kind": "text", "text": s[:TEXT_CHARS]} if s else None


def tool_summary(inp):
    inp = inp or {}
    for key in ("description", "command", "file_path", "pattern", "query", "url", "prompt", "skill", "path"):
        v = inp.get(key)
        if isinstance(v, str) and v.strip():
            v = v.strip().splitlines()[0]
            return v[:160] + ("…" if len(v) > 160 else "")
    return ""


def read_claude(path):
    turns, tools, title, ai, seen = [], {}, None, None, set()

    def push(role, part, time):
        if turns and turns[-1]["role"] == role:
            turns[-1]["parts"].append(part)
        else:
            turns.append({"role": role, "time": time, "parts": [part]})

    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                d = json.loads(line)
            except Exception:
                continue
            t = d.get("type")
            if t == "custom-title":
                title = d.get("customTitle") or title
                continue
            if t in ("ai-title", "summary"):
                ai = d.get("aiTitle") or d.get("summary") or ai
                continue
            if t not in ("user", "assistant") or d.get("isSidechain") or d.get("isMeta"):
                continue
            uid = d.get("uuid")
            if uid in seen:
                continue
            seen.add(uid)
            time = d.get("timestamp")
            content = (d.get("message") or {}).get("content")
            if t == "user":
                if isinstance(content, str):
                    part = clean_user_text(content)
                    if part:
                        push("user", part, time)
                    continue
                for b in content or []:
                    bt = b.get("type")
                    if bt == "text":
                        part = clean_user_text(b.get("text", ""))
                        if part:
                            push("user", part, time)
                    elif bt == "image":
                        push("user", {"kind": "note", "text": "[image]"}, time)
                    elif bt == "tool_result" and b.get("is_error"):
                        tool = tools.get(b.get("tool_use_id"))
                        if tool is not None:
                            tool["error"] = True
            else:
                for b in content or []:
                    bt = b.get("type")
                    if bt == "text" and b.get("text", "").strip():
                        push("assistant", {"kind": "text", "text": b["text"].strip()[:TEXT_CHARS]}, time)
                    elif bt == "tool_use":
                        tool = {"kind": "tool", "name": b.get("name", "tool"), "text": tool_summary(b.get("input")), "error": False}
                        tools[b.get("id")] = tool
                        push("assistant", tool, time)
    return title or ai, turns


READERS = {"claude": read_claude}


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "usage: show.py <agent> <transcript>"}))
        return
    agent, path = sys.argv[1], sys.argv[2]
    reader = READERS.get(agent)
    if not reader:
        print(json.dumps({"error": f"No transcript reader for {agent} sessions yet."}))
        return
    try:
        title, turns = reader(path)
    except Exception as e:
        print(json.dumps({"error": f"Can't read {path}: {e}"}))
        return
    print(json.dumps({"title": title, "turns": turns}))


if __name__ == "__main__":
    main()

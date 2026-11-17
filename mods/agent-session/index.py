#!/usr/bin/env python3
"""List coding-agent sessions as JSON for the agent-session mod.

    index.py [herdr-app home]

Prints [{"agent", "agent_name", "source", "id", "path", "cwd", "branch", "title", "prompt",
"prompts", "mtime", "resume"}], newest first. `source` is where the session was found (a
config folder, shown as a filter); `resume` is the argv that reopens it in its `cwd`.

Each agent is a provider in PROVIDERS: a function that yields
(agent, agent_name, source, path, resume_argv_for(id)) for its transcripts, and a reader
that turns one transcript into metadata. Today: Claude Code.

Transcripts are read once and remembered by size and mtime in
~/.cache/herdr-agent-session/index.json, so later runs only read what changed.

Optional settings: <herdr-app home>/agent-session.json, for example
  {"claude": {"env": {"~/.claude-work": {"ENABLE_CLAUDEAI_MCP_SERVERS": "false"}}}}
adds those environment variables when resuming a session from that config folder.
"""
import glob
import json
import os
import re
import sys

HOME = os.path.expanduser("~")
CACHE = os.path.join(HOME, ".cache", "herdr-agent-session", "index.json")
VERSION = 1


def tilde(path):
    return "~" + path[len(HOME):] if path == HOME or path.startswith(HOME + os.sep) else path


# ---- Claude Code -------------------------------------------------------------------

REMINDER = re.compile(r"<system-reminder>.*?</system-reminder>", re.S)
CMD_NAME = re.compile(r"<command-name>(.*?)</command-name>", re.S)
CMD_ARGS = re.compile(r"<command-args>(.*?)</command-args>", re.S)
# Commands that set the session up rather than say what it's about.
SETUP_COMMANDS = {"/model", "/effort", "/config", "/permissions", "/fast", "/resume", "/login",
                  "/theme", "/output-style", "/add-dir", "/mcp"}


def claude_config_dirs():
    """~/.claude, every ~/.claude-* folder, and $CLAUDE_CONFIG_DIR: those with a projects folder."""
    found = [os.path.join(HOME, ".claude")] + sorted(glob.glob(os.path.join(HOME, ".claude-*")))
    if os.environ.get("CLAUDE_CONFIG_DIR"):
        found.append(os.path.expanduser(os.environ["CLAUDE_CONFIG_DIR"]))
    seen, out = set(), []
    for d in found:
        real = os.path.realpath(d)
        if real not in seen and os.path.isdir(os.path.join(d, "projects")):
            seen.add(real)
            out.append(d)
    return out


def claude_sessions(settings):
    default = os.path.realpath(os.path.join(HOME, ".claude"))
    extra_env = (settings.get("claude") or {}).get("env") or {}
    for d in claude_config_dirs():
        env = {**extra_env.get(tilde(d), {}), **extra_env.get(d, {})}
        if os.path.realpath(d) != default:
            env = {"CLAUDE_CONFIG_DIR": d, **env}
        prefix = ["env", *(f"{k}={v}" for k, v in env.items())] if env else []
        for path in glob.glob(os.path.join(d, "projects", "*", "*.jsonl")):
            yield ("claude", "Claude", tilde(d), path,
                   lambda sid, prefix=prefix: [*prefix, "claude", "--resume", sid])


def claude_prompt(content):
    """The words a person typed in a user message, or None for tool results and harness text."""
    if isinstance(content, list):
        texts = [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"]
        if not texts:
            return None
        content = "\n".join(texts)
    if not isinstance(content, str):
        return None
    s = REMINDER.sub("", content)
    if "<local-command-caveat>" in s or "<local-command-stdout>" in s:
        return None
    m = CMD_NAME.search(s)
    if m:
        a = CMD_ARGS.search(s)
        args = a.group(1).strip() if a else ""
        name = m.group(1).strip()
        return f"{name} {args}" if args and name not in SETUP_COMMANDS else None
    s = s.strip()
    if not s or (s.startswith("<") and s.endswith(">")):
        return None
    return s


def claude_meta(path):
    meta = {"cwd": None, "branch": None, "title": None, "prompt": None, "prompts": 0}
    ai = summary = None
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            head = line[:200]
            if '"custom-title"' in head or '"ai-title"' in head or '"type":"summary"' in head:
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                meta["title"] = d.get("customTitle") or meta["title"]
                ai = d.get("aiTitle") or ai
                summary = d.get("summary") or summary
                continue
            if '"type":"user"' not in line or '"isSidechain":true' in head:
                continue
            if '"tool_result"' in line[:600] and meta["cwd"]:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            if d.get("type") != "user" or d.get("isSidechain"):
                continue
            meta["cwd"] = meta["cwd"] or d.get("cwd")
            meta["branch"] = d.get("gitBranch") or meta["branch"]
            if d.get("isMeta"):
                continue
            p = claude_prompt((d.get("message") or {}).get("content"))
            if p:
                meta["prompts"] += 1
                meta["prompt"] = meta["prompt"] or p[:400]
    meta["title"] = meta["title"] or ai or summary
    return meta


# agent → (list sessions, read one transcript's metadata)
PROVIDERS = {"claude": (claude_sessions, claude_meta)}


# ---- index -----------------------------------------------------------------------------

def load_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {}


def main():
    app_home = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HOME, ".config", "herdr-app")
    settings = load_json(os.path.join(app_home, "agent-session.json"))
    cache = load_json(CACHE)
    old = cache.get("files", {}) if cache.get("version") == VERSION else {}
    files, out = {}, []
    for agent, (sessions, read_meta) in PROVIDERS.items():
        for agent, agent_name, source, path, resume in sessions(settings):
            try:
                st = os.stat(path)
            except OSError:
                continue
            key = f"{st.st_size}:{int(st.st_mtime)}"
            hit = old.get(path)
            if hit and hit.get("key") == key:
                meta = hit["meta"]
            else:
                try:
                    meta = read_meta(path)
                except Exception:
                    continue
            files[path] = {"key": key, "meta": meta}
            if not meta["prompts"]:
                continue
            sid = os.path.splitext(os.path.basename(path))[0]
            out.append({"agent": agent, "agent_name": agent_name, "source": source, "id": sid,
                        "path": path, "mtime": int(st.st_mtime), "resume": resume(sid), **meta})
    try:
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        tmp = CACHE + ".tmp"
        with open(tmp, "w") as f:
            json.dump({"version": VERSION, "files": files}, f)
        os.replace(tmp, CACHE)
    except Exception as e:
        print(f"cache not saved: {e}", file=sys.stderr)
    out.sort(key=lambda s: s["mtime"], reverse=True)
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()

"""Reading the map layout (.alpine-code/map/): per-file parsing with problems, newer-format fallback, assembly,
overview."""

from __future__ import annotations

import copy
import json
import types
import typing
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

from alpine_protocol import (
    FeatureFile,
    FlowEdge,
    FlowFile,
    FlowNode,
    MapFile,
    MapLook,
    MapProblem,
    NodeState,
    ProductFlow,
    ProductMap,
)

from alpine_core.tools._common import WRITE_CHECKS

from .map_io import MAP_DIR, atomic, guard, inside, lpath, read_bytes, sha
from .methods import MethodError

FORMAT = 1
MAP_FILE = f"{MAP_DIR}/map.json"
FEATURES = f"{MAP_DIR}/features"
FLOWS = f"{MAP_DIR}/flows"
STATE = f"{MAP_DIR}/state"
OVERVIEW = f"{MAP_DIR}/OVERVIEW.md"
OVERVIEW_DIR = f"{MAP_DIR}/overview"
SCHEMA_DIR = f"{MAP_DIR}/schema"
SCREENS = f"{MAP_DIR}/screens"
"""One planned screen per card, ``<card id>.html``, drawn with the theme tokens."""
LOOK_FILE = f"{MAP_DIR}/look.json"


@dataclass
class Layout:
    exists: bool = False
    read_only: bool = False
    map: MapFile = field(default_factory=MapFile)
    features: dict[str, FeatureFile] = field(default_factory=dict)
    """Cards by id, references already cleaned. An old card's area is read as a tag."""
    mtimes: dict[str, float] = field(default_factory=dict)
    """Modification time of each card's file."""
    flows: list[FlowFile] = field(default_factory=list)
    problems: list[MapProblem] = field(default_factory=list)
    files: dict[str, str] = field(default_factory=dict)
    """Project-relative path -> content hash of every agent-owned file."""
    screens: dict[str, str] = field(default_factory=dict)
    """Card id -> project-relative path of its planned screen, for cards that exist."""
    look: MapLook | None = None


# Parsed files: path -> (mtime_ns, size, lenient, digest, model or error text, what was left out to read it).
_parsed: dict[str, tuple[int, int, bool, str, Any, list[str]]] = {}

#: What the checks across a card's own fields mean, for the AI that wrote it.
_RULES = {
    "Duplicate condition id": "every condition (promise) of a card needs its own id",
    "Unknown or duplicate condition check": (
        "every check's conditionId must be the id of one of this card's own conditions, with at most one check per "
        "condition (replace the old check instead of adding a second)"
    ),
    "Duplicate state id": "every state (situation) of a card needs its own id",
    "A condition names a state the card does not have": "a condition's state must be the id of one of the card's states",
}


def _prune(annotation: Any, value: Any) -> Any:
    """The value without keys the model does not know (a newer Alpine may have added some)."""
    origin = typing.get_origin(annotation)
    args = typing.get_args(annotation)
    if origin in (typing.Union, types.UnionType):
        for arg in args:
            if arg is not type(None) and value is not None:
                return _prune(arg, value)
        return value
    if origin is list and isinstance(value, list):
        return [_prune(args[0], v) for v in value]
    if origin is dict and isinstance(value, dict):
        return {k: _prune(args[1], v) for k, v in value.items()}
    if isinstance(annotation, type) and issubclass(annotation, BaseModel) and isinstance(value, dict):
        known: dict[str, Any] = {}
        for name, info in annotation.model_fields.items():
            for key in (info.alias or name, name):
                if key in value:
                    known[key] = _prune(info.annotation, value[key])
                    break
        return known
    return value


def _read(path: Path) -> tuple[str, bytes | None]:
    try:
        return sha(read_bytes(path)), None
    except (OSError, ValueError) as exc:
        return "", str(exc).encode()


def _load(root: Path, relative: str, model: type[BaseModel], lenient: bool) -> tuple[str, Any, list[str]]:
    """(content hash, parsed model or error text, what was left out) for one file, cached by modification time and
    size. A card or a flow with a few wrong parts is read without them (``_salvage``): one wrong check does not take
    the card, and the flows it is in, off the map."""
    try:
        path = inside(root, relative)
        st = path.stat()
    except (OSError, ValueError, MethodError) as exc:
        return "", str(exc), []
    cached = _parsed.get(str(path))
    if cached and cached[:3] == (st.st_mtime_ns, st.st_size, lenient) and cached[4] is not None:
        return cached[3], cached[4], cached[5]
    digest, error = _read(path)
    if error is not None:
        return "", error.decode(), []
    left_out: list[str] = []
    try:
        data = json.loads(read_bytes(path).decode("utf-8"))
        if lenient and isinstance(data, dict):
            data = _prune(model, data)
            if model is MapFile:
                data["formatVersion"] = FORMAT
        result: Any = model.model_validate(data)
    except ValidationError as exc:
        result = _short(exc)
        if model in (FeatureFile, FlowFile) and isinstance(data, dict):
            salvaged, left_out = _salvage(model, data)
            if salvaged is not None:
                result = salvaged
            else:
                left_out = []
    except (OSError, ValueError) as exc:
        result = _short(exc)
    _parsed[str(path)] = (st.st_mtime_ns, st.st_size, lenient, digest, result, left_out)
    return digest, result, left_out


def _salvage(model: type[BaseModel], data: dict[str, Any]) -> tuple[BaseModel | None, list[str]]:
    """The file read without its wrong parts: a list item that fails is left out, an optional field that fails is
    left empty, and a card's checks, conditions and states that do not fit together are cut back to what does. What
    was left out is said; ``None`` when even that does not make it valid (no id or title, say)."""
    data = copy.deepcopy(data)
    left_out: list[str] = []
    for _ in range(100):
        try:
            return model.model_validate(data), left_out
        except ValidationError as exc:
            error = exc.errors()[0]
            loc = list(error["loc"])
            message = str(error["msg"]).removeprefix("Value error, ")
            left_out.append(f"{'.'.join(map(str, loc))}: {message}" if loc else message)
            if not loc:
                if model is FeatureFile and _fit_references(data):
                    continue
                return None, left_out
            if not _leave_out(data, loc):
                return None, left_out
    return None, left_out


def _leave_out(data: dict[str, Any], loc: list[Any]) -> bool:
    """Takes out what the error at ``loc`` is about: the innermost list item it is in, else the top-level field
    (never the id or the title, without which there is nothing to show)."""
    for at in range(len(loc) - 1, 0, -1):
        if isinstance(loc[at], int):
            container: Any = data
            for key in loc[:at]:
                if isinstance(container, dict) and key in container:
                    container = container[key]
                elif isinstance(container, list) and isinstance(key, int) and key < len(container):
                    container = container[key]
                else:
                    return False
            if isinstance(container, list) and loc[at] < len(container):
                del container[loc[at]]
                return True
            return False
    key = loc[0]
    if key in ("id", "title") or key not in data:
        return False
    del data[key]
    return True


def _fit_references(data: dict[str, Any]) -> bool:
    """A card's conditions, states and checks cut back to what fits together: the first condition and state of each
    id, a condition's state only when the card has it, and one check per condition, the last written, for conditions
    the card has. ``False`` when nothing changed."""
    before = json.dumps(data, sort_keys=True, default=str)

    def unique(items: Any) -> list[Any]:
        seen: set[Any] = set()
        kept = []
        for item in items if isinstance(items, list) else []:
            key = item.get("id") if isinstance(item, dict) else None
            if key not in seen:
                seen.add(key)
                kept.append(item)
        return kept

    data["conditions"] = unique(data.get("conditions"))
    data["states"] = unique(data.get("states"))
    states = {state.get("id") for state in data["states"] if isinstance(state, dict)}
    for condition in data["conditions"]:
        if isinstance(condition, dict) and condition.get("state") is not None and condition["state"] not in states:
            del condition["state"]
    ids = {condition.get("id") for condition in data["conditions"] if isinstance(condition, dict)}
    checks: dict[Any, Any] = {}
    loose = []
    for check in data.get("checks") or []:
        linked = check.get("conditionId") if isinstance(check, dict) else None
        if linked is None:
            loose.append(check)
        elif linked in ids:
            checks.pop(linked, None)
            checks[linked] = check
    data["checks"] = loose + list(checks.values())
    return json.dumps(data, sort_keys=True, default=str) != before


def _short(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        first = exc.errors()[0]
        where = ".".join(str(p) for p in first["loc"])
        return f"{where}: {first['msg']}" if where else str(first["msg"])
    return str(exc)


def _names(root: Path, relative: str, suffix: str = ".json") -> list[str]:
    folder = inside(root, relative)
    try:
        return sorted(p.name for p in folder.iterdir() if p.suffix == suffix and not p.name.startswith("."))
    except OSError:
        return []


def read_layout(root: Path) -> Layout:
    """Everything the agent wrote, parsed file by file. A file that fails becomes a problem and is skipped."""
    inside(root, MAP_DIR)  # a link out of the project is refused outright
    layout = Layout()
    map_path = inside(root, MAP_FILE)
    layout.exists = map_path.is_file() or inside(root, FEATURES).is_dir()
    if not layout.exists:
        return layout
    problems = layout.problems
    if map_path.is_file():
        try:
            raw = json.loads(read_bytes(map_path).decode("utf-8"))
            version = raw.get("formatVersion") if isinstance(raw, dict) else None
            layout.read_only = isinstance(version, int) and version > FORMAT
        except (OSError, ValueError):
            pass  # the strict parse below reports it
        digest, parsed, _ = _load(root, MAP_FILE, MapFile, layout.read_only)
        layout.files[MAP_FILE] = digest
        if isinstance(parsed, MapFile):
            layout.map = parsed
        else:
            problems.append(MapProblem(file=MAP_FILE, message=str(parsed)))
    lenient = layout.read_only
    cards: dict[str, FeatureFile] = {}
    # Cards whose file is there but could not be read: the flows they are in are not blamed for them again.
    broken: set[str] = set()
    for name in _names(root, FEATURES):
        relative = f"{FEATURES}/{name}"
        digest, parsed, left_out = _load(root, relative, FeatureFile, lenient)
        layout.files[relative] = digest
        if not isinstance(parsed, FeatureFile):
            broken.add(name.removesuffix(".json"))
            problems.append(MapProblem(file=relative, message=str(parsed)))
        elif parsed.id != name.removesuffix(".json"):
            broken.add(name.removesuffix(".json"))
            problems.append(MapProblem(file=relative, message=f"The file name must be the card id ({parsed.id})"))
        else:
            if left_out:
                problems.append(MapProblem(file=relative, message="; ".join(left_out), partial=True))
            cards[parsed.id] = parsed
            try:
                layout.mtimes[parsed.id] = inside(root, relative).stat().st_mtime
            except OSError:
                layout.mtimes[parsed.id] = 0.0
    flows: list[FlowFile] = []
    for name in _names(root, FLOWS):
        relative = f"{FLOWS}/{name}"
        digest, parsed, left_out = _load(root, relative, FlowFile, lenient)
        layout.files[relative] = digest
        if not isinstance(parsed, FlowFile):
            problems.append(MapProblem(file=relative, message=str(parsed)))
        elif parsed.id != name.removesuffix(".json"):
            problems.append(MapProblem(file=relative, message=f"The file name must be the flow id ({parsed.id})"))
        else:
            if left_out:
                problems.append(MapProblem(file=relative, message="; ".join(left_out), partial=True))
            flows.append(parsed)
    # Maps made before tags grouped cards into areas listed in map.json: the area's title becomes a tag.
    titles = {a.get("id"): a.get("title") for a in layout.map.areas if isinstance(a, dict)}
    for card in list(cards.values()):
        if card.area:
            tag = str(titles.get(card.area) or card.area)[:40]
            tags = card.tags if tag in card.tags else [*card.tags, tag][:50]
            cards[card.id] = card.model_copy(update={"area": None, "tags": tags})
    layout.features = cards
    for name in _names(root, SCREENS, ".html"):
        relative = f"{SCREENS}/{name}"
        card_id = name.removesuffix(".html")
        digest, error = _read(inside(root, relative))
        layout.files[relative] = digest
        if error is not None:
            problems.append(MapProblem(file=relative, message=error.decode()))
        elif card_id in cards:
            layout.screens[card_id] = relative
    if inside(root, LOOK_FILE).is_file():
        digest, parsed, _ = _load(root, LOOK_FILE, MapLook, lenient)
        layout.files[LOOK_FILE] = digest
        if isinstance(parsed, MapLook):
            layout.look = parsed
        else:
            problems.append(MapProblem(file=LOOK_FILE, message=str(parsed)))
    flow_ids = {f.id for f in flows}
    layout.flows = [_clean_flow(f, cards, flow_ids, problems, broken) for f in flows]
    return layout


#: A step of a flow that calls another flow (decision 19): ``flow:<flow id>`` in ``nodeIds`` and in edges.
CALL = "flow:"


def _clean_flow(
    flow: FlowFile,
    cards: dict[str, FeatureFile],
    flow_ids: set[str],
    problems: list[MapProblem],
    broken: frozenset[str] | set[str] = frozenset(),
) -> FlowFile:
    """The flow with only the steps and transitions that exist. Each step or transition left out is a problem of the
    flow, except one about a card whose own file could not be read: that is said once, on the card's file."""
    file = f"{FLOWS}/{flow.id}.json"
    node_ids: list[str] = []
    for node_id in flow.node_ids:
        called = node_id.removeprefix(CALL) if node_id.startswith(CALL) else None
        if called is not None and called == flow.id:
            problems.append(MapProblem(file=file, message="A flow cannot call itself"))
        elif called is not None and called not in flow_ids:
            problems.append(MapProblem(file=file, message=f"The flow '{called}' does not exist"))
        elif called is None and node_id not in cards:
            if node_id not in broken:
                problems.append(MapProblem(file=file, message=f"The card '{node_id}' does not exist"))
        elif node_id not in node_ids:
            node_ids.append(node_id)
    edges: list[FlowEdge] = []
    for edge in flow.edges:
        if edge.source in node_ids and edge.target in node_ids:
            edges.append(edge)
        elif edge.source in broken or edge.target in broken:
            continue
        else:
            problems.append(
                MapProblem(file=file, message=f"The edge {edge.source} -> {edge.target} points outside this flow")
            )
    return flow.model_copy(update={"node_ids": node_ids, "edges": edges})


def assemble(layout: Layout, cards: dict[str, dict]) -> ProductMap:
    """The map the app shows: agent files plus the user's decisions and session links from Alpine's state."""
    nodes: list[FlowNode] = []
    for card_id in sorted(layout.features):
        card = layout.features[card_id]
        state = cards.get(card_id) or {}
        plan = state.get("plan") or {}
        update: dict[str, Any] = {
            "priority": plan.get("priority"),
            "scope": plan.get("scope"),
            "decision": plan.get("decision") or "",
            "session_id": state.get("sessionId"),
        }
        nodes.append(FlowNode.model_construct(**{**card.__dict__, **update}))
    edges: dict[tuple[str, str], FlowEdge] = {}
    for flow in layout.flows:
        for edge in flow.edges:
            edges.setdefault((edge.source, edge.target), edge)
    flows = [ProductFlow.model_construct(**{k: getattr(f, k) for k in ProductFlow.model_fields}) for f in layout.flows]
    return ProductMap(flows=flows, nodes=nodes, edges=list(edges.values()))


def render_overview(
    document: ProductMap, states: dict[str, NodeState], problems: list, unmapped: list | None = None
) -> dict[str, str]:
    """OVERVIEW.md for agents that read top down: the flows, then every card with its tags and status. Paths are
    relative to the project."""

    def card_line(node: FlowNode) -> str:
        state = states.get(node.id)
        status = f"{state.status}, {state.passed}/{state.total} promises" if state else "none"
        if state and state.unread:
            status += f", {len(state.unread)} sources never opened by its writers"
        mine = [cid for cid, p in state.promises.items() if p.origin == "confirmed"] if state else []
        if mine:
            status += f", written or confirmed by the user: {', '.join(mine)}"
        tags = f" [{', '.join(node.tags)}]" if node.tags else ""
        return f"- `{node.id}` {node.title}{tags}: {node.phase}, {status} (features/{node.id}.json)"

    head = (
        "Generated by Alpine from the files in `.alpine-code/map/`. Read only: edit the card and flow files instead.\n"
    )
    lines = ["# Product map overview", "", head, f"{len(document.nodes)} cards, {len(document.flows)} flows.\n"]
    lines.append("## Flows")
    for flow in document.flows:
        line = f"- `{flow.id}` {flow.title}"
        lines.append(line + (f": {flow.description}" if flow.description else ""))
        lines.append(f"  cards: {', '.join(flow.node_ids) or 'none'} (flows/{flow.id}.json)")
    if not document.flows:
        lines.append("- none yet")
    lines += ["", "## Cards"]
    ordered = sorted(document.nodes, key=lambda n: (not n.tags, n.tags[0] if n.tags else "", n.id))
    lines += [card_line(n) for n in ordered] or ["- none yet"]
    if unmapped:
        lines += ["", "## Not mapped yet (map.json `unmapped`)"]
        for part in unmapped:
            where = f" ({', '.join(part.paths)})" if part.paths else ""
            lines.append(f"- {part.title}{where}" + (f": {part.why}" if part.why else ""))
    if problems:
        lines += ["", "## Files Alpine could not read"]
        lines += [f"- {p.file}: {p.message}" for p in problems]
    return {OVERVIEW: "\n".join(lines) + "\n"}


def write_overview(root: Path, files: dict[str, str]) -> None:
    """Writes only what differs and removes area files that no longer belong. Never through a link."""
    for relative, text in files.items():
        path = lpath(root, relative)
        guard(path)
        try:
            if path.read_text(encoding="utf-8") == text:
                continue
        except OSError:
            pass
        atomic(path, text)
    folder = lpath(root, OVERVIEW_DIR)
    guard(folder)
    wanted = {Path(r).name for r in files if r.startswith(OVERVIEW_DIR)}
    if folder.is_dir():
        for stale in folder.glob("*.md"):
            if stale.name not in wanted and not stale.is_symlink():
                stale.unlink(missing_ok=True)
    ignore = lpath(root, f"{MAP_DIR}/.gitignore")
    if not ignore.exists():
        atomic(ignore, "OVERVIEW.md\noverview/\n")


#: The map files an AI writes, and how each is checked when it does.
_WRITTEN = ((FEATURES, FeatureFile, "card"), (FLOWS, FlowFile, "flow"))


def _errors(exc: ValidationError) -> str:
    """Every error of a check, up to a few, with what a check across fields means."""
    said = []
    for error in exc.errors()[:6]:
        where = ".".join(str(part) for part in error["loc"])
        message = str(error["msg"]).removeprefix("Value error, ")
        rule = _RULES.get(message)
        said.append(f"{where + ': ' if where else ''}{message}{f' ({rule})' if rule else ''}")
    return "; ".join(said)


def check_write(root: Path, file: Path, text: str) -> tuple[bool, str] | None:
    """What Alpine says when a file tool writes a map file (``WRITE_CHECKS``): a card or flow it could not read is
    refused, with every reason, so the AI fixes it at once instead of leaving the map unreadable; what it keeps but
    cannot place yet (a flow's step whose card is not written yet) is said with the result. Alpine's own files
    (state, the overview) are never written by the AI."""
    try:
        relative = file.resolve().relative_to(root.resolve()).as_posix()
    except (OSError, ValueError):
        return None
    if not relative.startswith(MAP_DIR + "/"):
        return None
    if relative.startswith((STATE + "/", OVERVIEW_DIR + "/")) or relative == OVERVIEW:
        return True, f"Alpine did not write {relative}: Alpine keeps it itself. Write cards and flows instead."
    found = next(((folder, model, kind) for folder, model, kind in _WRITTEN if relative.startswith(folder + "/")), None)
    model: type[BaseModel] | None = found[1] if found else MapFile if relative == MAP_FILE else None
    if model is None and relative == LOOK_FILE:
        model = MapLook
    if model is None or not relative.endswith(".json"):
        return None
    try:
        data = json.loads(text)
    except ValueError as exc:
        return True, f"Alpine did not write {relative}: it is not valid JSON ({exc}). Fix it and write it again."
    if isinstance(data, dict) and model is MapFile and isinstance(data.get("formatVersion"), int):
        if data["formatVersion"] > FORMAT:
            return None  # a newer Alpine's map: this one only reads it
    try:
        parsed = model.model_validate(data)
    except ValidationError as exc:
        return True, (
            f"Alpine did not write {relative}, since the map could not show it: {_errors(exc)}. "
            "Fix these and write the whole file again."
        )
    if found is None:
        return None
    name = relative.rsplit("/", 1)[1].removesuffix(".json")
    if getattr(parsed, "id", name) != name:
        return True, f"Alpine did not write {relative}: the file name must be the {found[2]} id ({parsed.id})."
    if isinstance(parsed, FlowFile):
        cards = set(_names(root, FEATURES))
        missing = [n for n in parsed.node_ids if not n.startswith(CALL) and f"{n}.json" not in cards]
        if missing:
            listed = ", ".join(f"'{n}'" for n in missing[:10])
            return False, f"Alpine notes: no card file yet for {listed}; those steps show once their cards exist."
    return None


if check_write not in WRITE_CHECKS:
    WRITE_CHECKS.append(check_write)

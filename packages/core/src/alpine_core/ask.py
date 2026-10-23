"""``ask_user``: the agent asks the person one product question with options, its own pick first.

It does not wait for the answer. The agent ends its turn after asking; the person's pick (or their own words) comes
back as their next message, so a question costs nothing while no one is there to answer it. The app draws the call as
a card (in a chat) or as the question above the map's input (on a map), from the call's arguments.

An option may carry a page (HTML drawn with Tailwind and the theme tokens, see ``Look``) to show what it would be
like, and a look (the values of those tokens) when the question is how the product should look.
"""

from __future__ import annotations

from dataclasses import dataclass

from alpineagents import ToolError, tool
from alpineagents.tool import collect_tools

from .tool_sources import Offered

__all__ = ["ASK_USER", "Asking", "Look", "Option", "ask_user"]

ASK_USER = "ask_user"


@dataclass(frozen=True)
class Look:
    """The values behind the theme tokens a page draws with, so one look restyles every page at once."""

    page: str
    """Page background colour, as CSS (``#ffffff``)."""
    surface: str
    """Background of cards and inputs."""
    ink: str
    """Main text colour."""
    muted: str
    """Secondary text colour."""
    line: str
    """Border colour."""
    accent: str
    """Buttons, links, highlights."""
    on_accent: str
    """Text on the accent colour."""
    display: str
    """Font family for titles, as CSS (``'Noto Serif KR', serif``)."""
    body: str
    """Font family for text."""
    radius: str
    """Corner radius of cards and buttons, as CSS (``12px``)."""


@dataclass(frozen=True)
class Option:
    label: str
    """What the person picks, in a few plain words."""
    detail: str = ""
    """Why someone might pick it, in one short sentence."""
    html: str = ""
    """A page showing what this option would be like (see the tool's description)."""
    look: Look | None = None
    """Only when the question is how the product should look."""


DESCRIPTION = """Ask the person one product question and let them pick an answer.

Ask only what they must decide: what the product does, for whom, how it looks or feels. Never ask technical choices
(data, APIs, libraries, structure): decide those yourself and say so. Never ask what you can find out yourself.

Put your own pick first; the app marks it as your recommendation. Give 2 to 4 options, each a real choice. The person
may also answer in their own words.

After calling it, end your turn without repeating the question: the app shows it, and the person's answer comes back
as their next message.

An option's html is a page that shows what picking it would be like. Draw it with Tailwind classes (Tailwind 4 is
loaded, no other script or stylesheet), at a phone's width unless the product is a desktop site. Use these colour and
shape tokens instead of fixed colours, so a look restyles every page at once: bg-page, bg-surface, text-ink,
text-muted, border-line, bg-accent, text-accent, text-on-accent, font-display, font-body, rounded-card. Use real
content in the person's language, never lorem ipsum.

A look gives those tokens their values. Use it when the question is how the product should look; name each option
after a site it takes after ("Medium 참고")."""


@tool(name=ASK_USER, description=DESCRIPTION, read_only=True, open_world=False)
def ask_user(question: str, options: list[Option], about: str | None = None) -> str:
    """
    Args:
        question: The question in the person's words and language, one sentence
        options: Your pick first
        about: The map card the answer changes, when asking about one card of the product map
    """
    if not question.strip():
        raise ToolError("Write the question.")
    labels = [o.label.strip() for o in options]
    if not 2 <= len(labels) <= 4:
        raise ToolError("Give 2 to 4 options.")
    if not all(labels) or len(set(labels)) != len(labels):
        raise ToolError("Every option needs its own label.")
    return "Asked. End your turn now; the person's answer comes back as their next message."


class Asking:
    """A tool source: ``ask_user``, in every session whatever its agent."""

    def offered(self) -> list[Offered]:
        return [Offered(t, "builtin", optional=False) for t in collect_tools([ask_user]).values()]

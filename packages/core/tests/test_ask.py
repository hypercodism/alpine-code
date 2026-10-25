import pytest
from alpineagents import State, ToolError

from alpine_core import ASK_USER, AgentConfig, Asking, Builtins, Workspace, gather, pick

LOOK = {
    "page": "#fff",
    "surface": "#f5f5f5",
    "ink": "#171717",
    "muted": "#737373",
    "line": "#e5e5e5",
    "accent": "#171717",
    "on_accent": "#fff",
    "display": "serif",
    "body": "sans-serif",
    "radius": "10px",
}


def ask(args):
    [offered] = Asking().offered()
    return offered.tool.invoke(offered.tool.prepare(args), State())


def test_asking_does_not_wait_for_the_answer():
    result = ask(
        {
            "question": "누가 글을 쓰나요?",
            "options": [{"label": "나만"}, {"label": "여러 사람", "detail": "글쓴이를 초대해요"}],
        }
    )
    assert "End your turn" in result


def test_an_option_may_carry_a_page_and_a_look():
    page = '<main class="bg-page text-ink">글</main>'
    result = ask(
        {
            "question": "어떤 느낌으로 만들까요?",
            "options": [{"label": "Medium 참고", "html": page, "look": LOOK}, {"label": "Notion 참고", "look": LOOK}],
            "about": "read-post",
        }
    )
    assert result.startswith("Asked")


@pytest.mark.parametrize(
    ("args", "error"),
    [
        ({"question": " ", "options": [{"label": "a"}, {"label": "b"}]}, "question"),
        ({"question": "q", "options": [{"label": "a"}]}, "2 to 4"),
        ({"question": "q", "options": [{"label": "a"}, {"label": "a "}]}, "own label"),
    ],
)
def test_a_question_needs_real_options(args, error):
    with pytest.raises(ToolError, match=error):
        ask(args)


def test_no_agent_can_turn_asking_off(tmp_path):
    offered = gather([Builtins(Workspace(tmp_path)), Asking()])
    reading_only = AgentConfig(id="reader", name="reader", tools=("read",))
    assert ASK_USER in [t.name for t in pick(offered, reading_only.tools)]

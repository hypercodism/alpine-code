"""``projects/judge``: is what was sent on the new-session screen work on the project, or a new app?

One question to the default model, with no tools (see ``alpine_core.judge``). Only the templates this machine has are
offered. The app treats any error here as "work on the project", which starts the session and shows the real problem.

When the person chose 새로 만들기 (``new_project``) the answer is a new app (a change only when nothing is written),
and the project the screen is on (``cwd``) is not looked at. The templates are fetched first when it is time
(``ensure_templates``), so one that cannot be had is said here, before any setup is shown: ``no_git_tools``,
``unreachable`` or ``not_found``. Without Alpine Cloud the model still picks, from the templates that need no cloud.
"""

from __future__ import annotations

from pathlib import Path

from alpine_core import ConfigError, JudgeError, NewApp, available_templates, judge
from alpine_core.cloud import settings as cloud_settings
from alpine_core.templates import TemplatesUnavailable, ensure_templates
from alpine_protocol import JudgedChange, JudgedNew, ProjectsJudgeParams, ProjectsJudgeResult

from .methods import APP_ERROR, MethodError, _settings

#: Templates only Alpine Cloud can run: a realtime web app lives on its database.
CLOUD_ONLY = ("web-pro",)


def judge_project(params: ProjectsJudgeParams) -> ProjectsJudgeResult:
    if params.new_project:
        try:
            templates = ensure_templates()
        except TemplatesUnavailable as e:
            raise MethodError(APP_ERROR, str(e), e.reason) from e
        if not cloud_settings.enabled():
            templates = [template for template in templates if template not in CLOUD_ONLY]
    else:
        templates = available_templates() if cloud_settings.enabled() else []  # no cloud: nothing to make
    if not templates or not params.text.strip():  # nothing to make, or nothing written: nothing to ask
        return ProjectsJudgeResult(judgement=JudgedChange())
    settings = _settings()
    project = Path(params.cwd).expanduser() if params.cwd and not params.new_project else None
    if project is not None and not project.is_dir():
        project = None
    try:
        judgement = judge(settings, params.text, params.locale, templates, project, new_project=params.new_project)
    except ConfigError as e:
        raise MethodError(APP_ERROR, str(e), "invalid_config") from e
    except JudgeError as e:
        raise MethodError(APP_ERROR, str(e), "model_failed") from e
    if isinstance(judgement, NewApp):
        return ProjectsJudgeResult(
            judgement=JudgedNew(template=judgement.template, reason=judgement.reason, name=judgement.name)
        )
    return ProjectsJudgeResult(judgement=JudgedChange())


HANDLERS = {"projects/judge": judge_project}

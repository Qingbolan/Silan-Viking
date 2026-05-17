"""Skill command - skill

Install the bundled Claude Code skill so AI assistants can help manage
and update the personal website.
"""

from typing import Optional

from ..logic.skill_logic import SkillLogic
from ..utils import ModernLogger


def execute_skill_command(action: str = 'install',
                          name: Optional[str] = None,
                          project: bool = False,
                          force: bool = False,
                          logger: Optional[ModernLogger] = None) -> bool:
    """Execute the skill command - thin wrapper around logic.

    Actions:
        install   - copy bundled skill(s) into the Claude Code skills dir
        uninstall - remove an installed skill
        status    - show bundled skills and install state
        list      - alias for status
    """
    skill_logic = SkillLogic()

    if action in ('status', 'list'):
        return skill_logic.show_status()
    if action == 'uninstall':
        if not name:
            skill_logic.error("Specify a skill name to uninstall: --name <skill>")
            return False
        return skill_logic.uninstall(name, project_level=project)
    # default: install
    return skill_logic.install(skill_name=name, project_level=project, force=force)

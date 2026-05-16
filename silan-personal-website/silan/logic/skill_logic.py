"""Skill installation business logic.

Installs the bundled Claude Code skill (``silan-blog``) into the user's
Claude Code skills directory so AI assistants can help manage and update
the personal website.
"""

import os
import shutil
from pathlib import Path
from typing import List, Optional

from ..utils import ModernLogger

# Skills shipped inside the package: <package>/skills/<skill-name>/
_PACKAGE_SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"


class SkillLogic(ModernLogger):
    """Handle installation of bundled Claude Code skills."""

    def __init__(self):
        super().__init__(name="skill_logic", level="info")

    # -- paths ---------------------------------------------------------------

    def get_skills_target_dir(self, project_level: bool = False) -> Path:
        """Return the Claude Code skills directory to install into.

        - User level (default): ``~/.claude/skills`` — available everywhere.
        - Project level: ``<cwd>/.claude/skills`` — shared via the repo.
        """
        if project_level:
            return Path.cwd() / ".claude" / "skills"
        return Path.home() / ".claude" / "skills"

    def list_bundled_skills(self) -> List[str]:
        """List skill names bundled inside the package."""
        if not _PACKAGE_SKILLS_DIR.is_dir():
            return []
        return sorted(
            p.name for p in _PACKAGE_SKILLS_DIR.iterdir()
            if p.is_dir() and (p / "SKILL.md").is_file()
        )

    # -- actions -------------------------------------------------------------

    def install(self, skill_name: Optional[str] = None,
                project_level: bool = False, force: bool = False) -> bool:
        """Install one or all bundled skills into the Claude Code skills dir."""
        bundled = self.list_bundled_skills()
        if not bundled:
            self.error("No skills are bundled with this package.")
            return False

        if skill_name and skill_name not in bundled:
            self.error(f"Unknown skill: {skill_name}")
            self.info(f"Available skills: {', '.join(bundled)}")
            return False

        targets = [skill_name] if skill_name else bundled
        target_root = self.get_skills_target_dir(project_level)

        scope = "project (.claude/skills)" if project_level else "user (~/.claude/skills)"
        self.stage(f"Installing skill(s) into {scope}")

        ok = True
        for name in targets:
            if not self._install_one(name, target_root, force):
                ok = False

        if ok:
            self.success("Skill installation complete.")
            self.info(
                "Restart Claude Code (or run /skills) so the new skill is picked up."
            )
        return ok

    def _install_one(self, name: str, target_root: Path, force: bool) -> bool:
        """Copy a single skill directory into the target skills directory."""
        src = _PACKAGE_SKILLS_DIR / name
        dst = target_root / name

        if dst.exists():
            if not force:
                self.warning(
                    f"'{name}' already exists at {dst}. "
                    f"Use --force to overwrite."
                )
                return True  # not a failure — already present
            shutil.rmtree(dst)

        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(src, dst)
        except OSError as e:
            self.error(f"Failed to install '{name}': {e}")
            return False

        self.success(f"Installed '{name}' -> {dst}")
        return True

    def uninstall(self, skill_name: str, project_level: bool = False) -> bool:
        """Remove an installed skill from the Claude Code skills directory."""
        dst = self.get_skills_target_dir(project_level) / skill_name
        if not dst.exists():
            self.warning(f"'{skill_name}' is not installed at {dst}.")
            return True
        try:
            shutil.rmtree(dst)
        except OSError as e:
            self.error(f"Failed to remove '{skill_name}': {e}")
            return False
        self.success(f"Removed '{skill_name}' from {dst}")
        return True

    def show_status(self) -> bool:
        """Show bundled skills and whether they are installed."""
        bundled = self.list_bundled_skills()
        if not bundled:
            self.warning("No skills are bundled with this package.")
            return True

        self.section("Bundled Claude Code Skills")
        user_dir = self.get_skills_target_dir(project_level=False)
        proj_dir = self.get_skills_target_dir(project_level=True)
        for name in bundled:
            marks = []
            if (user_dir / name).exists():
                marks.append("user")
            if (proj_dir / name).exists():
                marks.append("project")
            state = f"installed ({', '.join(marks)})" if marks else "not installed"
            self.print(f"  • [bold cyan]{name}[/bold cyan] — {state}")
        self.info("Install with: silan skill install")
        return True

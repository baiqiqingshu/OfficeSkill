"""Offline skill-package checks for this project's minimal YAML metadata.

Does not claim to be a general YAML parser; avoids a runtime PyYAML dependency.
"""
from pathlib import Path
import re
import sys


def validate(root: Path):
    # Copied into OfficeSkill/temp/local-ppt: the skill lives in the repo's
    # .agents/skills directory, not next to this folder.
    candidates = [root / "skills/local-ppt-template"]
    candidates += [p / ".agents/skills/local-ppt-template" for p in root.parents]
    skill = next((p for p in candidates if (p / "SKILL.md").is_file()), candidates[0])
    text = (skill / "SKILL.md").read_text(encoding="utf-8")
    front = re.match(r"^---\nname: ([a-z0-9-]+)\ndescription: ([^\n]+)\n---\n", text)
    assert front, "Invalid minimal SKILL frontmatter"
    assert front[1] == skill.name and len(front[1]) < 64
    assert 0 < len(front[2]) <= 1024
    assert "[TODO:" not in text
    for path in re.findall(r"\]\((references/[^)]+)\)", text):
        assert (skill / path).is_file(), f"Broken skill reference: {path}"
    metadata = (skill / "agents/openai.yaml").read_text(encoding="utf-8")
    assert "$local-ppt-template" in metadata
    assert "allow_implicit_invocation: true" in metadata
    description = re.search(r'  short_description: "([^"]+)"', metadata)
    assert description and 25 <= len(description[1]) <= 64
    assert (skill / "scripts/pptx_tool.py").is_file()
    for path in (skill / "scripts").rglob("*.py"):
        compile(path.read_text(encoding="utf-8"), str(path), "exec")
    print("Skill metadata, references and Python syntax: passed (offline)")


if __name__ == "__main__":
    try:
        validate(Path(__file__).resolve().parents[1])
    except (AssertionError, OSError, SyntaxError) as exc:
        print(f"Skill validation failed: {exc}", file=sys.stderr)
        raise SystemExit(1)

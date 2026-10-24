from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import tempfile

from .common import PptError, atomic_write, json_bytes, local_path, read_json
from .render import generate, prepare
from .template import (create_template, documentation, inspect_reference,
                       load_template, starter_reference)


def scaffold(manifest: dict, layouts: list[str]) -> str:
    """layouts 为布局 ID 或模板页码（template_slide），可重复、可任意排序。"""
    by_id = {layout["id"]: layout for layout in manifest["layouts"]}
    by_slide = {layout["template_slide"]: layout for layout in manifest["layouts"]}
    result = ["# PPT 填充内容", ""]
    for index, entry in enumerate(layouts, start=1):
        if entry.isdigit():
            if int(entry) not in by_slide:
                raise PptError(f"模板页码 {entry} 超出范围；可用页码：{', '.join(map(str, sorted(by_slide)))}")
            layout = by_slide[int(entry)]
        elif entry in by_id:
            layout = by_id[entry]
        else:
            raise PptError(f"未知布局 {entry}；可用布局：{', '.join(by_id)}；也可使用模板页码 1..{len(by_slide)}")
        result += [f"## page: page_{index:02d} layout: {layout['id']}", ""]
        for slot in layout["inputs"]:
            result += [f"### {slot['id']}: {slot['type']}", ""]
            if slot["type"] == "text":
                result += ["请填内容", ""]
            elif slot["type"] == "image":
                result += ['{"src":"images/local.png","fit":"contain"}', ""]
            elif slot["type"] == "array":
                if slot["item_kind"] == "image":
                    result += ["- images/local.png", "- images/local.png", ""]
                else:
                    # 第一个文本位多为编号/图标角标，占位符需足够短。
                    fields = len(slot.get("field_indexes") or [0])
                    sample = "内容" if fields == 1 else " || ".join(["01"] + ["内容"] * (fields - 1))
                    result += [f"- {sample}", f"- {sample}", ""]
            else:
                cols = min(slot["limits"]["max_cols"], 3)
                result += ["| " + " | ".join(["列名"] * cols) + " |", "| " + " | ".join(["---"] * cols) + " |",
                           "| " + " | ".join(["内容"] * cols) + " |", ""]
    return "\n".join(result)


def parser():
    root = argparse.ArgumentParser(description="本地 PPT 模板和 Markdown 填充；不执行网络请求")
    commands = root.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("inspect", help="读取参考 PPTX，生成候选布局映射（人工/agent 审阅后用于 create）")
    inspect.add_argument("reference")
    inspect.add_argument("--output", required=True)
    create = commands.add_parser("create", help="根据参考 PPTX 和 JSON 布局 spec 创建模板包及说明")
    create.add_argument("reference")
    create.add_argument("--spec", required=True)
    create.add_argument("--output", required=True)
    starter = commands.add_parser("starter", help="创建内置多布局模板（浅色简约风格，18 种布局，无需参考 PPT）")
    starter.add_argument("--output", required=True)
    describe = commands.add_parser("describe", help="重新生成模板说明文档")
    describe.add_argument("--template", required=True)
    skeleton = commands.add_parser("scaffold", help="按选定的模板页面生成 MD 骨架；页面可任意挑选、重复、排序")
    skeleton.add_argument("--template", required=True)
    skeleton.add_argument("--layouts", required=True,
                          help="逗号分隔的布局 ID 或模板页码，如 cover,3,title_body,5,2")
    skeleton.add_argument("--output", required=True)
    skeleton.add_argument("--overwrite", action="store_true")
    for command in ("validate", "generate"):
        action = commands.add_parser(command, help="校验填充内容" if command == "validate" else "校验并填充为 PPTX")
        action.add_argument("--template", required=True)
        action.add_argument("--content", required=True)
        if command == "generate":
            action.add_argument("--output", required=True)
            action.add_argument("--overwrite", action="store_true")
    return root


def main(argv=None) -> int:
    # Keep Chinese diagnostics legible to agents capturing Windows pipe output.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    args = parser().parse_args(argv)
    try:
        command = args.command
        if command == "inspect":
            result = inspect_reference(local_path(args.reference))
            atomic_write(local_path(args.output), json_bytes(result))
            result = {"spec": str(local_path(args.output)), "layouts": len(result["layouts"]),
                      "next": "审阅候选映射：删除静态形状，命名输入，填写布局说明并校准限制，再执行 create"}
        elif command == "create":
            manifest = create_template(local_path(args.reference), read_json(local_path(args.spec)), local_path(args.output))
            result = {"template": str(local_path(args.output)), "layouts": len(manifest["layouts"]), "guide": "template-guide.md"}
        elif command == "starter":
            data, spec = starter_reference()
            with tempfile.TemporaryDirectory(prefix="local-ppt-") as directory:
                reference = Path(directory) / "starter-reference.pptx"
                reference.write_bytes(data)
                create_template(reference, spec, local_path(args.output))
            result = {"template": str(local_path(args.output)), "layouts": [l["id"] for l in spec["layouts"]], "guide": "template-guide.md"}
        elif command == "describe":
            directory = local_path(args.template)
            manifest, _ = load_template(directory)
            atomic_write(directory / "template-guide.md", documentation(manifest).encode("utf-8"), overwrite=True)
            result = {"guide": str(directory / "template-guide.md")}
        elif command == "scaffold":
            manifest, _ = load_template(local_path(args.template))
            result = scaffold(manifest, [l.strip() for l in args.layouts.split(",")])
            atomic_write(local_path(args.output), result.encode("utf-8"), overwrite=args.overwrite)
            result = {"content": str(local_path(args.output)), "next": "保持页面/元素标题，替换内容后执行 validate / generate"}
        elif command == "validate":
            _, pages = prepare(local_path(args.template), local_path(args.content))
            result = {"validation": "passed", "slides": len(pages)}
        else:
            result = generate(local_path(args.template), local_path(args.content), local_path(args.output), overwrite=args.overwrite)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (PptError, OSError, KeyError, TypeError, AttributeError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

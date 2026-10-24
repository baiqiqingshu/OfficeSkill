from __future__ import annotations

from io import BytesIO
import json
from pathlib import Path
import socket
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile, ZIP_DEFLATED
import posixpath

from PIL import Image
from lxml import etree
from pptx import Presentation

_SCRIPTS = next(
    p / ".agents/skills/local-ppt-template/scripts"
    for p in Path(__file__).resolve().parents
    if (p / ".agents/skills/local-ppt-template/scripts").is_dir()
)
sys.path.insert(0, str(_SCRIPTS))

from pptx_local.cli import main, scaffold
from pptx_local.common import PptError, json_bytes, local_path
from pptx_local.markdown import inline, parse_pages
from pptx_local.package import inspect_package
from pptx_local.render import generate, prepare
from pptx_local.template import create_template, effective_font, inspect_reference, load_template, starter_reference


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        data, self.spec = starter_reference()
        self.reference = self.root / "reference.pptx"
        self.reference.write_bytes(data)
        self.template = self.root / "template"
        self.manifest = create_template(self.reference, self.spec, self.template)

    def write_content(self, text):
        path = self.root / "content.md"
        path.write_text(text, encoding="utf-8")
        return path

    def shape_named(self, slide, name):
        return [s for s in slide.shapes if s.name == name]

    def test_repeat_order_styles_and_theme_preservation(self):
        content = self.write_content('''# 测试
## page: one layout: title_body
### title: text
测试标题
### body: text
**前两**个字 *斜体* <span style="font-family: Arial; color: #2563EB; font-size: 15pt; text-decoration: underline">custom</span> 默认
## page: two layout: cover
### title: text
封面
### subtitle: text
副标题
## page: three layout: title_body
### title: text
最后一页
### body: text
重复布局
''')
        output = self.root / "out.pptx"
        generate(self.template, content, output)
        deck = Presentation(output)
        self.assertEqual(len(deck.slides), 3)
        titles = [self.shape_named(slide, "title")[0].text for slide in deck.slides]
        self.assertEqual(titles, ["测试标题", "封面", "最后一页"])
        runs = self.shape_named(deck.slides[0], "body")[0].text_frame.paragraphs[0].runs
        self.assertEqual(runs[0].text, "前两")
        self.assertTrue(runs[0].font.bold)
        self.assertFalse(runs[1].font.bold)
        custom = next(r for r in runs if r.text == "custom")
        self.assertEqual(custom.font.name, "Arial")
        self.assertEqual(str(custom.font.color.rgb), "2563EB")
        self.assertTrue(custom.font.underline)
        self.assertEqual(custom.font.size.pt, 15)
        self.assertEqual(runs[-1].font.name, "Microsoft YaHei")
        self.assertEqual(runs[-1].font.size.pt, 17)
        original_parts = inspect_package((self.template / "template.pptx").read_bytes())
        final_parts = inspect_package(output.read_bytes())
        for name in original_parts:
            if name.startswith(("ppt/theme/", "ppt/slideMasters/")):
                self.assertEqual(original_parts[name], final_parts[name])

    def test_table_is_native_and_trims_grid(self):
        content = self.write_content('''## page: one layout: table
### title: text
数据表
### data: table
| 对象 | 作用 |
| --- | --- |
| **Pod** | 运行容器 |
| Service | 稳定入口 |
''')
        output = self.root / "table.pptx"
        generate(self.template, content, output)
        table = self.shape_named(Presentation(output).slides[0], "data")[0].table
        self.assertEqual((len(table.rows), len(table.columns)), (3, 2))
        self.assertEqual(table.cell(1, 0).text, "Pod")
        self.assertTrue(table.cell(1, 0).text_frame.paragraphs[0].runs[0].font.bold)

    def test_table_dimensions_and_column_widths(self):
        value = {"rows": [["A", "B"], ["1", "2"]], "width_cm": 20, "height_cm": 5, "column_widths_cm": [7, 13]}
        content = self.write_content("## page: data layout: table\n### title: text\n表格\n### data: table\n```json\n" + json.dumps(value) + "\n```\n")
        output = self.root / "table.pptx"
        generate(self.template, content, output)
        shape = self.shape_named(Presentation(output).slides[0], "data")[0]
        self.assertAlmostEqual(shape.width.cm, 20, places=3)
        self.assertAlmostEqual(shape.height.cm, 5, places=3)
        self.assertAlmostEqual(shape.table.columns[0].width.cm, 7, places=3)

    def test_local_image_contain_and_cover(self):
        Image.new("RGB", (240, 120), "blue").save(self.root / "image.png")
        for fit in ("contain", "cover"):
            content = self.write_content('''## page: pic layout: image_text
### title: text
图片页
### body: text
本地图片
### image: image
''' + json.dumps({"src": "image.png", "fit": fit, "alt": "测试图片"}))
            output = self.root / f"{fit}.pptx"
            generate(self.template, content, output)
            picture = self.shape_named(Presentation(output).slides[0], "image")[0]
            self.assertEqual((picture.image.size), (240, 120))
            if fit == "contain":
                self.assertAlmostEqual(picture.width / picture.height, 2, places=3)
                self.assertEqual(picture.crop_left, 0)
            else:
                self.assertGreater(picture.crop_left, 0)
            self.assertEqual(picture.name, "image")

    def test_constraints_reject_before_output_changes(self):
        cases = [
            ("cover", "title", "text", "字" * 25, "字符数"),
            ("cover", "title", "text", '<span style="font-size: 99pt">字</span>', "字号"),
            ("cover", "title", "text", "一\n二\n三", "行数"),
            ("image_text", "image", "image", '{"src":"https://host/image.png"}', "本地文件"),
            ("image_text", "image", "image", '{"src":"image.png","height_cm":99}', "宽高"),
            ("table", "data", "table", json.dumps({"rows": [["x"]] * 7}), "超过"),
            ("table", "data", "table", json.dumps({"rows": [["x", "y"]], "column_widths_cm": [1, 1]}), "总和"),
        ]
        output = self.root / "existing.pptx"
        original = b"existing-file"
        output.write_bytes(original)
        for lid, sid, kind, body, message in cases:
            with self.subTest(layout=lid, content=body):
                text = f"## page: invalid layout: {lid}\n"
                for slot in next(l for l in self.manifest["layouts"] if l["id"] == lid)["inputs"]:
                    if slot["id"] == sid:
                        text += f"### {sid}: {kind}\n{body}\n"
                    elif slot["type"] == "text":
                        text += f"### {slot['id']}: text\n简短内容\n"
                with self.assertRaisesRegex(PptError, message):
                    generate(self.template, self.write_content(text), output, overwrite=True)
                self.assertEqual(output.read_bytes(), original)

    def test_missing_unknown_and_duplicate_inputs(self):
        cases = [
            ("## page: a layout: absent\n### title: text\n首页", "未知布局"),
            ("## page: a layout: cover\n### wrong: text\n首页", "未知输入"),
            ("## page: a layout: cover\n### title: text\n首页\n### title: text\n再次", "重复"),
            ("## page: a layout: cover\n## page: a layout: cover", "重复"),
        ]
        for text, message in cases:
            with self.subTest(text=text), self.assertRaisesRegex(PptError, message):
                prepare(self.template, self.write_content(text))

    def test_missing_input_is_allowed_and_empty_text_is_allowed(self):
        # Inputs marked required in the manifest are recommendations only;
        # omitted inputs are rendered with empty content.
        output = self.root / "missing.pptx"
        generate(self.template, self.write_content("## page: a layout: cover\n### title: text\n首页"), output)
        slide = Presentation(output).slides[0]
        self.assertEqual(self.shape_named(slide, "title")[0].text, "首页")
        self.assertEqual(self.shape_named(slide, "subtitle"), [])

        output = self.root / "empty-text.pptx"
        generate(self.template, self.write_content("## page: a layout: cover\n### title: text\n"), output)
        self.assertEqual(self.shape_named(Presentation(output).slides[0], "title")[0].text, "")

    def test_offline_template_and_generation_no_socket(self):
        content = self.write_content("## page: one layout: title_body\n### title: text\n离线\n### body: text\n本地处理")
        with patch.object(socket, "socket", side_effect=AssertionError("Network forbidden")), patch.object(socket, "create_connection", side_effect=AssertionError("Network forbidden")):
            self.assertGreater(len(inspect_reference(self.reference)["layouts"]), 0)
            create_template(self.reference, self.spec, self.root / "offline-template")
            generate(self.root / "offline-template", content, self.root / "offline.pptx")

    def test_template_sample_data_is_cleared_and_guide_complete(self):
        def descendants(shape):
            yield shape
            if shape.shape_type == 6:  # GROUP
                for child in shape.shapes:
                    yield from descendants(child)

        prs = Presentation(self.template / "template.pptx")
        for layout in self.manifest["layouts"]:
            slide = prs.slides[layout["template_slide"] - 1]
            by_id = {shape.shape_id: shape for shape in slide.shapes}
            for slot in layout["inputs"]:
                for shape_id in slot.get("shape_ids") or [slot["shape_id"]]:
                    for shape in descendants(by_id[shape_id]):
                        if shape.has_text_frame:
                            self.assertEqual(shape.text, "")
                        elif shape.has_table:
                            self.assertTrue(all(cell.text == "" for row in shape.table.rows for cell in row.cells))
        guide = (self.template / "template-guide.md").read_text(encoding="utf-8")
        for layout in self.manifest["layouts"]:
            self.assertIn(layout["description"], guide)
            for slot in layout["inputs"]:
                self.assertIn(f"### {slot['id']}", guide)
                self.assertIn(slot["description"], guide)
        self.assertIn("24 字符", guide)

    def test_reference_customization_and_static_objects(self):
        spec = json.loads(json.dumps(self.spec))
        spec["layouts"] = [spec["layouts"][0]]
        spec["layouts"][0]["inputs"] = [spec["layouts"][0]["inputs"][0]]
        package = self.root / "custom"
        manifest = create_template(self.reference, spec, package)
        self.assertEqual(len(manifest["layouts"]), 1)
        content = self.write_content("## page: a layout: cover\n### title: text\n自定义标题")
        output = self.root / "custom.pptx"
        generate(package, content, output)
        slide = Presentation(output).slides[0]
        self.assertEqual(self.shape_named(slide, "title")[0].text, "自定义标题")
        self.assertTrue(any(shape.has_text_frame and shape.text == "subtitle" for shape in slide.shapes))

    def test_reference_master_font_inheritance(self):
        reference = Presentation()
        slide = reference.slides.add_slide(reference.slide_layouts[0])
        slide.shapes.title.text = "样例标题"
        self.assertIsNone(slide.shapes.title.text_frame.paragraphs[0].runs[0].font.size)
        self.assertEqual(effective_font(slide.shapes.title), 44)
        path = self.root / "inherited.pptx"
        reference.save(path)
        spec = inspect_reference(path)
        self.assertEqual(spec["layouts"][0]["inputs"][0]["limits"]["max_font_pt"], 44)
        package = self.root / "inherited-template"
        create_template(path, spec, package)
        content = self.write_content("## page: a layout: layout_1\n### element_2: text\n新标题\n### element_3: text\n副标题")
        output = self.root / "inherited-out.pptx"
        generate(package, content, output)
        self.assertEqual(effective_font(Presentation(output).slides[0].shapes.title), 44)

    def test_text_box_respects_custom_size_limits(self):
        spec = json.loads(json.dumps(self.spec))
        body = next(i for i in spec["layouts"][3]["inputs"] if i["id"] == "body")
        body["limits"]["max_width_cm"] = 10
        body["limits"]["max_height_cm"] = 4
        package = self.root / "small-box"
        create_template(self.reference, spec, package)
        output = self.root / "small-box.pptx"
        generate(package, self.write_content("## page: a layout: title_body\n### title: text\n小框\n### body: text\n简短正文"), output)
        shape = self.shape_named(Presentation(output).slides[0], "body")[0]
        self.assertAlmostEqual(shape.width.cm, 10, places=3)
        self.assertAlmostEqual(shape.height.cm, 4, places=3)

    def test_optional_input_removed(self):
        spec = json.loads(json.dumps(self.spec))
        subtitle = next(i for i in spec["layouts"][0]["inputs"] if i["id"] == "subtitle")
        subtitle["required"] = False
        package = self.root / "optional"
        create_template(self.reference, spec, package)
        output = self.root / "optional.pptx"
        generate(package, self.write_content("## page: a layout: cover\n### title: text\n只有标题"), output)
        slide = Presentation(output).slides[0]
        self.assertEqual(self.shape_named(slide, "subtitle"), [])
        self.assertEqual(self.shape_named(slide, "title")[0].text, "只有标题")

    def test_tampering_and_external_relations_rejected(self):
        path = self.template / "template.pptx"
        path.write_bytes(path.read_bytes() + b"tampered")
        with self.assertRaisesRegex(PptError, "SHA-256"):
            load_template(self.template)
        data = self.reference.read_bytes()
        parts = inspect_package(data)
        rel = parts["ppt/slides/_rels/slide1.xml.rels"]
        rel = rel.replace(b"</Relationships>", b'<Relationship Id="rIdExternal" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid" TargetMode="External"/></Relationships>')
        parts["ppt/slides/_rels/slide1.xml.rels"] = rel
        stream = BytesIO()
        with ZipFile(stream, "w", ZIP_DEFLATED) as archive:
            for name, blob in parts.items():
                archive.writestr(name, blob)
        with self.assertRaisesRegex(PptError, "外部关系"):
            inspect_package(stream.getvalue())

    def test_strict_format_and_local_paths(self):
        for path in ("https://example.com", "file:///local.png", "data:image/png,x", "\\\\server\\share\\file.png", "//server/share/file.png"):
            with self.subTest(path=path), self.assertRaises(PptError):
                local_path(path)
        for text in ("**未闭合", '<span style="unknown: x">bad</span>', "<img src='x'>", "<b>bad</i>"):
            with self.subTest(text=text), self.assertRaises(PptError):
                inline(text)
        self.assertEqual("".join(run.text for run in inline(r"\*星号\*")), "*星号*")

    def test_repeated_layout_gets_distinct_theme_override(self):
        # PowerPoint rejects a deck when two slides reference one themeOverride part,
        # so cloning a layout must clone its override too.
        from pptx_local.package import clone_slides
        override_type = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/themeOverride"
        parts = inspect_package(self.reference.read_bytes())
        theme = parts["ppt/theme/theme1.xml"]
        parts["ppt/theme/themeOverride1.xml"] = theme
        types = parts["[Content_Types].xml"].decode("utf-8")
        parts["[Content_Types].xml"] = types.replace(
            "</Types>", '<Override PartName="/ppt/theme/themeOverride1.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.themeOverride+xml"/></Types>').encode()
        for slide in (1, 2):
            rel_name = f"ppt/slides/_rels/slide{slide}.xml.rels"
            blob = parts[rel_name].decode("utf-8")
            parts[rel_name] = blob.replace(
                "</Relationships>", f'<Relationship Id="rIdOverride" Type="{override_type}" '
                'Target="../theme/themeOverride1.xml"/></Relationships>').encode()
        stream = BytesIO()
        with ZipFile(stream, "w", ZIP_DEFLATED) as archive:
            for name, blob in parts.items():
                archive.writestr(name, blob)
        cloned = inspect_package(clone_slides(stream.getvalue(), [1, 1]))
        targets = []
        for name, blob in cloned.items():
            if not name.startswith("ppt/slides/_rels/localFilled"):
                continue
            slide_part = posixpath.join("ppt/slides", posixpath.basename(name)[: -len(".rels")])
            for rel in etree.fromstring(blob):
                if rel.get("Type") == override_type:
                    targets.append(posixpath.normpath(posixpath.join(posixpath.dirname(slide_part), rel.get("Target"))))
        self.assertEqual(len(targets), 2)
        self.assertEqual(len(set(targets)), 2, "重复布局必须各自持有独立的 themeOverride 部件")
        for target in targets:
            self.assertIn(target, cloned)
            self.assertEqual(cloned[target], theme)


    def test_reference_spec_errors_and_atomic_creation(self):
        for field, value in (("max_chars", 0), ("max_width_cm", 99), ("max_lines", 1.5)):
            spec = json.loads(json.dumps(self.spec))
            spec["layouts"][0]["inputs"][0]["limits"][field] = value
            with self.subTest(field=field), self.assertRaises(PptError):
                create_template(self.reference, spec, self.root / "invalid-template")
            self.assertFalse((self.root / "invalid-template").exists())

    def test_scaffold_and_cli_error_contract(self):
        (self.root / "images").mkdir()
        Image.new("RGB", (40, 40), "gray").save(self.root / "images" / "local.png")
        content = self.write_content(scaffold(self.manifest, ["title_body", "table", "agenda", "tags"]))
        self.assertEqual(len(prepare(self.template, content)[1]), 4)
        with patch("sys.stderr", new_callable=__import__("io").StringIO) as stderr:
            status = main(["generate", "--template", str(self.template), "--content", str(content), "--output", str(self.root / "bad.txt")])
            self.assertEqual(status, 2)
            self.assertIn(".pptx", json.loads(stderr.getvalue())["error"])

    def test_scaffold_accepts_template_slide_numbers(self):
        text = scaffold(self.manifest, ["4", "2", "title_body"])
        pages = [line for line in text.splitlines() if line.startswith("## page")]
        self.assertEqual(len(pages), 3)
        self.assertIn("layout: title_body", pages[0])
        self.assertIn("layout: agenda", pages[1])
        self.assertIn("layout: title_body", pages[2])
        with self.assertRaisesRegex(PptError, "超出范围"):
            scaffold(self.manifest, ["99"])
        with self.assertRaisesRegex(PptError, "未知布局"):
            scaffold(self.manifest, ["missing_layout"])

    def test_numbered_and_icon_bullets(self):
        ns = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
        content = self.write_content('''## page: one layout: title_body
### title: text
列表页
### body: text
3. 编号句号
4) 编号括号
- 普通分点
- [✓] 图标分点
- [★; #E85A2E] 彩色图标
- [➤; font:Wingdings; #2563EB] 字体图标
  - 二级缩进
普通段落
''')
        output = self.root / "bullets.pptx"
        generate(self.template, content, output)
        body = self.shape_named(Presentation(output).slides[0], "body")[0]
        props = [p._p.pPr for p in body.text_frame.paragraphs]

        auto = props[0].find(f"{ns}buAutoNum")
        self.assertEqual((auto.get("type"), auto.get("startAt")), ("arabicPeriod", "3"))
        auto = props[1].find(f"{ns}buAutoNum")
        self.assertEqual((auto.get("type"), auto.get("startAt")), ("arabicParenR", "4"))

        self.assertEqual(props[2].find(f"{ns}buChar").get("char"), "•")
        self.assertIsNone(props[2].find(f"{ns}buClr"))
        self.assertEqual(props[3].find(f"{ns}buChar").get("char"), "✓")

        colored = props[4]
        self.assertEqual(colored.find(f"{ns}buChar").get("char"), "★")
        self.assertEqual(colored.find(f"{ns}buClr").find(f"{ns}srgbClr").get("val"), "E85A2E")

        custom = props[5]
        self.assertEqual(custom.find(f"{ns}buChar").get("char"), "➤")
        self.assertEqual(custom.find(f"{ns}buFont").get("typeface"), "Wingdings")
        self.assertEqual(custom.find(f"{ns}buClr").find(f"{ns}srgbClr").get("val"), "2563EB")

        nested = props[6]
        self.assertEqual(nested.get("marL"), str(342900 * 2))
        self.assertEqual(nested.find(f"{ns}buChar").get("char"), "•")

        self.assertIsNotNone(props[7].find(f"{ns}buNone"))

    def test_icon_marker_validation(self):
        for body in ("- [;] 空符号", "- [x; #FFF] 短色值", "- [x; red] 未知修饰", "- [x; font:] 空字体"):
            content = self.write_content(f"## page: a layout: title_body\n### title: text\n标题\n### body: text\n{body}\n")
            with self.subTest(body=body), self.assertRaises(PptError):
                prepare(self.template, content)

    def group_shapes(self, slide):
        return [s for s in slide.shapes if s.shape_type == 6]

    def test_array_group_clone_positions_and_fields(self):
        content = self.write_content('''## page: toc layout: agenda
### title: text
目录
### items: array
- 01 || 项目概述
- 02 || 当前进展
- 03 || 成果展示
- 04 || 计划
''')
        output = self.root / "array.pptx"
        generate(self.template, content, output)
        groups = self.group_shapes(Presentation(output).slides[0])
        self.assertEqual(len(groups), 4)
        self.assertAlmostEqual(groups[0].top.cm, 5.8, places=2)
        self.assertAlmostEqual(groups[3].top.cm, 11.8, places=2)
        self.assertAlmostEqual(groups[3].top.cm - groups[2].top.cm, 2.0, places=2)
        texts = [[child.text for child in group.shapes if child.has_text_frame] for group in groups]
        self.assertEqual(texts[0], ["01", "项目概述"])
        self.assertEqual(texts[3], ["04", "计划"])
        ids = [node.get("id") for group in groups for node in group._element.iter() if node.tag.endswith("}cNvPr")]
        self.assertEqual(len(ids), len(set(ids)), "克隆条目的形状 ID 必须唯一")

    def test_array_single_item_and_omitted(self):
        content = self.write_content("## page: toc layout: agenda\n### title: text\n目录\n### items: array\n- 01 || 唯一\n")
        output = self.root / "one.pptx"
        generate(self.template, content, output)
        self.assertEqual(len(self.group_shapes(Presentation(output).slides[0])), 1)

        content = self.write_content("## page: toc layout: agenda\n### title: text\n目录\n")
        output = self.root / "none.pptx"
        generate(self.template, content, output)
        self.assertEqual(len(self.group_shapes(Presentation(output).slides[0])), 0)

    def test_array_text_pills_and_json(self):
        content = self.write_content('''## page: tags layout: tags
### title: text
技术栈
### items: array
```json
{"items": ["K8s", "Python", "DevOps", "Go"]}
```
''')
        output = self.root / "tags.pptx"
        generate(self.template, content, output)
        slide = Presentation(output).slides[0]
        pills = sorted((s for s in slide.shapes if s.has_text_frame and s.text in {"K8s", "Python", "DevOps", "Go"}),
                       key=lambda s: s.left)
        self.assertEqual(len(pills), 4)
        self.assertAlmostEqual(pills[0].left.cm, 2.0, places=2)
        for a, b in zip(pills, pills[1:]):
            self.assertAlmostEqual(b.left.cm - a.left.cm, 4.7, places=2)

    def test_array_image_items(self):
        for name, color in (("a.png", "red"), ("b.png", "blue")):
            Image.new("RGB", (200, 200), color).save(self.root / name)
        content = self.write_content('''## page: pics layout: image_row
### title: text
图片墙
### items: array
- a.png
- {"src": "b.png"}
''')
        output = self.root / "images.pptx"
        generate(self.template, content, output)
        slide = Presentation(output).slides[0]
        pictures = sorted((s for s in slide.shapes if s.shape_type == 13), key=lambda s: s.left)
        self.assertEqual(len(pictures), 2)
        self.assertAlmostEqual(pictures[1].left.cm - pictures[0].left.cm, 5.95, places=2)

    def test_array_content_errors(self):
        cases = [
            ("- 01 || 概述\n- 02 || 进展\n- 03 || 成果\n- 04 || 计划\n- 05 || 风险\n- 06 || 排期\n- 07 || 其它", "超出范围"),
            ("- 01 || 概述 || 多余字段", "超过"),
            ("没有前导短横", "条目"),
            ('{"items": []}', "非空"),
            ("- " + "字" * 25 + " || 概述", "字符"),
        ]
        for body, message in cases:
            content = self.write_content(f"## page: toc layout: agenda\n### title: text\n目录\n### items: array\n{body}\n")
            with self.subTest(body=body), self.assertRaisesRegex(PptError, message):
                prepare(self.template, content)

    def test_array_spec_validation(self):
        cases = []
        spec = json.loads(json.dumps(self.spec))
        next(i for i in spec["layouts"][1]["inputs"] if i.get("type") == "array")["shape_ids"] = [2, 2]
        cases.append((spec, "两个不同"))

        spec = json.loads(json.dumps(self.spec))
        next(i for i in spec["layouts"][1]["inputs"] if i.get("type") == "array")["limits"]["max_items"] = 20
        cases.append((spec, "超出页面"))

        spec = json.loads(json.dumps(self.spec))
        slot = next(i for i in spec["layouts"][1]["inputs"] if i.get("type") == "array")
        slot["limits"]["min_items"] = 7
        cases.append((spec, "min_items"))

        spec = json.loads(json.dumps(self.spec))
        slot = next(i for i in spec["layouts"][1]["inputs"] if i.get("type") == "array")
        del slot["limits"]["max_item_chars"]
        cases.append((spec, "max_item_chars"))

        for spec, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(PptError, message):
                create_template(self.reference, spec, self.root / "bad-array")
            self.assertFalse((self.root / "bad-array").exists())


if __name__ == "__main__":
    unittest.main()

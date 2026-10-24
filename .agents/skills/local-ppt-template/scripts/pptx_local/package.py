"""Clone slide parts while retaining native masters, themes and relationships.

No shape-by-shape rebuild: this preserves static charts, media and decorations.
python-pptx's subsequent save prunes parts unreachable from the presentation.
"""
from __future__ import annotations

from io import BytesIO
import posixpath
from zipfile import BadZipFile, ZipFile, ZIP_DEFLATED

from lxml import etree

from .common import PptError

P = "http://schemas.openxmlformats.org/presentationml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
CT = "http://schemas.openxmlformats.org/package/2006/content-types"
NS = {"p": P, "r": R}


def xml(data: bytes):
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise PptError("PPTX 中包含不受支持的 DTD/实体声明")
    try:
        return etree.fromstring(data, etree.XMLParser(resolve_entities=False, no_network=True))
    except etree.XMLSyntaxError as exc:
        raise PptError(f"PPTX XML 无效：{exc}") from exc


def serialize(root) -> bytes:
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def inspect_package(data: bytes) -> dict[str, bytes]:
    try:
        with ZipFile(BytesIO(data)) as archive:
            if len(set(archive.namelist())) != len(archive.namelist()):
                raise PptError("PPTX ZIP 条目重复")
            if sum(i.file_size for i in archive.infolist()) > 512 * 1024 * 1024:
                raise PptError("PPTX 解压后超过 512 MiB")
            parts = {name: archive.read(name) for name in archive.namelist()}
    except (BadZipFile, OSError, RuntimeError) as exc:
        raise PptError(f"无法读取 PPTX 文件：{exc}") from exc
    if "ppt/presentation.xml" not in parts:
        raise PptError("文件不是有效的 .pptx 演示文稿")
    for name, blob in parts.items():
        if name.endswith((".xml", ".rels")):
            root = xml(blob)
            if name.endswith(".rels"):
                for rel in root:
                    if rel.get("TargetMode") == "External":
                        raise PptError(f"离线模式拒绝 PPTX 外部关系：{name} -> {rel.get('Target')}")
        if "vbaproject" in name.lower() or "/activex/" in name.lower():
            raise PptError("不支持包含宏或 ActiveX 的模板")
    return parts


def slide_names(parts: dict[str, bytes]) -> list[str]:
    presentation = xml(parts["ppt/presentation.xml"])
    rels = xml(parts["ppt/_rels/presentation.xml.rels"])
    targets = {r.get("Id"): posixpath.normpath(posixpath.join("ppt", r.get("Target")))
               if not r.get("Target", "").startswith("/") else r.get("Target").lstrip("/") for r in rels}
    return [targets[s.get(f"{{{R}}}id")] for s in presentation.findall("p:sldIdLst/p:sldId", NS)]


def clone_slides(data: bytes, indices: list[int]) -> bytes:
    """indices are one-based, may repeat and may appear in any order."""
    parts = inspect_package(data)
    source = slide_names(parts)
    if not indices or any(i < 1 or i > len(source) for i in indices):
        raise PptError("源页面编号无效")
    presentation = xml(parts["ppt/presentation.xml"])
    rels = xml(parts["ppt/_rels/presentation.xml.rels"])
    types = xml(parts["[Content_Types].xml"])
    # Slide sections/custom shows refer to old slide IDs; don't retain stale IDs.
    for child in list(presentation):
        if etree.QName(child).localname in {"sldIdLst", "custShowLst", "extLst"}:
            presentation.remove(child)
    for rel in list(rels):
        if rel.get("Type", "").endswith(("/slide", "/notesMaster", "/commentAuthors")):
            rels.remove(rel)
    new_ids = etree.Element(f"{{{P}}}sldIdLst")
    master_ids = presentation.find(f"{{{P}}}sldMasterIdLst")
    presentation.insert(list(presentation).index(master_ids) + 1 if master_ids is not None else 0, new_ids)
    for child in list(presentation):
        if etree.QName(child).localname == "notesMasterIdLst":
            presentation.remove(child)
    used = {r.get("Id") for r in rels}
    override_ct = "application/vnd.openxmlformats-officedocument.themeOverride+xml"
    part_ct = {o.get("PartName").lstrip("/"): o.get("ContentType")
               for o in types if etree.QName(o).localname == "Override"}
    override_seq = 0
    for output_index, source_index in enumerate(indices, start=1):
        new_name = f"ppt/slides/localFilled{output_index}.xml"
        parts[new_name] = parts[source[source_index - 1]]
        old_rel_name = posixpath.join(posixpath.dirname(source[source_index - 1]), "_rels",
                                     posixpath.basename(source[source_index - 1]) + ".rels")
        slide_rels = xml(parts[old_rel_name]) if old_rel_name in parts else etree.Element(f"{{{REL}}}Relationships")
        for rel in list(slide_rels):
            rel_type = rel.get("Type", "")
            if rel_type.endswith(("/notesSlide", "/comments")):
                slide_rels.remove(rel)
            elif rel_type.endswith("/slide"):
                # Internal slide navigation cannot be mapped unambiguously when a layout repeats.
                raise PptError("参考 PPT 含跨页跳转，请先在本地移除该跳转再创建模板")
            elif rel_type.endswith("/themeOverride"):
                # PowerPoint rejects a deck when two slides share one themeOverride part.
                target = posixpath.normpath(posixpath.join(posixpath.dirname(new_name), rel.get("Target")))
                if part_ct.get(target) != override_ct or target not in parts:
                    raise PptError(f"themeOverride 关系指向未知部件：{target}")
                override_seq += 1
                clone = f"ppt/theme/themeOverride.clone{override_seq}.xml"
                parts[clone] = parts[target]
                etree.SubElement(types, f"{{{CT}}}Override", PartName="/" + clone, ContentType=override_ct)
                rel.set("Target", posixpath.relpath(clone, posixpath.dirname(new_name)))
        parts[f"ppt/slides/_rels/localFilled{output_index}.xml.rels"] = serialize(slide_rels)
        rid = f"rIdLocal{output_index}"
        while rid in used:
            rid += "x"
        used.add(rid)
        etree.SubElement(rels, f"{{{REL}}}Relationship", Id=rid, Type=f"{R}/slide",
                         Target=f"slides/localFilled{output_index}.xml")
        etree.SubElement(new_ids, f"{{{P}}}sldId", id=str(255 + output_index), attrib={f"{{{R}}}id": rid})
        etree.SubElement(types, f"{{{CT}}}Override", PartName="/" + new_name,
                         ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml")
    parts["ppt/presentation.xml"] = serialize(presentation)
    parts["ppt/_rels/presentation.xml.rels"] = serialize(rels)
    parts["[Content_Types].xml"] = serialize(types)
    # A reference thumbnail may expose the old cover even after slot clearing.
    if "_rels/.rels" in parts:
        root_rels = xml(parts["_rels/.rels"])
        for rel in list(root_rels):
            if rel.get("Type", "").endswith("/thumbnail"):
                root_rels.remove(rel)
        parts["_rels/.rels"] = serialize(root_rels)
    stream = BytesIO()
    with ZipFile(stream, "w", ZIP_DEFLATED) as archive:
        for name, blob in parts.items():
            archive.writestr(name, blob)
    return stream.getvalue()

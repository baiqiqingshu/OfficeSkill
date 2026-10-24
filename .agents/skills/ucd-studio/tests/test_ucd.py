"""Run: python -m unittest discover -s ucd-studio/tests -v"""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import ucd


class UCDTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name)
        self.spec=ucd.read_json(ROOT/'examples/admin.json')

    def tearDown(self):self.tmp.cleanup()

    def test_all_layouts_and_modes(self):
        for layout in ucd.read_json(ROOT/'data/layouts.json'):
            for mode in ucd.MODES:
                with self.subTest(layout=layout,mode=mode):
                    out=self.base/f'{layout}-{mode}'
                    ucd.build(ucd.read_json(ROOT/f'examples/{layout}.json'),out,mode)
                    self.assertTrue(ucd.check(out)['ok'])
                    self.assertEqual((out/'page.js').exists(),mode=='editable')
                    self.assertEqual((out/'assets/ucd-runtime.js').exists(),mode=='library')

    def test_search_small_metadata_and_real_code(self):
        found=ucd.search('审批 列表 筛选','component',2,False,1000)
        self.assertEqual(found[0]['id'],'table')
        self.assertNotIn('example',found[0]);self.assertLessEqual(len(ucd.json_text(found)),1000)
        entry=next(c for c in ucd.catalog() if c['id']=='table')
        code=ucd.show_entry(entry,True)
        self.assertIn('<table',code['html']);self.assertIn('.data-table',code['css'])
        self.assertEqual(ucd.search('zzzz-unmatched','all',3,False,6500),[])

    def test_every_component_generates(self):
        for entry in ucd.catalog():
            if entry['kind']!='component' or entry.get('primitive') or entry['id']=='image':continue
            with self.subTest(component=entry['id']):
                spec=copy.deepcopy(self.spec);spec['blocks']={'sample':entry['example']}
                out=self.base/entry['id'];ucd.build(spec,out);self.assertTrue(ucd.check(out)['ok'])

    def test_patch_syncs_spec_html_tokens_doc_and_history(self):
        out=self.base/'patch';ucd.build(self.spec,out)
        changed=ucd.merge(self.spec,{'style':'jade','blocks':{'records':{'title':'待我审批'}}})
        ucd.build(changed,out)
        self.assertIn('待我审批',(out/'index.html').read_text(encoding='utf-8'))
        self.assertIn('青绿',(out/'design-system.md').read_text(encoding='utf-8'))
        self.assertTrue(list((out/'.history').glob('*/index.html')))
        self.assertTrue(ucd.check(out)['ok'])

    def test_hand_edits_never_overwritten(self):
        for name in ('index.html','design-system.md','assets/ucd-runtime.js'):
            out=self.base/name.replace('/','-');ucd.build(self.spec,out,'library')
            target=out/name;target.write_text(target.read_text(encoding='utf-8')+' manual',encoding='utf-8')
            before=target.read_bytes()
            with self.assertRaisesRegex(ValueError,'手工修改'):ucd.build(self.spec,out)
            self.assertEqual(target.read_bytes(),before)

    def test_editable_js_preserved_and_network_rejected(self):
        out=self.base/'editable';ucd.build(self.spec,out,'editable');js=out/'page.js'
        js.write_text(js.read_text(encoding='utf-8')+'\n// custom local behavior\n',encoding='utf-8');before=js.read_bytes()
        ucd.build(self.spec,out);self.assertEqual(js.read_bytes(),before)
        js.write_text('fetch("https://invalid.example/")',encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'外联'):ucd.build(self.spec,out)

    def test_invalid_patch_does_not_mutate_outputs(self):
        out=self.base/'invalid';ucd.build(self.spec,out)
        before={p.name:p.read_bytes() for p in out.iterdir() if p.is_file()}
        invalid=ucd.merge(self.spec,{'blocks':{'records':{'type':'unsupported'}}})
        with self.assertRaises(ValueError):ucd.build(invalid,out)
        self.assertEqual(before,{p.name:p.read_bytes() for p in out.iterdir() if p.is_file()})

    def test_html_escaped_and_literal_urls_not_requested(self):
        spec=copy.deepcopy(self.spec);spec['title']='<script>alert(1)</script> https://example.invalid'
        out=self.base/'escape';ucd.build(spec,out)
        text=(out/'index.html').read_text(encoding='utf-8')
        self.assertIn('&lt;script&gt;alert(1)&lt;/script&gt;',text)
        self.assertNotIn('<script>alert(1)</script>',text);self.assertTrue(ucd.check(out)['ok'])

    def test_bad_schema_assets_and_css(self):
        for patch in ({'tokens':{'primary':'red; background:url(x)'}},{'unknown':'bad'},
                      {'blocks':{'records':{'pageSize':0}}},{'blocks':{'records':{'rows':[['wrong']]}}},
                      {'assets':[{'source':'x','name':'../x.png'}]}):
            with self.subTest(patch=patch):
                with self.assertRaises(ValueError):ucd.validate(ucd.merge(self.spec,patch))

    def test_asset_copy_and_image(self):
        import base64
        image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=')
        source=self.base/'source.png';source.write_bytes(image)
        spec=copy.deepcopy(self.spec);spec['assets']=[{'source':str(source),'name':'banner.png'}]
        spec['blocks']={'cover':{'type':'image','title':'封面','src':'assets/banner.png','alt':'本地封面'}}
        out=self.base/'image';ucd.build(spec,out)
        self.assertEqual((out/'assets/banner.png').read_bytes(),image);self.assertTrue(ucd.check(out)['ok'])

    def test_bounded_source_scan_excludes_secrets_dependencies_and_links(self):
        src=self.base/'src';src.mkdir();(src/'node_modules').mkdir()
        (src/'node_modules/ignored.ts').write_text('title: "dependency"',encoding='utf-8')
        (src/'credentials.ts').write_text('title: "secret"',encoding='utf-8')
        (src/'.env').write_text('SECRET=hidden',encoding='utf-8')
        (src/'view.vue').write_text('<template><h1>申请管理</h1><label>名称</label></template>'*200,encoding='utf-8')
        report=self.base/'scan.json';ucd.inspect_source(src,report,max_files=1,max_bytes=1000)
        result=ucd.read_json(report)
        self.assertEqual([r['path'] for r in result['files']],['view.vue'])
        self.assertLessEqual(result['bytesRead'],1000);self.assertTrue(result['files'][0]['partial'])

    def test_csp_resources_and_inline_event_audit(self):
        out=self.base/'audit';ucd.build(self.spec,out)
        files={'index.html':(out/'index.html').read_bytes()}
        for extra in ('<img src="https://example.invalid/x">','<iframe></iframe>','<button onclick="alert(1)">x</button>','<style>x{background:url(https://x)}</style>'):
            bad={**files,'index.html':files['index.html']+extra.encode()}
            self.assertTrue(ucd.audit(bad))

    def test_mode_migration_requires_new_directory(self):
        out=self.base/'mode';ucd.build(self.spec,out)
        with self.assertRaisesRegex(ValueError,'切换模式'):ucd.build(self.spec,out,'editable')

    def test_network_paths_rejected_before_io(self):
        for value in ('https://example.invalid/file.png','//remote/share','\\\\remote\\share'):
            with self.assertRaisesRegex(ValueError,'本地磁盘'):ucd.local_path(value)

    def test_previous_spec_retained_after_direct_json_edit(self):
        out=self.base/'history';ucd.build(self.spec,out)
        changed=copy.deepcopy(self.spec);changed['title']='新标题'
        (out/'page.json').write_text(ucd.json_text(changed),encoding='utf-8');ucd.build(changed,out)
        saved=next((out/'.history').glob('*/page.json'))
        self.assertEqual(ucd.read_json(saved)['title'],self.spec['title'])


if __name__=='__main__':unittest.main()

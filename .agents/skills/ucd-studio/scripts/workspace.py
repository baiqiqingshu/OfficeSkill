"""Prepare portable configuration projects and build from an isolated copy."""
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT/'assets/workspace'
spec = importlib.util.spec_from_file_location('ucd_project_engine', TEMPLATE/'build.py')
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)

TEMPLATES = ('crud', 'tree-table', 'dashboard', 'approval', 'settings')


def raw_catalog():
    return engine.read_json(TEMPLATE, 'registry.json')


def component_catalog(name=None):
    catalog = raw_catalog()
    if name is not None:
        engine.require(name in catalog, f'未知内置组件：{name}；可选：{", ".join(catalog)}')
        entry = catalog[name]
        return {
            'name': name,
            'file': entry['file'],
            'dependencies': entry.get('dependencies', []),
            'description': entry.get('description', ''),
            'example': entry.get('example', {'component': name, 'props': {}}),
        }
    return {
        key: {
            'dependencies': entry.get('dependencies', []),
            'description': entry.get('description', ''),
        }
        for key, entry in catalog.items()
    }


def extract_builtin_source(name, entry):
    bundle = entry.get('bundle')
    if bundle:
        bundle_path = TEMPLATE / bundle
        engine.require(bundle_path.is_file(), f'内置组件包缺失：{bundle}')
        text = bundle_path.read_text(encoding='utf-8-sig')
        pattern = re.compile(
            rf'//\s*@component:\s*{re.escape(name)}\s*\r?\n(.*?)\r?\n//\s*@end:\s*{re.escape(name)}(?:\s*$|\r?\n)',
            re.S,
        )
        match = pattern.search(text)
        engine.require(match is not None, f'组件包 {bundle} 中找不到组件块：{name}')
        return (match.group(1).strip() + '\n').encode('utf-8')
    path = TEMPLATE / entry['file']
    engine.require(path.is_file(), f'内置组件文件缺失：{entry["file"]}')
    return path.read_bytes()


def parse_scalar(raw):
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def navigate_parent(root, path):
    parts = [p for p in path.strip().split('.') if p]
    engine.require(bool(parts), f'无效字段路径：{path}')
    cursor = root
    for part in parts[:-1]:
        if isinstance(cursor, list):
            engine.require(part.isdigit() and int(part) < len(cursor), f'数组索引不存在：{path}')
            cursor = cursor[int(part)]
        else:
            engine.require(isinstance(cursor, dict), f'路径经过非对象值：{path}')
            cursor = cursor.setdefault(part, {})
    return cursor, parts[-1]


def apply_sets(value, pairs):
    """Set object paths and existing array indexes without replacing whole arrays."""
    result = json.loads(json.dumps(value, ensure_ascii=False))
    for pair in pairs:
        engine.require('=' in pair, '--set 需要 path=value')
        key, raw = pair.split('=', 1)
        parsed = parse_scalar(raw)
        cursor, last = navigate_parent(result, key)
        if isinstance(cursor, list):
            engine.require(last.isdigit() and int(last) < len(cursor), f'数组索引不存在：{key}')
            cursor[int(last)] = parsed
        else:
            engine.require(isinstance(cursor, dict), f'路径经过非对象值：{key}')
            cursor[last] = parsed
    return result


def apply_mutations(value, sets=None, appends=None, removes=None):
    result = apply_sets(value, sets or [])
    for pair in appends or []:
        engine.require('=' in pair, '--append 需要 path=value')
        key, raw = pair.split('=', 1)
        parsed = parse_scalar(raw)
        cursor, last = navigate_parent(result, key)
        if isinstance(cursor, list):
            engine.require(last.isdigit() and int(last) < len(cursor), f'数组索引不存在：{key}')
            target = cursor[int(last)]
        else:
            engine.require(isinstance(cursor, dict), f'路径经过非对象值：{key}')
            target = cursor.setdefault(last, [])
        engine.require(isinstance(target, list), f'--append 目标不是数组：{key}')
        target.append(parsed)
    for key in removes or []:
        cursor, last = navigate_parent(result, key)
        if isinstance(cursor, list):
            if last.isdigit():
                idx = int(last)
                engine.require(idx < len(cursor), f'数组索引不存在：{key}')
                cursor.pop(idx)
            else:
                engine.require(last in cursor, f'数组中找不到元素：{key}')
                cursor.remove(last)
        else:
            engine.require(isinstance(cursor, dict) and last in cursor, f'字段不存在：{key}')
            del cursor[last]
    return result


def workspace_entry(entry):
    clean = {'file': entry['file'], 'dependencies': list(entry.get('dependencies', []))}
    if entry.get('css'):
        clean['css'] = entry['css']
    return clean


def prepare(directory):
    root = engine.local_root(directory)
    app, pages, data, registry = engine.load_project(root)
    available = raw_catalog()
    merged = {**available, **registry}
    order = engine.dependency_order(pages, merged)
    for name in order:
        entry = merged[name]
        destination = engine.source_path(root, entry['file'])
        if not destination.exists():
            engine.require(name in available and entry['file'] == available[name]['file'], f'自定义组件缺少文件：{entry["file"]}')
            engine.atomic_write(destination, extract_builtin_source(name, available[name]))
        registry[name] = workspace_entry(entry)
    engine.atomic_write(root/'components.json', engine.json_bytes(registry))
    return root


def template_bundle(template):
    engine.require(template in TEMPLATES, f'未知模板：{template}；可选：{", ".join(TEMPLATES)}')
    if template == 'tree-table':
        return {
            'app': {
                'version': 1, 'title': '组织与成员管理', 'workspace': '企业通讯录',
                'user': '陈默', 'userRole': '系统管理员', 'style': 'ocean',
                'density': 'compact', 'shell': 'sidebar', 'startPage': 'directory',
                'pages': {'directory': 'pages/directory.json', 'roles': 'pages/roles.json'},
                'data': {'members': 'data/members.json'}, 'assets': {},
            },
            'pages': {
                'directory': {
                    'title': '组织成员', 'icon': 'users', 'group': '组织权限',
                    'description': '左侧按部门筛选组织成员，右侧支持搜索、编辑、停用与批量调整。',
                    'content': [
                        {'component': 'stats', 'id': 'member-stats', 'props': {'items': [
                            {'label': '在职成员', 'data': 'members', 'icon': 'users', 'hint': '点击查看全部', 'action': {'type': 'filter', 'target': 'members-table', 'field': 'status', 'value': '', 'reset': True}},
                            {'label': '正常启用', 'data': 'members', 'field': 'status', 'equals': '正常', 'tone': 'success', 'icon': 'check-circle', 'hint': '账号可用', 'action': {'type': 'filter', 'target': 'members-table', 'field': 'status', 'value': '正常'}},
                            {'label': '待激活', 'data': 'members', 'field': 'status', 'equals': '待激活', 'tone': 'warning', 'icon': 'clock', 'hint': '未首次登录', 'action': {'type': 'filter', 'target': 'members-table', 'field': 'status', 'value': '待激活'}},
                            {'label': '已停用', 'data': 'members', 'field': 'status', 'equals': '已停用', 'tone': 'danger', 'icon': 'shield', 'hint': '权限已收回', 'action': {'type': 'filter', 'target': 'members-table', 'field': 'status', 'value': '已停用'}},
                        ]}},
                        {'component': 'split', 'id': 'org-split', 'props': {'columns': ['256px', 'minmax(0,1fr)']}, 'slots': {
                            'left': {'component': 'tree', 'id': 'dept-tree', 'props': {
                                'title': '部门架构', 'allLabel': '全部部门', 'target': 'members-table', 'filterField': 'department',
                                'items': [
                                    {'id': 'rd', 'label': '研发部', 'count': 3, 'children': [
                                        {'id': 'platform', 'label': '平台研发', 'count': 2},
                                        {'id': 'qa', 'label': '质量保障', 'count': 1},
                                    ]},
                                    {'id': 'product', 'label': '产品部', 'count': 2},
                                    {'id': 'ops', 'label': '运营部', 'count': 2},
                                ],
                            }},
                            'right': {'component': 'table', 'id': 'members-table', 'props': {
                                'title': '成员列表', 'description': '支持按部门树联动筛选、关键字检索及快速维护角色状态。',
                                'data': 'members', 'rowKey': 'id', 'pageSize': 6,
                                'fields': [
                                    {'key': 'name', 'label': '姓名', 'required': True},
                                    {'key': 'account', 'label': '工号', 'width': '100px', 'required': True},
                                    {'key': 'department', 'label': '所属部门', 'width': '110px', 'type': 'select', 'options': ['研发部', '平台研发', '质量保障', '产品部', '运营部']},
                                    {'key': 'role', 'label': '角色', 'width': '110px', 'type': 'select', 'options': ['系统管理员', '部门主管', '普通成员']},
                                    {'key': 'email', 'label': '邮箱', 'type': 'email'},
                                    {'key': 'status', 'label': '状态', 'width': '105px', 'type': 'select', 'default': '正常', 'options': ['正常', '待激活', '已停用'], 'tones': {'正常': 'success', '待激活': 'warning', '已停用': 'danger'}},
                                ],
                                'columns': ['name', 'account', 'department', 'role', 'status'],
                                'filters': ['name', 'role', 'status'],
                                'actions': [{'type': 'create', 'label': '新增成员', 'primary': True}],
                                'rowActions': ['detail', 'edit', {'type': 'update', 'label': '停用', 'values': {'status': '已停用'}, 'when': {'field': 'status', 'equals': '正常'}}, 'delete'],
                                'batchActions': [{'type': 'update', 'label': '批量启用', 'values': {'status': '正常'}, 'primary': True}, {'type': 'delete', 'label': '批量移除', 'danger': True}],
                            }},
                        }},
                    ],
                },
                'roles': {
                    'title': '权限概览', 'icon': 'shield', 'group': '组织权限',
                    'description': '查看角色分布与安全配置说明。',
                    'content': [
                        {'component': 'split', 'props': {'columns': [6, 6]}, 'slots': {
                            'left': {'component': 'bar-chart', 'props': {'title': '各部门人数分布', 'data': 'members', 'groupBy': 'department', 'unit': ' 人'}},
                            'right': {'component': 'bar-chart', 'props': {'title': '角色分布', 'data': 'members', 'groupBy': 'role', 'unit': ' 人'}},
                        }},
                        {'component': 'alert', 'props': {'title': '权限提示', 'text': '所有成员变更仅在本地浏览器内存中生效，用于需求与交互评审。', 'tone': 'primary'}},
                    ],
                },
            },
            'data': {
                'members': [
                    {'id': 'U-101', 'name': '陈晨', 'account': 'E10021', 'department': '平台研发', 'role': '部门主管', 'email': 'chenchen@corp.local', 'status': '正常'},
                    {'id': 'U-102', 'name': '林晓', 'account': 'E10022', 'department': '产品部', 'role': '系统管理员', 'email': 'linxiao@corp.local', 'status': '正常'},
                    {'id': 'U-103', 'name': '周亦', 'account': 'E10023', 'department': '运营部', 'role': '普通成员', 'email': 'zhouyi@corp.local', 'status': '正常'},
                    {'id': 'U-104', 'name': '王宁', 'account': 'E10024', 'department': '平台研发', 'role': '普通成员', 'email': 'wangning@corp.local', 'status': '待激活'},
                    {'id': 'U-105', 'name': '李然', 'account': 'E10025', 'department': '质量保障', 'role': '普通成员', 'email': 'liran@corp.local', 'status': '正常'},
                    {'id': 'U-106', 'name': '张若', 'account': 'E10026', 'department': '产品部', 'role': '部门主管', 'email': 'zhangruo@corp.local', 'status': '正常'},
                    {'id': 'U-107', 'name': '赵清', 'account': 'E10027', 'department': '运营部', 'role': '普通成员', 'email': 'zhaoqing@corp.local', 'status': '已停用'},
                ],
            },
        }
    if template == 'dashboard':
        return {
            'app': {
                'version': 1, 'title': '运营效能控制台', 'workspace': '管理驾驶舱',
                'user': '苏航', 'userRole': '运营负责人', 'style': 'ocean',
                'density': 'compact', 'shell': 'sidebar', 'startPage': 'overview',
                'pages': {'overview': 'pages/overview.json', 'tasks': 'pages/tasks.json'},
                'data': {'tasks': 'data/tasks.json'}, 'assets': {},
            },
            'pages': {
                'overview': {
                    'title': '运行总览', 'icon': 'dashboard', 'group': '监测分析',
                    'description': '实时掌握核心指标、趋势走势、资源水位与最新操作动态。',
                    'content': [
                        {'component': 'stats', 'id': 'kpi', 'props': {'items': [
                            {'label': '本周工单量', 'value': '142', 'change': '↑ 12.4%', 'trend': 'up', 'icon': 'layers', 'hint': '较上周 +16'},
                            {'label': '按时履约率', 'value': '96.8%', 'change': '↑ 1.2%', 'trend': 'up', 'tone': 'success', 'icon': 'check-circle', 'hint': '目标 95%'},
                            {'label': '平均响应时长', 'value': '18m', 'change': '↓ 4m', 'trend': 'up', 'icon': 'clock', 'hint': '达标区间'},
                            {'label': '待处理告警', 'value': '3', 'change': '高优 1', 'trend': 'down', 'tone': 'warning', 'icon': 'bell', 'hint': '需今日闭环'},
                        ]}},
                        {'component': 'split', 'props': {'columns': [7, 5]}, 'slots': {
                            'left': {'component': 'line-chart', 'props': {
                                'title': '近 7 日工单处理趋势', 'summary': '142 单', 'change': '↑ 12.4%', 'trend': 'up',
                                'labels': ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
                                'values': [18, 22, 19, 26, 28, 14, 15],
                            }},
                            'right': {'component': 'bar-chart', 'props': {
                                'title': '服务分类占比', 'unit': '%',
                                'items': [
                                    {'label': '权限开通', 'value': 38, 'tone': 'primary'},
                                    {'label': '环境扩容', 'value': 29, 'tone': 'success'},
                                    {'label': '故障排查', 'value': 21, 'tone': 'warning'},
                                    {'label': '数据导出', 'value': 12},
                                ],
                            }},
                        }},
                        {'component': 'split', 'props': {'columns': [5, 7]}, 'slots': {
                            'left': {'component': 'progress', 'props': {'title': 'SLA 达成进度', 'items': [
                                {'label': 'P1 故障 30 分钟响应', 'value': 98, 'tone': 'success'},
                                {'label': '常规需求 24 小时办结', 'value': 89},
                                {'label': '月度巡检完成率', 'value': 74, 'tone': 'warning'},
                            ]}},
                            'right': {'component': 'timeline', 'props': {'title': '最新处理动态', 'items': [
                                {'title': '完成「核心数据库只读实例扩容」交付', 'time': '10:35', 'description': '运维组 · SLA 内完成', 'tone': 'success'},
                                {'title': '触发「日志归档磁盘水位 82%」预警', 'time': '09:50', 'description': '监控中心 · 已指派处理人', 'tone': 'warning'},
                                {'title': '发布「11 月权限合规审计清单」', 'time': '昨天 18:10', 'description': '安全合规组 · 共 24 项', 'tone': 'primary'},
                            ]}},
                        }},
                        {'component': 'cards', 'props': {'title': '快捷入口', 'items': [
                            {'title': '待办工单队列', 'description': '查看并流转当前处理中的工单', 'icon': 'kanban', 'badge': '实时', 'action': {'type': 'navigate', 'page': 'tasks', 'label': '进入看板'}},
                            {'title': '导出周报快照', 'description': '汇总本周 SLA 与处理量指标', 'icon': 'file', 'action': {'type': 'toast', 'label': '生成周报', 'message': '已生成本地周报草稿'}},
                            {'title': '告警规则核查', 'description': '复核关键阈值与值班通知人', 'icon': 'shield', 'action': {'type': 'toast', 'label': '立即检查', 'message': '全部 12 条核心规则运行正常'}},
                        ]}},
                    ],
                },
                'tasks': {
                    'title': '工单看板', 'icon': 'kanban', 'group': '监测分析',
                    'description': '按处理阶段查看工单，支持卡片内下拉直接流转状态。',
                    'content': [
                        {'component': 'kanban', 'id': 'task-board', 'props': {
                            'title': '本周工单流转', 'data': 'tasks', 'groupField': 'status',
                            'columns': [
                                {'value': '待受理', 'label': '待受理', 'tone': 'warning'},
                                {'value': '处理中', 'label': '处理中', 'tone': 'primary'},
                                {'value': '已完成', 'label': '已完成', 'tone': 'success'},
                            ],
                            'titleField': 'title', 'tagField': 'category', 'metaFields': ['owner', 'due'],
                        }},
                    ],
                },
            },
            'data': {
                'tasks': [
                    {'id': 'T-1', 'title': '核心库只读副本扩容', 'category': '环境扩容', 'owner': '王宁', 'due': '11-23', 'status': '处理中'},
                    {'id': 'T-2', 'title': '日志磁盘水位治理', 'category': '故障排查', 'owner': '陈晨', 'due': '11-22', 'status': '待受理'},
                    {'id': 'T-3', 'title': '财务报表只读权限开通', 'category': '权限开通', 'owner': '周亦', 'due': '11-24', 'status': '待受理'},
                    {'id': 'T-4', 'title': '月度脱敏数据导出复核', 'category': '数据导出', 'owner': '林晓', 'due': '11-21', 'status': '已完成'},
                ],
            },
        }
    if template == 'approval':
        return {
            'app': {
                'version': 1, 'title': '流程审批中心', 'workspace': '审批工作台',
                'user': '林晓', 'userRole': '审批人', 'style': 'jade',
                'density': 'compact', 'shell': 'sidebar', 'startPage': 'queue',
                'pages': {'queue': 'pages/queue.json', 'board': 'pages/board.json'},
                'data': {'approvals': 'data/approvals.json'}, 'assets': {},
            },
            'pages': {
                'queue': {
                    'title': '待我审批', 'icon': 'check-circle', 'group': '审批流转',
                    'description': '核对流程节点与申请明细，快速完成通过或退回操作。',
                    'content': [
                        {'component': 'steps', 'id': 'flow-steps', 'props': {
                            'title': '标准审批流', 'current': 1,
                            'items': [
                                {'title': '发起申请', 'description': '填写表单并附依据'},
                                {'title': '主管审核', 'description': '当前阶段'},
                                {'title': '合规复核', 'description': '高额/敏感项'},
                                {'title': '执行归档', 'description': '自动留痕'},
                            ],
                        }},
                        {'component': 'table', 'id': 'approvals-table', 'props': {
                            'title': '审批队列', 'data': 'approvals', 'rowKey': 'id', 'pageSize': 6,
                            'fields': [
                                {'key': 'id', 'label': '单号', 'width': '110px', 'readonly': True},
                                {'key': 'title', 'label': '审批事项', 'required': True},
                                {'key': 'applicant', 'label': '发起人', 'width': '100px', 'required': True},
                                {'key': 'amount', 'label': '预算(元)', 'type': 'number', 'width': '110px'},
                                {'key': 'status', 'label': '状态', 'width': '110px', 'type': 'select', 'default': '待审批', 'options': ['待审批', '已通过', '已退回'], 'tones': {'待审批': 'warning', '已通过': 'success', '已退回': 'danger'}},
                                {'key': 'reason', 'label': '说明', 'type': 'textarea'},
                            ],
                            'columns': ['id', 'title', 'applicant', 'amount', 'status'],
                            'filters': ['title', 'status'],
                            'actions': [{'type': 'create', 'label': '发起审批', 'primary': True}],
                            'rowActions': [
                                'detail',
                                {'type': 'update', 'label': '通过', 'values': {'status': '已通过'}, 'when': {'field': 'status', 'equals': '待审批'}},
                                {'type': 'update', 'label': '退回', 'values': {'status': '已退回'}, 'confirm': '确认退回该审批单？', 'when': {'field': 'status', 'equals': '待审批'}},
                            ],
                            'batchActions': [{'type': 'update', 'label': '批量通过', 'values': {'status': '已通过'}, 'primary': True}],
                        }},
                    ],
                },
                'board': {
                    'title': '流转看板', 'icon': 'kanban', 'group': '审批流转',
                    'description': '按审批状态直观查看全部单据并调整流转状态。',
                    'content': [
                        {'component': 'kanban', 'id': 'approval-board', 'props': {
                            'title': '审批单状态看板', 'data': 'approvals', 'groupField': 'status',
                            'columns': [
                                {'value': '待审批', 'label': '待审批', 'tone': 'warning'},
                                {'value': '已通过', 'label': '已通过', 'tone': 'success'},
                                {'value': '已退回', 'label': '已退回', 'tone': 'danger'},
                            ],
                            'titleField': 'title', 'metaFields': ['applicant', 'amount'],
                        }},
                    ],
                },
            },
            'data': {
                'approvals': [
                    {'id': 'AP-201', 'title': '测试集群年度续费', 'applicant': '陈晨', 'amount': 48000, 'status': '待审批', 'reason': '覆盖 Q4 联调与压测需求。'},
                    {'id': 'AP-202', 'title': '安全漏洞扫描工具采购', 'applicant': '王宁', 'amount': 32000, 'status': '待审批', 'reason': '内网离线部署年度授权。'},
                    {'id': 'AP-203', 'title': '团队培训教材费', 'applicant': '李然', 'amount': 5600, 'status': '已通过', 'reason': '前端工程化与架构设计书籍。'},
                ],
            },
        }
    if template == 'settings':
        return {
            'app': {
                'version': 1, 'title': '系统配置中心', 'workspace': '平台运维',
                'user': '管理员', 'userRole': '超级管理员', 'style': 'slate',
                'density': 'compact', 'shell': 'sidebar', 'startPage': 'general',
                'pages': {'general': 'pages/general.json'}, 'data': {}, 'assets': {},
            },
            'pages': {
                'general': {
                    'title': '系统设置', 'icon': 'settings',
                    'description': '集中配置站点参数、安全策略与消息通知开关。',
                    'content': [
                        {'component': 'alert', 'props': {'title': '配置说明', 'text': '修改将在点击“保存配置”后生效于当前演示会话。', 'tone': 'primary'}},
                        {'component': 'tabs', 'id': 'settings-tabs', 'props': {
                            'items': [{'key': 'basic', 'label': '基础参数'}, {'key': 'security', 'label': '安全与审计'}],
                        }, 'slots': {
                            'basic': {'component': 'form', 'id': 'basic-form', 'props': {
                                'submitLabel': '保存配置',
                                'sections': [
                                    {'title': '站点信息', 'description': '用于内网门户展示与通知落款。', 'fields': [
                                        {'key': 'siteName', 'label': '系统名称', 'default': '企业协同平台', 'required': True},
                                        {'key': 'env', 'label': '运行环境', 'type': 'radio', 'default': '内网生产', 'options': ['内网生产', '预发布', '测试环境']},
                                        {'key': 'retention', 'label': '日志保留天数', 'type': 'number', 'default': 90, 'min': 7, 'max': 365},
                                        {'key': 'timezone', 'label': '默认时区', 'type': 'select', 'default': 'Asia/Shanghai', 'options': ['Asia/Shanghai', 'UTC']},
                                    ]},
                                    {'title': '通知渠道', 'fields': [
                                        {'key': 'notifyChannels', 'label': '启用的提醒方式', 'type': 'tags', 'default': ['站内信', '邮件'], 'options': ['站内信', '邮件', 'IM 机器人', '短信']},
                                        {'key': 'autoArchive', 'label': '超时工单自动归档', 'type': 'switch', 'default': True},
                                        {'key': 'maintenance', 'label': '开启维护公告模式', 'type': 'switch', 'default': False},
                                    ]},
                                ],
                            }},
                            'security': {'component': 'form', 'id': 'security-form', 'props': {
                                'submitLabel': '保存安全策略',
                                'fields': [
                                    {'key': 'sessionTimeout', 'label': '会话超时（分钟）', 'type': 'number', 'default': 60, 'min': 10, 'max': 480},
                                    {'key': 'mfa', 'label': '强制双因素认证', 'type': 'switch', 'default': True},
                                    {'key': 'auditExport', 'label': '导出数据需二次审批', 'type': 'switch', 'default': True},
                                    {'key': 'ipAllowlist', 'label': '内网白名单网段', 'type': 'textarea', 'default': '10.0.0.0/8\n172.16.0.0/12'},
                                ],
                            }},
                        }},
                    ],
                },
            },
            'data': {},
        }
    return None


def scaffold_runtime(root):
    shutil.copyfile(TEMPLATE/'build.py', root/'build.py')
    shutil.copytree(TEMPLATE/'runtime', root/'runtime')
    shutil.copyfile(ROOT/'data/styles.json', root/'runtime/themes.json')
    engine.atomic_write(root/'project.json', engine.json_bytes({'format': 1, 'engineVersion': engine.VERSION}))


def create(directory, config=None, title=None, style=None, template='crud', shell=None, density=None, from_spec=None):
    root = engine.local_root(directory)
    engine.require(not root.exists() or root.is_dir() and not any(root.iterdir()), 'project 仅允许新目录或空目录')
    root.mkdir(parents=True, exist_ok=True)
    scaffold_runtime(root)
    if from_spec is not None:
        engine.require(isinstance(from_spec, dict), '--from-spec 必须是 JSON 对象（包含 app/pages/data）')
        app = {'version': 1, 'title': '后台管理系统', 'style': 'ocean', 'density': 'compact', 'shell': 'sidebar', 'pages': {}, 'data': {}, 'assets': {}}
        app.update(from_spec.get('app', {}))
        pages_in = from_spec.get('pages', {})
        engine.require(isinstance(pages_in, dict) and len(pages_in) > 0, '--from-spec 需要非空 pages 映射')
        app['pages'] = {}
        for page_id, page_obj in pages_in.items():
            rel = f'pages/{page_id}.json'
            engine.atomic_write(engine.source_path(root, rel), engine.json_bytes(page_obj))
            app['pages'][page_id] = rel
        data_in = from_spec.get('data', {})
        engine.require(isinstance(data_in, dict), '--from-spec.data 必须是对象')
        app['data'] = {}
        for data_id, rows in data_in.items():
            rel = f'data/{data_id}.json'
            engine.atomic_write(engine.source_path(root, rel), engine.json_bytes(rows))
            app['data'][data_id] = rel
        registry = {}
        for comp_name, comp_def in from_spec.get('components', {}).items():
            if isinstance(comp_def, str):
                rel = f'components/{comp_name}.js'
                engine.atomic_write(engine.source_path(root, rel), (comp_def.rstrip() + '\n').encode('utf-8'))
                registry[comp_name] = {'file': rel, 'dependencies': []}
            elif isinstance(comp_def, dict):
                rel = comp_def.get('file', f'components/{comp_name}.js')
                if 'code' in comp_def:
                    engine.atomic_write(engine.source_path(root, rel), (comp_def['code'].rstrip() + '\n').encode('utf-8'))
                entry = {'file': rel, 'dependencies': list(comp_def.get('dependencies', []))}
                if 'cssCode' in comp_def:
                    css_rel = comp_def.get('css', f'components/{comp_name}.css')
                    engine.atomic_write(engine.source_path(root, css_rel), (comp_def['cssCode'].rstrip() + '\n').encode('utf-8'))
                    entry['css'] = css_rel
                registry[comp_name] = entry
        app.setdefault('startPage', next(iter(app['pages'])))
        engine.atomic_write(root/'components.json', engine.json_bytes(registry))
        engine.atomic_write(root/'app.json', engine.json_bytes(app))
    elif template == 'crud' or not template:
        for path in (TEMPLATE/'starter').rglob('*'):
            if path.is_file():
                target = root/path.relative_to(TEMPLATE/'starter')
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
    else:
        bundle = template_bundle(template)
        engine.atomic_write(root/'app.json', engine.json_bytes(bundle['app']))
        engine.atomic_write(root/'components.json', engine.json_bytes({}))
        for page_id, page_obj in bundle['pages'].items():
            engine.atomic_write(root/'pages'/f'{page_id}.json', engine.json_bytes(page_obj))
        for data_id, rows in bundle['data'].items():
            engine.atomic_write(root/'data'/f'{data_id}.json', engine.json_bytes(rows))

    app = engine.read_json(root, 'app.json')
    if config:
        config_path = engine.local_root(config)
        base = config_path.parent
        override = json.loads(config_path.read_text(encoding='utf-8-sig'))
        engine.require(isinstance(override, dict), '--config 必须是 app.json 的对象补丁')
        app.update(override)
        registry = engine.read_json(root, 'components.json')
        if (base/'components.json').is_file():
            registry.update(engine.read_json(base, 'components.json'))
        engine.atomic_write(root/'components.json', engine.json_bytes(registry))
        # Only copy explicitly referenced files; never import the surrounding project.
        names = list(app.get('pages', {}).values()) + list(app.get('data', {}).values()) + list(app.get('assets', {}).values())
        for name in names:
            source = engine.source_path(base, name)
            if source.is_file():
                engine.atomic_write(engine.source_path(root, name), source.read_bytes())
        engine.atomic_write(root/'app.json', engine.json_bytes(app))
        _, pages, records, _ = engine.load_project(root)
        merged = {**raw_catalog(), **registry}
        for name in engine.dependency_order(pages, merged):
            for key in ('file', 'css'):
                filename = merged[name].get(key)
                if filename:
                    source = engine.source_path(base, filename)
                    if source.is_file():
                        engine.atomic_write(engine.source_path(root, filename), source.read_bytes())

        def copy_assets(value):
            if isinstance(value, str) and value.startswith('assets/'):
                source = engine.source_path(base, value)
                if source.is_file():
                    engine.atomic_write(engine.source_path(root, value), source.read_bytes())
            elif isinstance(value, dict):
                for child in value.values():
                    copy_assets(child)
            elif isinstance(value, list):
                for child in value:
                    copy_assets(child)

        copy_assets(pages)
        copy_assets(records)
    if title is not None:
        app['title'] = title
    if style is not None:
        app['style'] = style
    if shell is not None:
        app['shell'] = shell
    if density is not None:
        app['density'] = density
    engine.atomic_write(root/'app.json', engine.json_bytes(app))
    return build_project(root)


def add_page(directory, page_id, title, template='blank', icon=None, group=None, page_spec=None):
    root = engine.local_root(directory)
    engine.require(engine.IDENTIFIER.fullmatch(page_id) is not None, f'非法页面 id：{page_id}（需小写字母开头的字母/数字/短横线）')
    app = engine.read_json(root, 'app.json')
    engine.require(page_id not in app.get('pages', {}), f'页面已存在：{page_id}')
    rel = f'pages/{page_id}.json'
    if page_spec is not None:
        page = dict(page_spec)
        page.setdefault('title', title)
        page.setdefault('content', [])
    elif template == 'blank':
        page = {'title': title, 'description': '', 'content': [{'component': 'panel', 'id': f'{page_id}-panel', 'props': {'title': title}, 'slots': {'default': {'component': 'alert', 'props': {'text': f'在此配置「{title}」页面内容。', 'tone': 'primary'}}}}]}
    elif template == 'crud':
        data_key = page_id
        if data_key not in app.get('data', {}):
            app.setdefault('data', {})[data_key] = f'data/{data_key}.json'
            engine.atomic_write(engine.source_path(root, f'data/{data_key}.json'), engine.json_bytes([
                {'id': '1001', 'name': f'{title}示例 1', 'owner': '林晓', 'status': '待处理', 'date': '2026-11-22'},
                {'id': '1002', 'name': f'{title}示例 2', 'owner': '陈晨', 'status': '已完成', 'date': '2026-11-21'},
            ]))
        page = {
            'title': title, 'description': f'查询、筛选与维护{title}记录。',
            'content': [{'component': 'table', 'id': f'{page_id}-table', 'props': {
                'title': f'{title}列表', 'data': data_key, 'pageSize': 8,
                'fields': [
                    {'key': 'name', 'label': '名称', 'required': True},
                    {'key': 'owner', 'label': '负责人', 'width': '110px'},
                    {'key': 'date', 'label': '日期', 'type': 'date', 'width': '130px'},
                    {'key': 'status', 'label': '状态', 'width': '110px', 'type': 'select', 'default': '待处理', 'options': ['待处理', '处理中', '已完成'], 'tones': {'待处理': 'warning', '处理中': 'primary', '已完成': 'success'}},
                ],
                'columns': ['name', 'owner', 'date', 'status'],
                'filters': ['name', 'status'],
                'actions': [{'type': 'create', 'label': f'新建{title}', 'primary': True}],
                'rowActions': ['detail', 'edit', 'delete'],
            }}],
        }
    else:
        bundle = template_bundle(template)
        first_page_key = next(iter(bundle['pages']))
        page = json.loads(json.dumps(bundle['pages'][first_page_key], ensure_ascii=False))
        page['title'] = title
        for dkey, drows in bundle['data'].items():
            if dkey not in app.get('data', {}):
                app.setdefault('data', {})[dkey] = f'data/{dkey}.json'
                engine.atomic_write(engine.source_path(root, f'data/{dkey}.json'), engine.json_bytes(drows))
    if icon:
        page['icon'] = icon
    if group:
        page['group'] = group
    engine.atomic_write(engine.source_path(root, rel), engine.json_bytes(page))
    app.setdefault('pages', {})[page_id] = rel
    engine.atomic_write(root/'app.json', engine.json_bytes(app))
    result = build_project(root)
    result['addedPage'] = {'id': page_id, 'file': rel}
    return result


def add_component(directory, name, dependencies=None, with_css=False):
    root = engine.local_root(directory)
    engine.require(engine.IDENTIFIER.fullmatch(name) is not None, f'非法组件名称：{name}（需小写字母开头的字母/数字/短横线）')
    registry = engine.read_json(root, 'components.json')
    engine.require(name not in registry and name not in raw_catalog(), f'组件已存在或与内置组件重名：{name}')
    deps = [d.strip() for d in (dependencies or []) if d.strip()]
    js_rel = f'components/{name}.js'
    js_code = (
        f"UCD.register('{name}', {{\n"
        f"  render(props, ctx) {{\n"
        f"    return `<section class=\"panel {name}-panel\"><div class=\"panel-body\"><h3>${{ctx.escape(props.title || '{name}')}}</h3>${{ctx.slot()}}</div></section>`;\n"
        f"  }},\n"
        f"  mount(root, props, ctx) {{\n"
        f"    // 在 root 内绑定交互事件；如绑定外部监听器请返回清理函数。\n"
        f"  }}\n"
        f"}});\n"
    )
    engine.atomic_write(engine.source_path(root, js_rel), js_code.encode('utf-8'))
    entry = {'file': js_rel, 'dependencies': deps}
    created = [js_rel]
    if with_css:
        css_rel = f'components/{name}.css'
        css_code = f".{name}-panel h3 {{ margin-bottom: 8px; }}\n"
        engine.atomic_write(engine.source_path(root, css_rel), css_code.encode('utf-8'))
        entry['css'] = css_rel
        created.append(css_rel)
    registry[name] = entry
    engine.atomic_write(root/'components.json', engine.json_bytes(registry))
    return {'ok': True, 'component': name, 'files': created, 'entry': entry, 'next': f'在页面 JSON 中添加 {{"component": "{name}", "props": {{}}}} 后运行 build。'}


def build_project(directory, output=None, write_manifest=None):
    root = prepare(directory)
    target = engine.local_root(output or root/'index.html')
    emit_manifest = (output is None) if write_manifest is None else bool(write_manifest)
    engine.verify_output(target)
    *_, sources = engine.collect(root)
    source_paths = [root/name for name in sources]
    engine.require(target not in source_paths and target.with_suffix('.manifest.json') not in source_paths, 'HTML 或清单输出不能覆盖工程源码')
    with tempfile.TemporaryDirectory(prefix='ucd-project-build-') as temporary:
        stage = Path(temporary)
        for name, data in sources.items():
            path = stage/name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        cmd = [sys.executable, '-B', 'build.py']
        if not emit_manifest:
            cmd.append('--no-manifest')
        result = subprocess.run(cmd, cwd=stage, capture_output=True, encoding='utf-8')
        engine.require(result.returncode == 0, result.stderr.strip() or result.stdout.strip() or '临时工程构建失败')
        engine.atomic_write(target, (stage/'index.html').read_bytes())
        if emit_manifest:
            engine.atomic_write(target.with_suffix('.manifest.json'), (stage/'index.manifest.json').read_bytes())
        summary = json.loads(result.stdout)
        summary.update(html=str(target), directory=str(root), staged=True)
        return summary


def summary(directory):
    root = engine.local_root(directory)
    app, pages, data, registry = engine.load_project(root)
    return {
        'mode': 'project', 'title': app['title'], 'style': app.get('style', 'ocean'),
        'shell': app.get('shell', 'sidebar'), 'density': app.get('density', 'compact'),
        'pages': {
            key: {
                'file': app['pages'][key], 'title': page['title'],
                'nodes': [{'id': n.get('id'), 'component': n['component']} for n in engine.nodes_in(page)],
            }
            for key, page in pages.items()
        },
        'data': {key: {'file': app['data'][key], 'rows': len(rows)} for key, rows in data.items()},
        'components': {key: entry['file'] for key, entry in registry.items()},
        'edit': '修改对应 JSON/组件后 build；只有 HTML 时先 unpack，避免编辑 index.html。',
    }


def check(directory):
    root = engine.local_root(directory)
    *_, sources = engine.collect(root)
    html_path = root/'index.html'
    embedded, modified = engine.decode_html(html_path.read_bytes().decode('utf-8'))
    engine.require(sources == embedded, '源码已变化，请先 build')
    return {'ok': True, 'mode': 'project', 'sourceFiles': len(sources), 'html': str(html_path), 'sourceMatches': True}

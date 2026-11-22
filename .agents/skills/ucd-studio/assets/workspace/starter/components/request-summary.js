// 自定义组件示例：复用 stats 并支持点击卡片联动筛选同页列表。
UCD.register('request-summary', {
  render(props, ctx) {
    const filterAction = status => props.target
      ? {type: 'filter', target: props.target, field: 'status', value: status, reset: !status}
      : {type: 'navigate', page: 'requests'};
    return ctx.child('stats', {items: [
      {label: '申请总数', data: props.data, icon: 'layers', hint: '点击查看全部', action: filterAction('')},
      {label: '待我审批', data: props.data, field: 'status', equals: '待审批', tone: 'warning', icon: 'clock', hint: '优先处理', action: filterAction('待审批')},
      {label: '办理中', data: props.data, field: 'status', equals: '处理中', icon: 'chart', hint: '持续跟进', action: filterAction('处理中')},
      {label: '已通过', data: props.data, field: 'status', equals: '已通过', tone: 'success', icon: 'check-circle', hint: '审批已完成', action: filterAction('已通过')}
    ]});
  }
});

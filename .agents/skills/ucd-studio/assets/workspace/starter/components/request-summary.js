// 自定义组件示例：复用 stats，无需修改框架或业务页面 HTML。
UCD.register('request-summary', {
  render(props, ctx) {
    return ctx.child('stats', {items: [
      {label: '申请总数', data: props.data, hint: '当前全部记录'},
      {label: '待我审批', data: props.data, field: 'status', equals: '待审批', tone: 'warning', hint: '优先处理'},
      {label: '办理中', data: props.data, field: 'status', equals: '处理中', hint: '持续跟进'},
      {label: '已通过', data: props.data, field: 'status', equals: '已通过', tone: 'success', hint: '审批已完成'}
    ]});
  }
});

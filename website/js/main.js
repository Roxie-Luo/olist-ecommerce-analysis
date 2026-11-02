/* ============================================================
   Olist 电商数据分析看板 — 图表与交互逻辑
   ============================================================ */
(function () {
  'use strict';

  const D = window.OLIST_DATA;
  if (!D) { console.error('未找到数据 window.OLIST_DATA'); return; }

  /* ---------- 主题色 ---------- */
  const C = {
    primary: '#4f46e5', violet: '#7c3aed', cyan: '#0ea5e9',
    emerald: '#10b981', amber: '#f59e0b', rose: '#ef4444',
    blue: '#3b82f6', pink: '#ec4899',
  };
  const PALETTE = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#7c3aed', '#ef4444', '#ec4899', '#3b82f6', '#14b8a6', '#f97316'];
  const INK = '#18212f', MUTED = '#7a8494', LINE = '#e8ebf1';

  /* ---------- 工具函数 ---------- */
  const fmt = (v) => {
    if (v == null || isNaN(v)) return '—';
    const n = +v, a = Math.abs(n);
    if (a >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
    if (a >= 1e4) return (n / 1e4).toFixed(1) + ' 万';
    return Number(n.toFixed(2)).toLocaleString('zh-CN');
  };
  const money = (v) => 'R$ ' + fmt(v);
  const pct = (v, d = 1) => (+v).toFixed(d) + '%';
  const num = (v, d = 0) => (+v).toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });

  /* 过滤月度数据：从 2017-01 起，排除早期稀疏数据 */
  const monthly = D.monthly.filter(m => m.month >= '2017-01');
  const monthlyDelay = D.monthly_delay.filter(m => m.month >= '2017-01');
  const cohort = D.new_customers_monthly.filter(m => m.month >= '2017-01');

  const MONTHS = monthly.map(m => m.month.slice(2) + '月');
  const MONTHS_FULL = monthly.map(m => m.month);

  /* ---------- 通用 tooltip / 轴样式 ---------- */
  const AXIS_LABEL = { color: MUTED, fontSize: 11.5 };
  const AXIS_LINE = { lineStyle: { color: LINE } };
  const tooltipBase = {
    backgroundColor: 'rgba(24,33,47,.92)',
    borderWidth: 0,
    padding: [8, 12],
    textStyle: { color: '#fff', fontSize: 12.5 },
    extraCssText: 'border-radius:10px;box-shadow:0 10px 30px -10px rgba(0,0,0,.4);',
  };

  const charts = {};
  function initChart(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const c = echarts.init(el);
    charts[id] = c;
    return c;
  }

  /* ============================================================
     KPI
     ============================================================ */
  function renderKpi() {
    const k = D.kpi;
    setHtml('kpi-orders', num(k.delivered_orders));
    setText('kpi-orders-foot', '2016-09 ~ 2018-08');
    setHtml('kpi-sales', money(k.merchandise_sales));
    setHtml('kpi-aov', 'R$ ' + fmt(k.avg_order_value));
    setHtml('kpi-score', (+k.avg_review_score).toFixed(2));
    setText('kpi-score-foot', '低分率 ' + pct(14.69));
    setHtml('kpi-delay', pct(D.delay_rate * 100));
    setText('kpi-delay-foot', '96,470 笔有效订单');
    setHtml('kpi-repeat', pct(D.repeat_rate * 100));
    setText('kpi-repeat-foot', '复购用户 2,801 人');
    setHtml('kpi-users', num(D.active_customers));
    setText('kpi-users-foot', '注册用户 ' + num(k.customers));
    setHtml('kpi-sellers', num(k.sellers));
    setText('kpi-sellers-foot', '商品 ' + num(k.products) + ' · 品类 ' + k.categories);
  }
  function setHtml(id, v) { const e = document.getElementById(id); if (e) e.innerHTML = v; }
  function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

  /* ============================================================
     订单状态分布
     ============================================================ */
  function renderStatus() {
    const c = initChart('chart-status'); if (!c) return;
    const d = D.order_status.slice().sort((a, b) => a.value - b.value);
    const map = { delivered: '已送达', shipped: '已发货', canceled: '已取消', unavailable: '不可用', invoiced: '已开票', processing: '处理中', created: '已创建', approved: '已批准' };
    c.setOption({
      grid: { left: 10, right: 50, top: 8, bottom: 8, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'value', axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef1f6' } } },
      yAxis: { type: 'category', data: d.map(x => map[x.name] || x.name), axisLabel: { ...AXIS_LABEL, color: INK }, axisLine: AXIS_LINE, axisTick: { show: false } },
      series: [{
        type: 'bar', data: d.map(x => x.value), barWidth: 14,
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: C.violet }, { offset: 1, color: C.primary }]), borderRadius: [0, 7, 7, 0] },
        label: { show: true, position: 'right', color: MUTED, fontSize: 11.5, formatter: p => num(p.value) },
      }],
    });
  }

  /* ============================================================
     支付方式构成
     ============================================================ */
  function renderPayment() {
    const c = initChart('chart-payment'); if (!c) return;
    const map = { credit_card: '信用卡', boleto: '账单 Boleto', voucher: '代金券', debit_card: '借记卡', not_defined: '未定义' };
    const d = D.payment_type.filter(x => x.value > 0);
    c.setOption({
      color: PALETTE,
      tooltip: { ...tooltipBase, trigger: 'item', formatter: p => `${p.name}<br/>${money(p.value)} · ${p.percent}%` },
      legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: MUTED, fontSize: 12 } },
      series: [{
        type: 'pie', radius: ['48%', '70%'], center: ['50%', '44%'],
        itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 6 },
        label: { show: false }, emphasis: { label: { show: true, fontSize: 13, fontWeight: 700, color: INK } },
        data: d.map(x => ({ name: map[x.name] || x.name, value: x.value })),
      }],
    });
  }

  /* ============================================================
     月度趋势（可切换）
     ============================================================ */
  function renderTrend(mode) {
    const c = initChart('chart-trend'); if (!c) return;
    const sales = monthly.map(m => m.sales);
    const orders = monthly.map(m => m.orders);
    const aov = monthly.map(m => +(m.sales / m.orders).toFixed(2));
    const base = {
      grid: { left: 10, right: 10, top: 40, bottom: 8, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'cross', label: { backgroundColor: '#3c4656' } } },
      xAxis: { type: 'category', data: MONTHS, axisLabel: AXIS_LABEL, axisLine: AXIS_LINE, axisTick: { show: false }, boundaryGap: true },
    };

    if (mode === 'orders') {
      c.setOption({
        ...base,
        yAxis: [
          { type: 'value', name: '订单量', nameTextStyle: { color: MUTED }, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef1f6' } } },
          { type: 'value', name: '销售额', nameTextStyle: { color: MUTED }, axisLabel: { ...AXIS_LABEL, formatter: v => fmt(v) }, splitLine: { show: false } },
        ],
        series: [
          { name: '订单量', type: 'bar', data: orders, barWidth: 14, itemStyle: { color: C.primary, borderRadius: [5, 5, 0, 0] } },
          { name: '销售额', type: 'line', yAxisIndex: 1, data: sales, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2.5, color: C.violet }, itemStyle: { color: C.violet }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(124,58,237,.18)' }, { offset: 1, color: 'rgba(124,58,237,0)' }]) } },
        ],
        legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 8, textStyle: { color: MUTED, fontSize: 12 } },
      });
    } else if (mode === 'aov') {
      c.setOption({
        ...base,
        yAxis: { type: 'value', axisLabel: { ...AXIS_LABEL, formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#eef1f6' } } },
        series: [{
          name: '客单价', type: 'line', data: aov, smooth: true, symbol: 'circle', symbolSize: 7,
          lineStyle: { width: 3, color: C.cyan }, itemStyle: { color: C.cyan, borderWidth: 2, borderColor: '#fff' },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(14,165,233,.18)' }, { offset: 1, color: 'rgba(14,165,233,0)' }]) },
          label: { show: true, position: 'top', color: MUTED, fontSize: 10.5, formatter: p => 'R$' + p.value },
        }],
        tooltip: { ...tooltipBase, trigger: 'axis', formatter: ps => `${ps[0].axisValue}<br/>客单价：R$ ${ps[0].value}` },
      });
    } else { // mom 环比
      const momOrders = monthly.filter(m => m.month >= '2017-02').map(m => m.orders_mom);
      const momSales = monthly.filter(m => m.month >= '2017-02').map(m => m.sales_mom);
      const momMonths = monthly.filter(m => m.month >= '2017-02').map(m => m.month.slice(2) + '月');
      c.setOption({
        grid: { left: 10, right: 10, top: 40, bottom: 8, containLabel: true },
        tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: v => pct(v) },
        xAxis: { type: 'category', data: momMonths, axisLabel: AXIS_LABEL, axisLine: AXIS_LINE, axisTick: { show: false } },
        yAxis: { type: 'value', axisLabel: { ...AXIS_LABEL, formatter: v => v + '%' }, splitLine: { lineStyle: { color: '#eef1f6' } } },
        legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 8, textStyle: { color: MUTED, fontSize: 12 } },
        series: [
          { name: '订单量环比', type: 'bar', data: momOrders, barWidth: 13, itemStyle: { color: C.blue, borderRadius: [4, 4, 0, 0] } },
          { name: '销售额环比', type: 'line', data: momSales, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2.5, color: C.amber }, itemStyle: { color: C.amber } },
        ],
      });
    }
  }

  /* ============================================================
     品类结构（可切换）
     ============================================================ */
  function renderCategory(mode) {
    const c = initChart('chart-category'); if (!c) return;
    let arr;
    const keyMap = { sales: '销售额', items: '订单量', avg: '均价' };
    const unitMap = { sales: '', items: '', avg: 'R$ ' };
    if (mode === 'sales') arr = D.category_sales.slice().sort((a, b) => b.sales - a.sales).slice(0, 10);
    else if (mode === 'items') arr = D.category_sales.slice().sort((a, b) => b.items - a.items).slice(0, 10);
    else arr = D.category_sales.slice().filter(x => x.items >= 100).sort((a, b) => b.avg_price - a.avg_price).slice(0, 10);
    arr.reverse();
    const label = cat => cat.replace(/_/g, ' ');
    const val = x => mode === 'sales' ? x.sales : mode === 'items' ? x.items : x.avg_price;
    c.setOption({
      grid: { left: 10, right: 50, top: 8, bottom: 8, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: ps => {
        const x = ps[0]; const raw = arr.find(a => label(a.category) === x.name);
        return `${x.name}<br/>${keyMap[mode]}：${unitMap[mode]}${fmt(val(raw))}`;
      } },
      xAxis: { type: 'value', axisLabel: { ...AXIS_LABEL, formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#eef1f6' } } },
      yAxis: { type: 'category', data: arr.map(a => label(a.category)), axisLabel: { color: INK, fontSize: 11.5 }, axisLine: AXIS_LINE, axisTick: { show: false } },
      series: [{
        type: 'bar', data: arr.map(a => val(a)), barWidth: 13,
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: C.primary }, { offset: 1, color: C.cyan }]), borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: 'right', color: MUTED, fontSize: 10.5, formatter: p => fmt(p.value) },
      }],
    });
  }

  /* ============================================================
     各州延迟率
     ============================================================ */
  function renderStateDelay() {
    const c = initChart('chart-state-delay'); if (!c) return;
    const d = D.state_delay.slice().sort((a, b) => b.delay_rate - a.delay_rate).slice(0, 15).reverse();
    c.setOption({
      grid: { left: 10, right: 46, top: 8, bottom: 8, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: ps => `${ps[0].name} 州<br/>延迟率：${ps[0].value}%` },
      xAxis: { type: 'value', axisLabel: { ...AXIS_LABEL, formatter: v => v + '%' }, splitLine: { lineStyle: { color: '#eef1f6' } } },
      yAxis: { type: 'category', data: d.map(x => x.state), axisLabel: { color: INK, fontSize: 11.5 }, axisLine: AXIS_LINE, axisTick: { show: false } },
      series: [{
        type: 'bar', data: d.map(x => x.delay_rate), barWidth: 13,
        itemStyle: { color: p => {
          const v = p.value;
          return new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#fca5a5' }, { offset: 1, color: C.rose }]);
        }, borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: 'right', color: MUTED, fontSize: 10.5, formatter: p => p.value + '%' },
      }],
    });
  }

  /* ============================================================
     月度延迟率
     ============================================================ */
  function renderMonthDelay() {
    const c = initChart('chart-month-delay'); if (!c) return;
    const d = monthlyDelay;
    const values = d.map(x => x.delay_rate);
    c.setOption({
      grid: { left: 10, right: 10, top: 30, bottom: 8, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'axis', formatter: ps => `${ps[0].axisValue}<br/>延迟率：${ps[0].value}%` },
      xAxis: { type: 'category', data: d.map(x => x.month.slice(2) + '月'), axisLabel: AXIS_LABEL, axisLine: AXIS_LINE, axisTick: { show: false } },
      yAxis: { type: 'value', axisLabel: { ...AXIS_LABEL, formatter: v => v + '%' }, splitLine: { lineStyle: { color: '#eef1f6' } } },
      series: [{
        type: 'line', data: values, smooth: true, symbol: 'circle', symbolSize: 6,
        lineStyle: { width: 2.5, color: C.rose }, itemStyle: { color: C.rose },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(239,68,68,.15)' }, { offset: 1, color: 'rgba(239,68,68,0)' }]) },
        markPoint: { data: [{ type: 'max', name: '峰值', symbolSize: 42, label: { fontSize: 10, color: '#fff' }, itemStyle: { color: C.rose } }] },
      }],
    });
  }

  /* ============================================================
     评分分布
     ============================================================ */
  function renderScore() {
    const c = initChart('chart-score'); if (!c) return;
    const d = D.score_dist;
    const colors = ['#ef4444', '#fb923c', '#f59e0b', '#34d399', '#10b981'];
    c.setOption({
      grid: { left: 10, right: 10, top: 30, bottom: 8, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: ps => `${ps[0].axisValue} 分<br/>评论数：${num(ps[0].value)}` },
      xAxis: { type: 'category', data: d.map(x => x.score + ' 分'), axisLabel: { color: INK, fontSize: 12 }, axisLine: AXIS_LINE, axisTick: { show: false } },
      yAxis: { type: 'value', axisLabel: { ...AXIS_LABEL, formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#eef1f6' } } },
      series: [{
        type: 'bar', data: d.map((x, i) => ({ value: x.count, itemStyle: { color: colors[i], borderRadius: [6, 6, 0, 0] } })), barWidth: 26,
        label: { show: true, position: 'top', color: MUTED, fontSize: 11, formatter: p => fmt(p.value) },
      }],
    });
  }

  /* ============================================================
     购买频次（对数轴）
     ============================================================ */
  function renderFreq() {
    const c = initChart('chart-freq'); if (!c) return;
    const d = D.purchase_freq.filter(x => x.orders >= 1);
    c.setOption({
      grid: { left: 10, right: 60, top: 10, bottom: 8, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: ps => `${ps[0].axisValue} 笔<br/>用户数：${num(ps[0].value)}` },
      xAxis: { type: 'category', data: d.map(x => x.orders + ' 笔'), axisLabel: { color: INK, fontSize: 11.5 }, axisLine: AXIS_LINE, axisTick: { show: false } },
      yAxis: { type: 'log', axisLabel: { ...AXIS_LABEL, formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#eef1f6' } } },
      series: [{
        type: 'bar', data: d.map(x => x.users), barWidth: 20,
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: C.blue }, { offset: 1, color: C.cyan }]), borderRadius: [5, 5, 0, 0] },
        label: { show: true, position: 'top', color: MUTED, fontSize: 10.5, formatter: p => fmt(p.value) },
      }],
    });
  }

  /* ============================================================
     月度新增用户
     ============================================================ */
  function renderCohort() {
    const c = initChart('chart-cohort'); if (!c) return;
    c.setOption({
      grid: { left: 10, right: 10, top: 30, bottom: 8, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'axis', formatter: ps => `${ps[0].axisValue}<br/>新增用户：${num(ps[0].value)}` },
      xAxis: { type: 'category', data: cohort.map(x => x.month.slice(2) + '月'), axisLabel: AXIS_LABEL, axisLine: AXIS_LINE, axisTick: { show: false } },
      yAxis: { type: 'value', axisLabel: { ...AXIS_LABEL, formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#eef1f6' } } },
      series: [{
        type: 'line', data: cohort.map(x => x.new_customers), smooth: true, symbol: 'circle', symbolSize: 5,
        lineStyle: { width: 2.5, color: C.emerald }, itemStyle: { color: C.emerald },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(16,185,129,.16)' }, { offset: 1, color: 'rgba(16,185,129,0)' }]) },
      }],
    });
  }

  /* ============================================================
     低分品类 Top 10
     ============================================================ */
  function renderLowscore() {
    const c = initChart('chart-lowscore'); if (!c) return;
    const d = D.low_score_category.slice(0, 10).reverse();
    const label = cat => cat.replace(/_/g, ' ');
    c.setOption({
      grid: { left: 10, right: 46, top: 8, bottom: 8, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: ps => `${ps[0].name}<br/>低分率：${ps[0].value}%` },
      xAxis: { type: 'value', axisLabel: { ...AXIS_LABEL, formatter: v => v + '%' }, splitLine: { lineStyle: { color: '#eef1f6' } } },
      yAxis: { type: 'category', data: d.map(x => label(x.category)), axisLabel: { color: INK, fontSize: 11.5 }, axisLine: AXIS_LINE, axisTick: { show: false } },
      series: [{
        type: 'bar', data: d.map(x => x.low_score_rate), barWidth: 13,
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#fbbf24' }, { offset: 1, color: C.rose }]), borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: 'right', color: MUTED, fontSize: 10.5, formatter: p => p.value + '%' },
      }],
    });
  }

  /* ============================================================
     配送时长 vs 评分 / 准时 vs 延迟评分
     ============================================================ */
  function renderDeliveryScore() {
    const c = initChart('chart-delivery-score'); if (!c) return;
    const d = D.delivery_vs_score;
    c.setOption({
      grid: { left: 10, right: 10, top: 16, bottom: 8, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: ps => `${ps[0].axisValue}<br/>平均送达：${ps[0].value} 天` },
      xAxis: { type: 'category', data: d.map(x => x.grp), axisLabel: { color: INK, fontSize: 12 }, axisLine: AXIS_LINE, axisTick: { show: false } },
      yAxis: { type: 'value', axisLabel: { ...AXIS_LABEL, formatter: v => v + '天' }, splitLine: { lineStyle: { color: '#eef1f6' } } },
      series: [{
        type: 'bar', data: d.map(x => x.avg_days), barWidth: 44,
        itemStyle: { color: p => p.dataIndex === 0 ? C.rose : C.emerald, borderRadius: [6, 6, 0, 0] },
        label: { show: true, position: 'top', color: INK, fontSize: 13, fontWeight: 700, formatter: p => p.value + ' 天' },
      }],
    });
  }
  function renderDelayScore() {
    const c = initChart('chart-delay-score'); if (!c) return;
    const d = D.delay_vs_score.slice().sort((a, b) => b.avg_score - a.avg_score);
    c.setOption({
      grid: { left: 10, right: 10, top: 16, bottom: 8, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: ps => `${ps[0].axisValue}<br/>平均评分：${ps[0].value}` },
      xAxis: { type: 'category', data: d.map(x => x.grp), axisLabel: { color: INK, fontSize: 12 }, axisLine: AXIS_LINE, axisTick: { show: false } },
      yAxis: { type: 'value', min: 0, max: 5, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef1f6' } } },
      series: [{
        type: 'bar', data: d.map(x => x.avg_score), barWidth: 44,
        itemStyle: { color: p => p.value > 4 ? C.emerald : C.rose, borderRadius: [6, 6, 0, 0] },
        label: { show: true, position: 'top', color: INK, fontSize: 13, fontWeight: 700, formatter: p => p.value + ' 分' },
      }],
    });
  }

  /* ============================================================
     建模：标签分布
     ============================================================ */
  function renderLabelDelay() {
    const c = initChart('chart-label-delay'); if (!c) return;
    c.setOption({
      color: [C.emerald, C.rose],
      tooltip: { ...tooltipBase, trigger: 'item', formatter: p => `${p.name}<br/>${num(p.value)} 笔 · ${p.percent}%` },
      legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: MUTED, fontSize: 12 } },
      series: [{
        type: 'pie', radius: ['50%', '72%'], center: ['50%', '44%'],
        itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 6 },
        label: { show: true, position: 'center', formatter: '96,470\n笔订单', fontSize: 12, color: MUTED, lineHeight: 18 },
        emphasis: { label: { show: true, fontSize: 13, fontWeight: 700, color: INK } },
        data: D.delay_label_dist.map(x => ({ name: x.name, value: x.value })),
      }],
    });
  }
  function renderLabelReview() {
    const c = initChart('chart-label-review'); if (!c) return;
    c.setOption({
      color: [C.rose, C.amber, C.emerald],
      tooltip: { ...tooltipBase, trigger: 'item', formatter: p => `${p.name}<br/>${num(p.value)} 笔 · ${p.percent}%` },
      legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: MUTED, fontSize: 12 } },
      series: [{
        type: 'pie', radius: ['50%', '72%'], center: ['50%', '44%'],
        itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 6 },
        label: { show: true, position: 'center', formatter: '98,673\n笔订单', fontSize: 12, color: MUTED, lineHeight: 18 },
        emphasis: { label: { show: true, fontSize: 13, fontWeight: 700, color: INK } },
        data: D.review_label_dist.map(x => ({ name: x.name, value: x.value })),
      }],
    });
  }

  /* ============================================================
     模型对比
     ============================================================ */
  function renderModel() {
    const c = initChart('chart-model'); if (!c) return;
    const models = D.model_comparison.map(x => x.model.replace(/ .*$/, ''));
    const full = D.model_comparison.map(x => x.model);
    c.setOption({
      grid: { left: 10, right: 10, top: 36, bottom: 8, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 8, textStyle: { color: MUTED, fontSize: 12 } },
      xAxis: { type: 'category', data: full, axisLabel: { color: INK, fontSize: 11, interval: 0, rotate: 0 }, axisLine: AXIS_LINE, axisTick: { show: false } },
      yAxis: { type: 'value', min: 0, max: 1, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef1f6' } } },
      series: [
        { name: 'ROC-AUC', type: 'bar', data: D.model_comparison.map(x => x.auc), barWidth: 15, itemStyle: { color: C.primary, borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', color: MUTED, fontSize: 10, formatter: p => p.value.toFixed(2) } },
        { name: 'Macro-F1', type: 'bar', data: D.model_comparison.map(x => x.f1), barWidth: 15, itemStyle: { color: C.cyan, borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', color: MUTED, fontSize: 10, formatter: p => p.value.toFixed(2) } },
        { name: 'Accuracy', type: 'bar', data: D.model_comparison.map(x => x.acc), barWidth: 15, itemStyle: { color: C.emerald, borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', color: MUTED, fontSize: 10, formatter: p => p.value.toFixed(2) } },
      ],
    });
  }

  /* ============================================================
     SHAP 特征重要性
     ============================================================ */
  function renderShap() {
    const c = initChart('chart-shap'); if (!c) return;
    const d = D.shap_importance.slice().sort((a, b) => a.value - b.value);
    c.setOption({
      grid: { left: 10, right: 54, top: 8, bottom: 8, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: ps => `${ps[0].name}<br/>平均 |SHAP|：${ps[0].value.toFixed(4)}` },
      xAxis: { type: 'value', axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef1f6' } } },
      yAxis: { type: 'category', data: d.map(x => x.feature), axisLabel: { color: INK, fontSize: 11.5 }, axisLine: AXIS_LINE, axisTick: { show: false } },
      series: [{
        type: 'bar', data: d.map(x => x.value), barWidth: 14,
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: C.primary }, { offset: 1, color: C.violet }]), borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: 'right', color: MUTED, fontSize: 10.5, formatter: p => p.value.toFixed(4) },
      }],
    });
  }

  /* ============================================================
     导航 scroll-spy
     ============================================================ */
  function setupNav() {
    const links = document.querySelectorAll('.nav-links a');
    const map = {};
    links.forEach(a => map[a.getAttribute('href').slice(1)] = a);
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          links.forEach(a => a.classList.remove('active'));
          const a = map[e.target.id];
          if (a) a.classList.add('active');
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    document.querySelectorAll('section[id]').forEach(s => obs.observe(s));
  }

  /* ============================================================
     分段切换器
     ============================================================ */
  function setupSeg(id, cb) {
    const seg = document.getElementById(id);
    if (!seg) return;
    seg.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      seg.querySelectorAll('button').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      cb(btn.dataset.k);
    });
  }

  /* ============================================================
     初始化
     ============================================================ */
  function renderAll() {
    renderKpi();
    renderStatus();
    renderPayment();
    renderTrend('orders');
    renderCategory('sales');
    renderStateDelay();
    renderMonthDelay();
    renderScore();
    renderFreq();
    renderCohort();
    renderLowscore();
    renderDeliveryScore();
    renderDelayScore();
    renderLabelDelay();
    renderLabelReview();
    renderModel();
    renderShap();
  }

  setupSeg('seg-trend', k => renderTrend(k));
  setupSeg('seg-cat', k => renderCategory(k));
  setupNav();

  window.addEventListener('resize', () => {
    Object.values(charts).forEach(c => c.resize());
  });

  renderAll();
})();

const { supabaseAdmin } = require('../../lib/supabaseAdmin')

async function getInsights(req, res) {
  try {
    const userId = req.user.id
    const hoje = new Date()
    const anoAtual = hoje.getFullYear()
    const mesAtual = hoje.getMonth() + 1
    const diaAtual = hoje.getDate()

    function pad(n) { return String(n).padStart(2, '0') }
    function inicioMes(ano, mes) { return `${ano}-${pad(mes)}-01` }
    function fimMes(ano, mes) {
      const ultimo = new Date(ano, mes, 0).getDate()
      return `${ano}-${pad(mes)}-${pad(ultimo)}`
    }

    const insights = []

    // ── 1. Gastos do mês atual ────────────────────────────────────────────────
    const { data: txMesAtual } = await supabaseAdmin
      .from('transactions')
      .select('amount_cents, type')
      .eq('user_id', userId)
      .in('type', ['expense', 'card'])
      .gte('date', inicioMes(anoAtual, mesAtual))
      .lte('date', fimMes(anoAtual, mesAtual))
      .is('deleted_at', null)

    const gastoMesAtual = (txMesAtual || []).reduce((s, t) => s + t.amount_cents, 0)

    // Média dos últimos 3 meses
    const gastosPorMes = []
    for (let i = 1; i <= 3; i++) {
      let m = mesAtual - i
      let a = anoAtual
      if (m <= 0) { m += 12; a -= 1 }
      const { data: txMes } = await supabaseAdmin
        .from('transactions')
        .select('amount_cents')
        .eq('user_id', userId)
        .in('type', ['expense', 'card'])
        .gte('date', inicioMes(a, m))
        .lte('date', fimMes(a, m))
        .is('deleted_at', null)
      const total = (txMes || []).reduce((s, t) => s + t.amount_cents, 0)
      gastosPorMes.push(total)
    }

    const media3meses = gastosPorMes.reduce((s, v) => s + v, 0) / 3

    if (media3meses > 0 && gastoMesAtual > media3meses * 1.1) {
      const pct = Math.round(((gastoMesAtual - media3meses) / media3meses) * 100)
      insights.push({
        tipo: 'alerta',
        icone: '📈',
        titulo: 'Gastos acima da média',
        descricao: `Você gastou ${pct}% a mais do que sua média dos últimos 3 meses.`,
        valor_cents: gastoMesAtual,
      })
    } else if (media3meses > 0) {
      insights.push({
        tipo: 'positivo',
        icone: '✅',
        titulo: 'Gastos sob controle',
        descricao: `Seus gastos este mês estão dentro da média dos últimos 3 meses.`,
        valor_cents: gastoMesAtual,
      })
    }

    // ── 2. Categoria que mais gastou ─────────────────────────────────────────
    const { data: txCategorias } = await supabaseAdmin
      .from('transactions')
      .select('amount_cents, categories!category_id(name)')
      .eq('user_id', userId)
      .in('type', ['expense', 'card'])
      .gte('date', inicioMes(anoAtual, mesAtual))
      .lte('date', fimMes(anoAtual, mesAtual))
      .is('deleted_at', null)

    const porCategoria = {}
    for (const tx of txCategorias || []) {
      const nome = tx.categories?.name || 'Sem categoria'
      porCategoria[nome] = (porCategoria[nome] || 0) + tx.amount_cents
    }

    const topCategoria = Object.entries(porCategoria).sort((a, b) => b[1] - a[1])[0]
    if (topCategoria) {
      insights.push({
        tipo: 'info',
        icone: '🏆',
        titulo: 'Maior gasto do mês',
        descricao: `A categoria "${topCategoria[0]}" foi onde você mais gastou este mês.`,
        valor_cents: topCategoria[1],
      })
    }

    // ── 3. Saldo previsto no fim do mês ──────────────────────────────────────
    const { data: contas } = await supabaseAdmin
      .from('accounts')
      .select('current_balance')
      .eq('user_id', userId)
      .is('deleted_at', null)

    const saldoAtual = (contas || []).reduce((s, c) => s + (c.current_balance || 0), 0)

    // Recorrentes previstas para o restante do mês
    const { data: recorrentes } = await supabaseAdmin
      .from('recurring_rules')
      .select('amount_cents, type, day_of_month')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)

    let receitasPrevistas = 0
    let despesasPrevistas = 0

    for (const r of recorrentes || []) {
      if (!r.day_of_month || r.day_of_month <= diaAtual) continue
      if (r.type === 'income') receitasPrevistas += r.amount_cents
      else despesasPrevistas += r.amount_cents
    }

    const saldoPrevisto = saldoAtual + receitasPrevistas - despesasPrevistas

    insights.push({
      tipo: saldoPrevisto >= 0 ? 'info' : 'alerta',
      icone: '💰',
      titulo: 'Saldo previsto no fim do mês',
      descricao: saldoPrevisto >= 0
        ? `Considerando suas recorrentes pendentes, seu saldo deve fechar positivo.`
        : `Atenção: seu saldo pode fechar negativo considerando as recorrentes pendentes.`,
      valor_cents: saldoPrevisto,
    })

    // ── 4. Metas próximas do prazo ───────────────────────────────────────────
    const em30dias = new Date(hoje)
    em30dias.setDate(em30dias.getDate() + 30)
    const em30str = em30dias.toISOString().split('T')[0]
    const hojeStr = hoje.toISOString().split('T')[0]

    const { data: metas } = await supabaseAdmin
      .from('goals')
      .select('name, target_amount_cents, saved_amount_cents, deadline')
      .eq('user_id', userId)
      .eq('is_completed', false)
      .gte('deadline', hojeStr)
      .lte('deadline', em30str)
      .is('deleted_at', null)

    for (const meta of metas || []) {
      const falta = meta.target_amount_cents - (meta.saved_amount_cents || 0)
      insights.push({
        tipo: 'alerta',
        icone: '⭐',
        titulo: `Meta próxima do prazo: ${meta.name}`,
        descricao: `Vence em até 30 dias e ainda faltam recursos para completar.`,
        valor_cents: falta > 0 ? falta : 0,
      })
    }

    // ── 5. Recorrentes não lançadas ──────────────────────────────────────────
    const { data: todasRecorrentes } = await supabaseAdmin
      .from('recurring_rules')
      .select('id, description, day_of_month')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)

    for (const r of todasRecorrentes || []) {
      if (!r.day_of_month || r.day_of_month > diaAtual) continue

      const { data: lancada } = await supabaseAdmin
        .from('transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('recurring_rule_id', r.id)
        .gte('date', inicioMes(anoAtual, mesAtual))
        .lte('date', fimMes(anoAtual, mesAtual))
        .is('deleted_at', null)
        .limit(1)

      if (!lancada || lancada.length === 0) {
        insights.push({
          tipo: 'alerta',
          icone: '🔁',
          titulo: 'Recorrente não lançada',
          descricao: `"${r.description}" venceu no dia ${r.day_of_month} e ainda não foi lançada.`,
          valor_cents: null,
        })
      }
    }

    // ── 6. Faturas chegando (próximos 7 dias) ────────────────────────────────
    const { data: cartoes } = await supabaseAdmin
      .from('credit_cards')
      .select('name, due_day')
      .eq('user_id', userId)
      .is('deleted_at', null)

    for (const cartao of cartoes || []) {
      const due = cartao.due_day
      if (!due) continue
      const diasAteVenc = due >= diaAtual ? due - diaAtual : (new Date(anoAtual, mesAtual, 0).getDate() - diaAtual) + due
      if (diasAteVenc <= 7) {
        insights.push({
          tipo: diasAteVenc <= 2 ? 'alerta' : 'info',
          icone: '💳',
          titulo: `Fatura vencendo: ${cartao.name}`,
          descricao: diasAteVenc === 0
            ? `A fatura vence hoje!`
            : `A fatura vence em ${diasAteVenc} dia${diasAteVenc > 1 ? 's' : ''}.`,
          valor_cents: null,
        })
      }
    }

    return res.json({ data: insights })
  } catch (err) {
    console.error('Erro nos insights:', err)
    return res.status(500).json({ error: { message: 'Erro ao carregar insights' } })
  }
}

module.exports = { getInsights }
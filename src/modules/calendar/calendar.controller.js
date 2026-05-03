const { supabaseAdmin } = require('../../lib/supabaseAdmin')

async function getCalendar(req, res) {
  try {
    const userId = req.user.id
    const { month } = req.query

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: { message: 'Parâmetro month obrigatório no formato YYYY-MM' } })
    }

    const [year, mon] = month.split('-').map(Number)
    const startDate = `${month}-01`
    const lastDay = new Date(year, mon, 0).getDate()
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`

    const events = {}

    function addEvent(date, event) {
      if (!events[date]) events[date] = []
      events[date].push(event)
    }

    // 1. Transações lançadas
    const { data: transactions, error: txError } = await supabaseAdmin
      .from('transactions')
      .select('id, description, amount_cents, type, date, categories!category_id(name)')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .is('deleted_at', null)

    if (txError) throw txError

    for (const tx of transactions || []) {
      addEvent(tx.date, {
        id: tx.id,
        tipo: 'transacao',
        subtipo: tx.type,
        descricao: tx.description,
        valor_cents: tx.amount_cents,
        categoria: tx.categories?.name || null,
      })
    }

    // 2. Transferências
    const { data: transfers, error: trError } = await supabaseAdmin
      .from('transfers')
      .select('id, amount_cents, date')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)

    if (trError) throw trError

    for (const tr of transfers || []) {
      addEvent(tr.date, {
        id: tr.id,
        tipo: 'transferencia',
        descricao: 'Transferência',
        valor_cents: tr.amount_cents,
      })
    }

    // 3. Recorrentes previstas
    const { data: recurring, error: recError } = await supabaseAdmin
      .from('recurring_rules')
      .select('id, description, amount_cents, type, day_of_month')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)

    if (recError) throw recError

    for (const rule of recurring || []) {
      const day = rule.day_of_month
      if (!day || day < 1 || day > lastDay) continue

      const dateStr = `${month}-${String(day).padStart(2, '0')}`

      const { data: existing } = await supabaseAdmin
        .from('transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('recurring_rule_id', rule.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .is('deleted_at', null)
        .limit(1)

      if (!existing || existing.length === 0) {
        addEvent(dateStr, {
          id: rule.id,
          tipo: 'recorrente_prevista',
          subtipo: rule.type,
          descricao: rule.description,
          valor_cents: rule.amount_cents,
        })
      }
    }

    // 4. Vencimento de faturas de cartão
    const { data: cards, error: cardError } = await supabaseAdmin
      .from('credit_cards')
      .select('id, name, due_day')
      .eq('user_id', userId)
      .is('deleted_at', null)

    if (cardError) throw cardError

    for (const card of cards || []) {
      const day = card.due_day
      if (!day || day < 1 || day > lastDay) continue

      const dateStr = `${month}-${String(day).padStart(2, '0')}`

      addEvent(dateStr, {
        id: card.id,
        tipo: 'fatura',
        descricao: `Fatura — ${card.name}`,
        valor_cents: null,
      })
    }

    return res.json({ data: events })
  } catch (err) {
    console.error('Erro no calendário:', err)
    return res.status(500).json({ error: { message: 'Erro ao carregar calendário' } })
  }
}

module.exports = { getCalendar }
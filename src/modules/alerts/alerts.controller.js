const { supabase } = require('../../lib/supabase')

const getAlerts = async (req, res) => {
  try {
    const userId = req.user.id
    const alerts = []
    const today = new Date()
    const year = today.getFullYear()
    const monthStr = String(today.getMonth() + 1).padStart(2, '0')
    const startOfMonth = `${year}-${monthStr}-01`
    const lastDay = new Date(year, today.getMonth() + 1, 0).getDate()
    const endOfMonth = `${year}-${monthStr}-${lastDay}`

    // ── 1. Faturas vencendo em até 7 dias ──────────────────────────────
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*, credit_cards(name, user_id)')
      .eq('status', 'open')

    for (const inv of (invoices || [])) {
      if (!inv.credit_cards || inv.credit_cards.user_id !== userId) continue
      const due = new Date(inv.due_date + 'T12:00:00')
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24))
      if (diffDays <= 7 && diffDays >= 0) {
        alerts.push({
          id: `invoice-${inv.id}`,
          type: 'warning',
          category: 'fatura',
          title: 'Fatura vencendo em breve',
          message: `Fatura do ${inv.credit_cards.name} vence em ${diffDays === 0 ? 'hoje' : `${diffDays} dia${diffDays > 1 ? 's' : ''}`}`,
          value_cents: inv.total_cents,
          link: '/cards'
        })
      } else if (diffDays < 0) {
        alerts.push({
          id: `invoice-overdue-${inv.id}`,
          type: 'danger',
          category: 'fatura',
          title: 'Fatura vencida',
          message: `Fatura do ${inv.credit_cards.name} está vencida há ${Math.abs(diffDays)} dia${Math.abs(diffDays) > 1 ? 's' : ''}`,
          value_cents: inv.total_cents,
          link: '/cards'
        })
      }
    }

    // ── 2. Saldo baixo ──────────────────────────────────────────────────
    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)

    for (const acc of (accounts || [])) {
      const { data: transactions } = await supabase
        .from('transactions')
        .select('type, amount_cents')
        .eq('account_id', acc.id)
        .eq('is_confirmed', true)
        .is('deleted_at', null)

      const { data: transfersOut } = await supabase
        .from('transfers')
        .select('amount_cents')
        .eq('from_account_id', acc.id)
        .eq('user_id', userId)

      const { data: transfersIn } = await supabase
        .from('transfers')
        .select('amount_cents')
        .eq('to_account_id', acc.id)
        .eq('user_id', userId)

      const txBalance = (transactions || []).reduce((sum, tx) => {
        if (tx.type === 'income') return sum + tx.amount_cents
        if (tx.type === 'expense') return sum - tx.amount_cents
        return sum
      }, acc.initial_balance_cents)

      const totalOut = (transfersOut || []).reduce((sum, t) => sum - t.amount_cents, 0)
      const totalIn = (transfersIn || []).reduce((sum, t) => sum + t.amount_cents, 0)
      const balance = txBalance + totalOut + totalIn

      if (balance >= 0 && balance < 10000) {
        alerts.push({
          id: `balance-${acc.id}`,
          type: 'warning',
          category: 'saldo',
          title: 'Saldo baixo',
          message: `Conta "${acc.name}" está com saldo baixo`,
          value_cents: balance,
          link: '/accounts'
        })
      } else if (balance < 0) {
        alerts.push({
          id: `balance-negative-${acc.id}`,
          type: 'danger',
          category: 'saldo',
          title: 'Saldo negativo',
          message: `Conta "${acc.name}" está com saldo negativo`,
          value_cents: balance,
          link: '/accounts'
        })
      }
    }

    // ── 3. Metas com prazo próximo (até 15 dias) ────────────────────────
    const { data: goals } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('is_completed', false)
      .is('deleted_at', null)
      .not('deadline', 'is', null)

    for (const goal of (goals || [])) {
      const deadline = new Date(goal.deadline + 'T00:00:00')
      const diffDays = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24))
      if (diffDays <= 15 && diffDays >= 0) {
        const percent = goal.target_amount_cents > 0
          ? Math.round((goal.current_amount_cents / goal.target_amount_cents) * 100)
          : 0
        alerts.push({
          id: `goal-${goal.id}`,
          type: diffDays <= 3 ? 'danger' : 'warning',
          category: 'meta',
          title: 'Prazo de meta se aproximando',
          message: `Meta "${goal.name}" vence em ${diffDays === 0 ? 'hoje' : `${diffDays} dia${diffDays > 1 ? 's' : ''}`} — ${percent}% concluída`,
          link: '/goals'
        })
      } else if (diffDays < 0) {
        alerts.push({
          id: `goal-overdue-${goal.id}`,
          type: 'danger',
          category: 'meta',
          title: 'Prazo de meta expirado',
          message: `Meta "${goal.name}" expirou há ${Math.abs(diffDays)} dia${Math.abs(diffDays) > 1 ? 's' : ''}`,
          link: '/goals'
        })
      }
    }

    // ── 4. Metas concluídas recentemente (últimos 7 dias) ───────────────
    const { data: completedGoals } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('is_completed', true)
      .is('deleted_at', null)
      .not('completed_at', 'is', null)

    for (const goal of (completedGoals || [])) {
      const completedAt = new Date(goal.completed_at)
      const diffDays = Math.ceil((today - completedAt) / (1000 * 60 * 60 * 24))
      if (diffDays <= 7) {
        alerts.push({
          id: `goal-done-${goal.id}`,
          type: 'success',
          category: 'meta',
          title: 'Meta concluída! 🎉',
          message: `Você atingiu a meta "${goal.name}"`,
          link: '/goals'
        })
      }
    }

    // ── 5. Fatura alta (acima de 40% da receita do mês) ─────────────────
    const { data: incomesTx } = await supabase
      .from('transactions')
      .select('amount_cents')
      .eq('user_id', userId)
      .eq('type', 'income')
      .eq('is_confirmed', true)
      .is('deleted_at', null)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth)

    const totalMonthlyIncome = (incomesTx || []).reduce((sum, t) => sum + t.amount_cents, 0)

    // Se não tem receita no mês, usa R$ 1.000 como base mínima
    const incomeBase = totalMonthlyIncome > 0 ? totalMonthlyIncome : 100000
    const highInvoiceThreshold = Math.round(incomeBase * 0.4)

    const { data: highInvoices } = await supabase
      .from('invoices')
      .select('*, credit_cards(name, user_id)')
      .eq('status', 'open')
      .gt('total_cents', highInvoiceThreshold)

    for (const inv of (highInvoices || [])) {
      if (inv.credit_cards?.user_id !== userId) continue
      const percent = totalMonthlyIncome > 0
        ? Math.round((inv.total_cents / totalMonthlyIncome) * 100)
        : null
      alerts.push({
        id: `high-invoice-${inv.id}`,
        type: 'warning',
        category: 'fatura',
        title: 'Fatura elevada',
        message: percent
          ? `Fatura do ${inv.credit_cards.name} representa ${percent}% da sua receita do mês`
          : `Fatura do ${inv.credit_cards.name} está alta — considere registrar suas receitas`,
        value_cents: inv.total_cents,
        link: '/cards'
      })
    }

    return res.json({ data: alerts })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

module.exports = { getAlerts }
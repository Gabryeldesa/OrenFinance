const { supabase } = require('../../lib/supabase')

const getCards = async (req, res) => {
  try {
    const userId = req.userId

    const { data, error } = await supabase
      .from('credit_cards')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (error) return res.status(500).json({ error: { message: error.message } })

    const cardsWithInvoice = await Promise.all(
      data.map(async (card) => {
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString().split('T')[0]
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
          .toISOString().split('T')[0]

        const { data: txs } = await supabase
          .from('transactions')
          .select('amount_cents')
          .eq('credit_card_id', card.id)
          .eq('type', 'expense')
          .is('deleted_at', null)
          .gte('date', startOfMonth)
          .lte('date', endOfMonth)

        const usedLimit = (txs || []).reduce((acc, t) => acc + t.amount_cents, 0)
        const availableLimit = card.limit_cents - usedLimit

        const { data: invoice } = await supabase
          .from('invoices')
          .select('*')
          .eq('credit_card_id', card.id)
          .eq('status', 'open')
          .order('reference_month', { ascending: false })
          .limit(1)
          .single()

        if (invoice) {
          await supabase
            .from('invoices')
            .update({ total_cents: usedLimit })
            .eq('id', invoice.id)
        }

        return {
          ...card,
          used_limit_cents: usedLimit,
          available_limit_cents: availableLimit,
          current_invoice: invoice ? { ...invoice, total_cents: usedLimit } : null
        }
      })
    )

    return res.json({ data: cardsWithInvoice })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

const createCard = async (req, res) => {
  try {
    const userId = req.userId
    const { name, limit_cents, closing_day, due_day, color, account_id } = req.body

    if (!name || !limit_cents || !closing_day || !due_day) {
      return res.status(400).json({
        error: { message: 'Nome, limite, dia de fechamento e dia de vencimento são obrigatórios.' }
      })
    }

    const { data, error } = await supabase
      .from('credit_cards')
      .insert({
        user_id: userId,
        name,
        limit_cents,
        closing_day,
        due_day,
        color: color || '#6366f1',
        account_id: account_id || null
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: { message: error.message } })

    const now = new Date()
    const referenceMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString().split('T')[0]
    const closingDate = new Date(now.getFullYear(), now.getMonth(), closing_day)
      .toISOString().split('T')[0]
    const dueDate = new Date(now.getFullYear(), now.getMonth(), due_day)
      .toISOString().split('T')[0]

    await supabase.from('invoices').insert({
      credit_card_id: data.id,
      reference_month: referenceMonth,
      closing_date: closingDate,
      due_date: dueDate,
      total_cents: 0,
      status: 'open'
    })

    return res.status(201).json({ data })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

const updateCard = async (req, res) => {
  try {
    const userId = req.userId
    const { id } = req.params
    const { name, limit_cents, closing_day, due_day, color, account_id } = req.body

    const { data: existing } = await supabase
      .from('credit_cards')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single()

    if (!existing) {
      return res.status(404).json({ error: { message: 'Cartão não encontrado.' } })
    }

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (limit_cents !== undefined) updateData.limit_cents = limit_cents
    if (closing_day !== undefined) updateData.closing_day = closing_day
    if (due_day !== undefined) updateData.due_day = due_day
    if (color !== undefined) updateData.color = color
    if (account_id !== undefined) updateData.account_id = account_id

    const { data, error } = await supabase
      .from('credit_cards')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) return res.status(500).json({ error: { message: error.message } })

    return res.json({ data })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

const deleteCard = async (req, res) => {
  try {
    const userId = req.userId
    const { id } = req.params

    const { data: existing } = await supabase
      .from('credit_cards')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single()

    if (!existing) {
      return res.status(404).json({ error: { message: 'Cartão não encontrado.' } })
    }

    const { error } = await supabase
      .from('credit_cards')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)

    if (error) return res.status(500).json({ error: { message: error.message } })

    return res.status(204).send()
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

const getInvoices = async (req, res) => {
  try {
    const userId = req.userId
    const { id } = req.params

    const { data: card } = await supabase
      .from('credit_cards')
      .select('id, closing_day, due_day')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single()

    if (!card) {
      return res.status(404).json({ error: { message: 'Cartão não encontrado.' } })
    }

    const { data: realInvoices, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('credit_card_id', id)
      .order('reference_month', { ascending: false })

    if (error) return res.status(500).json({ error: { message: error.message } })

    const existingMonths = new Set(
      (realInvoices || []).map(inv => inv.reference_month.substring(0, 7))
    )

    const { data: rules } = await supabase
      .from('recurring_rules')
      .select('id, description, amount_cents, day_of_month, total_installments, current_installment')
      .eq('credit_card_id', id)
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .not('total_installments', 'is', null)

    const previewMap = {}
    const now = new Date()

    for (const rule of (rules || [])) {
      const remaining = rule.total_installments - (rule.current_installment || 0)
      if (remaining <= 0) continue

      for (let i = 1; i <= remaining; i++) {
        let txMonth = now.getMonth() + i
        let txYear = now.getFullYear()
        while (txMonth > 11) { txMonth -= 12; txYear++ }

        let invMonth = txMonth
        let invYear = txYear
        if (rule.day_of_month > card.closing_day) {
          invMonth += 1
          if (invMonth > 11) { invMonth = 0; invYear++ }
        }

        const key = `${invYear}-${String(invMonth + 1).padStart(2, '0')}`

        if (existingMonths.has(key)) continue

        if (!previewMap[key]) {
          previewMap[key] = {
            id: `preview-${key}`,
            credit_card_id: id,
            reference_month: `${key}-01`,
            due_date: `${key}-${String(card.due_day).padStart(2, '0')}`,
            closing_date: `${key}-${String(card.closing_day).padStart(2, '0')}`,
            total_cents: 0,
            status: 'preview',
            paid_at: null
          }
        }

        previewMap[key].total_cents += rule.amount_cents
      }
    }

    const allInvoices = [
      ...(realInvoices || []),
      ...Object.values(previewMap)
    ].sort((a, b) => b.reference_month.localeCompare(a.reference_month))

    return res.json({ data: allInvoices })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

const payInvoice = async (req, res) => {
  try {
    const userId = req.userId
    const { id, invoiceId } = req.params

    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*, credit_cards(user_id, account_id, name)')
      .eq('id', invoiceId)
      .eq('credit_card_id', id)
      .single()

    if (invError || !invoice) {
      return res.status(404).json({ error: { message: 'Fatura não encontrada.' } })
    }

    if (invoice.credit_cards.user_id !== userId) {
      return res.status(403).json({ error: { message: 'Acesso negado.' } })
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: { message: 'Fatura já foi paga.' } })
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', invoiceId)

    if (updateError) return res.status(500).json({ error: { message: updateError.message } })

    if (invoice.credit_cards.account_id && invoice.total_cents > 0) {
      await supabase.from('transactions').insert({
        user_id: userId,
        account_id: invoice.credit_cards.account_id,
        description: `Pagamento fatura ${invoice.credit_cards.name}`,
        amount_cents: invoice.total_cents,
        type: 'expense',
        date: new Date().toISOString().split('T')[0],
        payment_method: 'ted',
        is_confirmed: true
      })
    }

    return res.json({ data: { message: 'Fatura paga com sucesso.' } })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

module.exports = { getCards, createCard, updateCard, deleteCard, getInvoices, payInvoice }
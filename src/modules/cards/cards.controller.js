const { supabase } = require('../../lib/supabase')

const getInvoiceMonth = (dateStr, closingDay) => {
  const [year, month, day] = dateStr.split('-').map(Number)
  if (day > closingDay) {
    const next = new Date(year, month, 1)
    return { year: next.getFullYear(), month: next.getMonth() + 1 }
  }
  return { year, month }
}

// Fecha faturas cujo closing_date já passou
const autoCloseInvoices = async (cardId) => {
  const today = new Date().toISOString().split('T')[0]
  await supabase
    .from('invoices')
    .update({ status: 'closed' })
    .eq('credit_card_id', cardId)
    .eq('status', 'open')
    .lte('closing_date', today)
}

const getCards = async (req, res) => {
  try {
    const userId = req.user.id

    const { data, error } = await supabase
      .from('credit_cards')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (error) return res.status(500).json({ error: { message: error.message } })

    const cardsWithInvoice = await Promise.all(
      data.map(async (card) => {
        // Fecha automaticamente faturas vencidas
        await autoCloseInvoices(card.id)

        const { data: txs } = await supabase
          .from('transactions')
          .select('amount_cents, date')
          .eq('credit_card_id', card.id)
          .eq('type', 'expense')
          .is('deleted_at', null)

        const now = new Date()
        const currentMonth = now.getMonth() + 1
        const currentYear = now.getFullYear()

        const usedLimit = (txs || []).reduce((acc, t) => {
          const { year, month } = getInvoiceMonth(t.date, card.closing_day)
          if (year === currentYear && month === currentMonth) {
            return acc + t.amount_cents
          }
          return acc
        }, 0)

        const availableLimit = card.limit_cents - usedLimit

        // Busca a fatura mais recente que não seja preview nem paga
        const { data: invoice } = await supabase
          .from('invoices')
          .select('*')
          .eq('credit_card_id', card.id)
          .in('status', ['open', 'closed'])
          .order('reference_month', { ascending: false })
          .limit(1)
          .single()

        if (invoice && invoice.status === 'open') {
          await supabase
            .from('invoices')
            .update({ total_cents: usedLimit })
            .eq('id', invoice.id)
        }

        return {
          ...card,
          used_limit_cents: usedLimit,
          available_limit_cents: availableLimit,
          current_invoice: invoice ? {
            ...invoice,
            total_cents: invoice.status === 'open' ? usedLimit : invoice.total_cents
          } : null
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
    const userId = req.user.id
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
    const userId = req.user.id
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
    const userId = req.user.id
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
    const userId = req.user.id
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

    // Fecha automaticamente faturas cujo dia de fechamento já passou
    await autoCloseInvoices(id)

    const { data: realInvoices, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('credit_card_id', id)
      .order('reference_month', { ascending: false })

    if (error) return res.status(500).json({ error: { message: error.message } })

    const { data: allTxs } = await supabase
      .from('transactions')
      .select('amount_cents, date, description')
      .eq('credit_card_id', id)
      .eq('type', 'expense')
      .is('deleted_at', null)

    const txByInvoiceMonth = {}
    for (const tx of (allTxs || [])) {
      const { year, month } = getInvoiceMonth(tx.date, card.closing_day)
      const key = `${year}-${String(month).padStart(2, '0')}`
      if (!txByInvoiceMonth[key]) txByInvoiceMonth[key] = 0
      txByInvoiceMonth[key] += tx.amount_cents
    }

    const existingMonths = new Set()
    const updatedInvoices = await Promise.all(
      (realInvoices || []).map(async (inv) => {
        const key = inv.reference_month.substring(0, 7)
        existingMonths.add(key)
        const totalFromTxs = txByInvoiceMonth[key] || 0

        if (inv.status === 'open' && inv.total_cents !== totalFromTxs) {
          await supabase
            .from('invoices')
            .update({ total_cents: totalFromTxs })
            .eq('id', inv.id)
        }

        return {
          ...inv,
          total_cents: inv.status === 'open' ? totalFromTxs : inv.total_cents
        }
      })
    )

    const virtualInvoices = []
    for (const [key, total] of Object.entries(txByInvoiceMonth)) {
      if (existingMonths.has(key)) continue
      if (total === 0) continue

      const [yearStr, monthStr] = key.split('-')

      const referenceMonth = `${key}-01`
      const closingDate = `${key}-${String(card.closing_day).padStart(2, '0')}`
      const dueDate = `${key}-${String(card.due_day).padStart(2, '0')}`

      const today = new Date().toISOString().split('T')[0]
      const status = closingDate <= today ? 'closed' : 'open'

      const { data: newInvoice } = await supabase
        .from('invoices')
        .insert({
          credit_card_id: id,
          reference_month: referenceMonth,
          closing_date: closingDate,
          due_date: dueDate,
          total_cents: total,
          status
        })
        .select()
        .single()

      if (newInvoice) {
        virtualInvoices.push(newInvoice)
        existingMonths.add(key)
      }
    }

    // Previews de parcelas futuras
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

        let invMonth = txMonth + 1
        let invYear = txYear
        if (rule.day_of_month <= card.closing_day) {
          invMonth = txMonth + 1
        } else {
          invMonth = txMonth + 2
        }
        while (invMonth > 12) { invMonth -= 12; invYear++ }

        const key = `${invYear}-${String(invMonth).padStart(2, '0')}`
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

    // Ordena: mais recente primeiro (faturas atuais/abertas no topo)
    const realInvoicesSorted = [
      ...updatedInvoices,
      ...virtualInvoices
    ].sort((a, b) => b.reference_month.localeCompare(a.reference_month))

    const previewsSorted = Object.values(previewMap)
      .sort((a, b) => a.reference_month.localeCompare(b.reference_month))

    return res.json({ data: [...realInvoicesSorted, ...previewsSorted] })

    return res.json({ data: allInvoices })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

const payInvoice = async (req, res) => {
  try {
    const userId = req.user.id
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
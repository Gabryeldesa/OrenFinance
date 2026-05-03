// src/modules/recurring/recurring.controller.js
const { supabase } = require('../../lib/supabase')

// GET /api/recurring
const getRecurring = async (req, res) => {
  try {
    const userId = req.userId

    const { data, error } = await supabase
      .from('recurring_rules')
      .select('*, categories!category_id(id, name, color), accounts(id, name), credit_cards(id, name)')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) return res.status(500).json({ error: { message: error.message } })

    return res.json({ data })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

// POST /api/recurring
const createRecurring = async (req, res) => {
  try {
    const userId = req.userId
    const {
      description, amount_cents, type, category_id,
      account_id, credit_card_id, day_of_month,
      start_date, total_installments
    } = req.body

    if (!description || !amount_cents || !type || !day_of_month) {
      return res.status(400).json({
        error: { message: 'Descrição, valor, tipo e dia do mês são obrigatórios.' }
      })
    }

    const { data, error } = await supabase
      .from('recurring_rules')
      .insert({
        user_id: userId,
        description,
        amount_cents,
        type,
        category_id: category_id || null,
        account_id: account_id || null,
        credit_card_id: credit_card_id || null,
        day_of_month,
        start_date: start_date || new Date().toISOString().split('T')[0],
        is_active: true,
        total_installments: total_installments || null,
        current_installment: total_installments ? 0 : null,
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: { message: error.message } })

    return res.status(201).json({ data })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

// PUT /api/recurring/:id
const updateRecurring = async (req, res) => {
  try {
    const userId = req.userId
    const { id } = req.params
    const {
      description, amount_cents, type, category_id,
      account_id, credit_card_id, day_of_month,
      is_active, total_installments
    } = req.body

    const { data: existing } = await supabase
      .from('recurring_rules')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single()

    if (!existing) {
      return res.status(404).json({ error: { message: 'Regra não encontrada.' } })
    }

    const updateData = {}
    if (description !== undefined) updateData.description = description
    if (amount_cents !== undefined) updateData.amount_cents = amount_cents
    if (type !== undefined) updateData.type = type
    if (category_id !== undefined) updateData.category_id = category_id
    if (account_id !== undefined) updateData.account_id = account_id
    if (credit_card_id !== undefined) updateData.credit_card_id = credit_card_id
    if (day_of_month !== undefined) updateData.day_of_month = day_of_month
    if (is_active !== undefined) updateData.is_active = is_active
    if (total_installments !== undefined) updateData.total_installments = total_installments

    const { data, error } = await supabase
      .from('recurring_rules')
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

// DELETE /api/recurring/:id
const deleteRecurring = async (req, res) => {
  try {
    const userId = req.userId
    const { id } = req.params

    const { data: existing } = await supabase
      .from('recurring_rules')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single()

    if (!existing) {
      return res.status(404).json({ error: { message: 'Regra não encontrada.' } })
    }

    const { error } = await supabase
      .from('recurring_rules')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)

    if (error) return res.status(500).json({ error: { message: error.message } })

    return res.status(204).send()
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

// Função principal — processa todas as regras de um usuário para o mês atual
const processRulesForUser = async (userId) => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const monthStr = String(month + 1).padStart(2, '0')

  const { data: rules, error } = await supabase
    .from('recurring_rules')
    .select('*, credit_cards(id, closing_day, due_day)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('deleted_at', null)

  if (error) throw error

  let created = 0

  for (const rule of rules) {
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('recurring_rule_id', rule.id)
      .gte('date', `${year}-${monthStr}-01`)
      .lte('date', `${year}-${monthStr}-31`)
      .limit(1)

    if (existing && existing.length > 0) continue

    const txDate = new Date(year, month, rule.day_of_month)
      .toISOString().split('T')[0]

    let invoiceId = null
    if (rule.credit_card_id && rule.credit_cards) {
      const card = rule.credit_cards
      const closingDay = card.closing_day
      const dueDay = card.due_day

      let invoiceMonth = month
      let invoiceYear = year
      if (rule.day_of_month > closingDay) {
        invoiceMonth = month + 1
        if (invoiceMonth > 11) { invoiceMonth = 0; invoiceYear++ }
      }

      const refMonth = new Date(invoiceYear, invoiceMonth, 1)
        .toISOString().split('T')[0]

      const closeDate = new Date(invoiceYear, invoiceMonth, closingDay)
        .toISOString().split('T')[0]
      const dueDate = new Date(invoiceYear, invoiceMonth, dueDay)
        .toISOString().split('T')[0]

      const { data: invoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('credit_card_id', rule.credit_card_id)
        .eq('reference_month', refMonth)
        .single()

      if (invoice) {
        invoiceId = invoice.id
      } else {
        const { data: newInvoice } = await supabase
          .from('invoices')
          .insert({
            credit_card_id: rule.credit_card_id,
            reference_month: refMonth,
            closing_date: closeDate,
            due_date: dueDate,
            total_cents: 0,
            status: 'open'
          })
          .select('id')
          .single()
        invoiceId = newInvoice?.id
      }
    }

    let description = rule.description
    if (rule.total_installments) {
      const current = (rule.current_installment || 0) + 1
      description = `${rule.description} (${current}/${rule.total_installments})`
    }

    await supabase.from('transactions').insert({
      user_id: userId,
      account_id: rule.credit_card_id ? null : rule.account_id,
      credit_card_id: rule.credit_card_id || null,
      invoice_id: invoiceId,
      category_id: rule.category_id,
      description,
      amount_cents: rule.amount_cents,
      type: rule.type,
      date: txDate,
      is_confirmed: true,
      recurring_rule_id: rule.id,
      payment_method: rule.credit_card_id ? 'credit_card' : null
    })

    if (rule.total_installments) {
      const nextInstallment = (rule.current_installment || 0) + 1

      if (nextInstallment >= rule.total_installments) {
        await supabase
          .from('recurring_rules')
          .update({ current_installment: nextInstallment, is_active: false })
          .eq('id', rule.id)
      } else {
        await supabase
          .from('recurring_rules')
          .update({ current_installment: nextInstallment })
          .eq('id', rule.id)
      }
    }

    created++
  }

  return created
}

// POST /api/recurring/apply
const applyRecurring = async (req, res) => {
  try {
    const created = await processRulesForUser(req.userId)
    return res.json({ data: { created, message: `${created} transação(ões) criada(s).` } })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

// POST /api/recurring/auto
const autoApplyAll = async (req, res) => {
  try {
    const { data: users } = await supabase
      .from('recurring_rules')
      .select('user_id')
      .eq('is_active', true)
      .is('deleted_at', null)

    const uniqueUsers = [...new Set(users.map(u => u.user_id))]
    let totalCreated = 0

    for (const userId of uniqueUsers) {
      const created = await processRulesForUser(userId)
      totalCreated += created
    }

    return res.json({ data: { total: totalCreated } })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

module.exports = {
  getRecurring, createRecurring, updateRecurring,
  deleteRecurring, applyRecurring, autoApplyAll
}
const { supabase } = require('../../lib/supabase')
const { createTransactionSchema, updateTransactionSchema } = require('./transactions.schema')

const recalculateInvoice = async (invoiceId) => {
  if (!invoiceId) return
  const { data: txs } = await supabase
    .from('transactions')
    .select('amount_cents')
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null)
  const total = (txs || []).reduce((sum, t) => sum + t.amount_cents, 0)
  await supabase.from('invoices').update({ total_cents: total }).eq('id', invoiceId)
}

const getTransactions = async (req, res) => {
  const userId = req.user.id
  const {
    page = 1, limit = 100, type, category_id, account_id,
    start, end, month, search, sort = 'date', order = 'desc'
  } = req.query
  const offset = (Number(page) - 1) * Number(limit)

  let query = supabase
    .from('transactions')
    .select('*, categories!category_id(id, name, icon, color), accounts(id, name), credit_cards(id, name)', { count: 'exact' })
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (type) query = query.eq('type', type)
  if (category_id) query = query.eq('category_id', category_id)
  if (account_id) query = query.eq('account_id', account_id)
  if (search) query = query.ilike('description', `%${search}%`)

  if (month) {
    const [year, mon] = month.split('-')
    const startDate = `${year}-${mon}-01`
    const lastDay = new Date(Number(year), Number(mon), 0).getDate()
    const endDate = `${year}-${mon}-${lastDay}`
    query = query.gte('date', startDate).lte('date', endDate)
  } else {
    if (start) query = query.gte('date', start)
    if (end) query = query.lte('date', end)
  }

  query = query.order(sort, { ascending: order === 'asc' }).range(offset, offset + Number(limit) - 1)

  const { data, error, count } = await query
  if (error) throw error

  return res.json({
    data,
    meta: { page: Number(page), limit: Number(limit), total: count, pages: Math.ceil(count / Number(limit)) }
  })
}

const getSummary = async (req, res) => {
  const userId = req.user.id
  const { start, end, month } = req.query

  let query = supabase
    .from('transactions')
    .select('type, amount_cents')
    .eq('user_id', userId)
    .eq('is_confirmed', true)
    .is('deleted_at', null)

  if (month) {
    const [year, mon] = month.split('-')
    const startDate = `${year}-${mon}-01`
    const lastDay = new Date(Number(year), Number(mon), 0).getDate()
    const endDate = `${year}-${mon}-${lastDay}`
    query = query.gte('date', startDate).lte('date', endDate)
  } else {
    if (start) query = query.gte('date', start)
    if (end) query = query.lte('date', end)
  }

  const { data, error } = await query
  if (error) throw error

  const income = data.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount_cents, 0)
  const expense = data.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount_cents, 0)

  return res.json({ data: { income, expense, balance: income - expense } })
}

const createTransaction = async (req, res) => {
  const parsed = createTransactionSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
      }
    })
  }

  if (parsed.data.account_id && !parsed.data.credit_card_id) {
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', parsed.data.account_id)
      .eq('user_id', req.user.id)
      .is('deleted_at', null)
      .single()

    if (accountError || !account) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Conta não encontrada' } })
    }
  }

  let invoiceId = parsed.data.invoice_id || null
  if (parsed.data.credit_card_id && !invoiceId) {
    const { data: openInvoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('credit_card_id', parsed.data.credit_card_id)
      .eq('status', 'open')
      .order('reference_month', { ascending: false })
      .limit(1)
      .single()
    invoiceId = openInvoice?.id || null
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert({ ...parsed.data, user_id: req.user.id, invoice_id: invoiceId })
    .select('*, categories!category_id(id, name, icon, color), accounts(id, name), credit_cards(id, name)')
    .single()

  if (error) throw error
  await recalculateInvoice(invoiceId)
  return res.status(201).json({ data })
}

const updateTransaction = async (req, res) => {
  const { id } = req.params
  const parsed = updateTransactionSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
      }
    })
  }

  const { data: existing, error: findError } = await supabase
    .from('transactions')
    .select('id, invoice_id')
    .eq('id', id)
    .eq('user_id', req.user.id)
    .is('deleted_at', null)
    .single()

  if (findError || !existing) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transação não encontrada' } })
  }

  const { data, error } = await supabase
    .from('transactions')
    .update(parsed.data)
    .eq('id', id)
    .eq('user_id', req.user.id)
    .select('*, categories!category_id(id, name, icon, color), accounts(id, name), credit_cards(id, name)')
    .single()

  if (error) throw error
  await recalculateInvoice(existing.invoice_id)
  return res.json({ data })
}

const deleteTransaction = async (req, res) => {
  const { id } = req.params

  const { data: existing, error: findError } = await supabase
    .from('transactions')
    .select('id, invoice_id')
    .eq('id', id)
    .eq('user_id', req.user.id)
    .is('deleted_at', null)
    .single()

  if (findError || !existing) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transação não encontrada' } })
  }

  const { error } = await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', req.user.id)

  if (error) throw error
  await recalculateInvoice(existing.invoice_id)
  return res.status(204).send()
}

module.exports = { getTransactions, getSummary, createTransaction, updateTransaction, deleteTransaction }
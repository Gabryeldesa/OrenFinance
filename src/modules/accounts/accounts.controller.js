const { supabase } = require('../../lib/supabase')

const getAccounts = async (req, res) => {
  try {
    const userId = req.user.id

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (error) return res.status(500).json({ error: { message: error.message } })

    const accountsWithBalance = await Promise.all(
      data.map(async (account) => {
        const { data: transactions } = await supabase
          .from('transactions')
          .select('type, amount_cents')
          .eq('account_id', account.id)
          .eq('is_confirmed', true)
          .is('deleted_at', null)

        // Busca transferências onde esta conta é ORIGEM (saída)
        const { data: transfersOut } = await supabase
          .from('transfers')
          .select('amount_cents')
          .eq('from_account_id', account.id)
          .eq('user_id', userId)

        // Busca transferências onde esta conta é DESTINO (entrada)
        const { data: transfersIn } = await supabase
          .from('transfers')
          .select('amount_cents')
          .eq('to_account_id', account.id)
          .eq('user_id', userId)

        const balance = (transactions || []).reduce((acc, tx) => {
          if (tx.type === 'income') return acc + tx.amount_cents
          if (tx.type === 'expense') return acc - tx.amount_cents
          return acc // ignora tipo 'transfer' — calculado separado abaixo
        }, account.initial_balance_cents)

        const totalOut = (transfersOut || []).reduce((acc, t) => acc - t.amount_cents, 0)
        const totalIn = (transfersIn || []).reduce((acc, t) => acc + t.amount_cents, 0)

        return { ...account, current_balance: balance + totalOut + totalIn }
      })
    )

    const totalBalance = accountsWithBalance.reduce(
      (acc, account) => acc + account.current_balance, 0
    )

    return res.json({
      data: accountsWithBalance,
      meta: { total_balance: totalBalance }
    })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

const createAccount = async (req, res) => {
  try {
    const { name, type, initial_balance, color, icon } = req.body
    const userId = req.user.id

    if (!name || !type) {
      return res.status(400).json({ error: { message: 'Nome e tipo são obrigatórios.' } })
    }

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        user_id: userId,
        name,
        type,
        initial_balance_cents: initial_balance ?? 0,
        color: color || null,
        icon: icon || null
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: { message: error.message } })

    return res.status(201).json({
      data: { ...data, current_balance: data.initial_balance_cents }
    })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

const updateAccount = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id
    const { name, type, initial_balance, color, icon } = req.body

    const { data: existing } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single()

    if (!existing) {
      return res.status(404).json({ error: { message: 'Conta não encontrada.' } })
    }

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (type !== undefined) updateData.type = type
    if (initial_balance !== undefined) updateData.initial_balance_cents = initial_balance
    if (color !== undefined) updateData.color = color
    if (icon !== undefined) updateData.icon = icon

    const { data, error } = await supabase
      .from('accounts')
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

const deleteAccount = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const { data: existing } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single()

    if (!existing) {
      return res.status(404).json({ error: { message: 'Conta não encontrada.' } })
    }

    const { error } = await supabase
      .from('accounts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)

    if (error) return res.status(500).json({ error: { message: error.message } })

    return res.status(204).send()
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

module.exports = { getAccounts, createAccount, updateAccount, deleteAccount }
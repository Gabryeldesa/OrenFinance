const { supabaseAdmin } = require('../../lib/supabaseAdmin')

const checkAdmin = async (req, res, next) => {
  const userId = req.userId
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('is_admin')
    .eq('id', userId)
    .single()

  if (error || !data?.is_admin) {
    return res.status(403).json({ error: { message: 'Acesso negado.' } })
  }
  next()
}

const checkIsAdmin = async (req, res) => {
  const userId = req.userId
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('is_admin')
    .eq('id', userId)
    .single()

  if (error) return res.status(500).json({ error: { message: error.message } })
  res.json({ data: { is_admin: data?.is_admin || false } })
}

const getUsers = async (req, res) => {
  const { data: profiles, error } = await supabaseAdmin
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: { message: error.message } })

  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()

  const users = profiles.map(profile => {
    const authUser = authUsers?.users?.find(u => u.id === profile.id)
    return {
      ...profile,
      email: authUser?.email || profile.name,
      last_sign_in: authUser?.last_sign_in_at || null,
    }
  })

  res.json({ data: users })
}

const blockUser = async (req, res) => {
  const { id } = req.params
  const { is_blocked } = req.body

  const { error } = await supabaseAdmin
    .from('user_profiles')
    .update({ is_blocked })
    .eq('id', id)

  if (error) return res.status(500).json({ error: { message: error.message } })
  res.json({ data: { success: true } })
}

const deleteUser = async (req, res) => {
  const { id } = req.params

  // Soft delete em todos os dados do usuário antes de deletar o auth
  await Promise.all([
    supabaseAdmin.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('user_id', id),
    supabaseAdmin.from('accounts').update({ deleted_at: new Date().toISOString() }).eq('user_id', id),
    supabaseAdmin.from('goals').update({ deleted_at: new Date().toISOString() }).eq('user_id', id),
    supabaseAdmin.from('cards').update({ deleted_at: new Date().toISOString() }).eq('user_id', id),
    supabaseAdmin.from('recurring_transactions').update({ deleted_at: new Date().toISOString() }).eq('user_id', id),
    supabaseAdmin.from('transfers').update({ deleted_at: new Date().toISOString() }).eq('user_id', id),
  ])

  const { error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .delete()
    .eq('id', id)

  if (profileError) return res.status(500).json({ error: { message: profileError.message } })

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id)
  if (authError) return res.status(500).json({ error: { message: authError.message } })

  res.status(204).send()
}

const getUserData = async (req, res) => {
  const { id } = req.params

  const [accounts, transactions, goals, cards, recurring, transfers] = await Promise.all([
    supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('user_id', id)
      .is('deleted_at', null)
      .order('name'),
    supabaseAdmin
      .from('transactions')
      .select('*, categories!category_id(name)')
      .eq('user_id', id)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('goals')
      .select('*')
      .eq('user_id', id)
      .is('deleted_at', null),
    supabaseAdmin
      .from('cards')
      .select('*')
      .eq('user_id', id)
      .is('deleted_at', null),
    supabaseAdmin
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', id)
      .is('deleted_at', null),
    supabaseAdmin
      .from('transfers')
      .select('*, from_account:accounts!from_account_id(name), to_account:accounts!to_account_id(name)')
      .eq('user_id', id)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .limit(10),
  ])

  // Resumo financeiro
  const totalBalance = (accounts.data || []).reduce((sum, a) => sum + (a.current_balance || 0), 0)
  const totalIncome = (transactions.data || [])
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount_cents, 0)
  const totalExpense = (transactions.data || [])
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount_cents, 0)

  res.json({
    data: {
      summary: {
        total_balance: totalBalance,
        total_income: totalIncome,
        total_expense: totalExpense,
        accounts_count: (accounts.data || []).length,
        transactions_count: (transactions.data || []).length,
        goals_count: (goals.data || []).length,
        cards_count: (cards.data || []).length,
        recurring_count: (recurring.data || []).length,
      },
      accounts: accounts.data || [],
      transactions: transactions.data || [],
      goals: goals.data || [],
      cards: cards.data || [],
      recurring: recurring.data || [],
      transfers: transfers.data || [],
    }
  })
}

module.exports = { checkAdmin, checkIsAdmin, getUsers, blockUser, deleteUser, getUserData }
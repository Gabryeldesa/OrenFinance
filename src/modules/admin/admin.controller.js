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

  const [accounts, transactions, goals] = await Promise.all([
    supabaseAdmin.from('accounts').select('*').eq('user_id', id).is('deleted_at', null),
    supabaseAdmin.from('transactions').select('*, categories!category_id(name)').eq('user_id', id).is('deleted_at', null).order('date', { ascending: false }).limit(20),
    supabaseAdmin.from('goals').select('*').eq('user_id', id).is('deleted_at', null),
  ])

  res.json({
    data: {
      accounts: accounts.data || [],
      transactions: transactions.data || [],
      goals: goals.data || [],
    }
  })
}

module.exports = { checkAdmin, checkIsAdmin, getUsers, blockUser, deleteUser, getUserData }
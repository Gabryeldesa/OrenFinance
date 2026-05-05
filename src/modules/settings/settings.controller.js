const { supabaseAdmin } = require('../../lib/supabaseAdmin')

const getProfile = async (req, res) => {
  const userId = req.user?.id || req.userId

  if (!userId) {
    return res.status(401).json({ error: { message: 'Não autenticado.' } })
  }

  let { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id, name, currency, locale, theme')
    .eq('id', userId)
    .single()

  if (error || !data) {
    const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId)
    const fullName = authData?.user?.user_metadata?.full_name || ''

    const { data: newProfile } = await supabaseAdmin
      .from('user_profiles')
      .insert({
        id: userId,
        name: fullName,
        currency: 'BRL',
        locale: 'pt-BR',
        theme: 'light'
      })
      .select()
      .single()

    data = newProfile
  }

  const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId)

  res.json({
    data: {
      ...data,
      email: authData?.user?.email || ''
    }
  })
}

const updateProfile = async (req, res) => {
  const userId = req.user?.id || req.userId
  const { name } = req.body

  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single()

  if (error) return res.status(500).json({ error: { message: error.message } })
  res.json({ data })
}

const changePassword = async (req, res) => {
  const userId = req.user?.id || req.userId
  const { password } = req.body

  if (!password || password.length < 6) {
    return res.status(400).json({ error: { message: 'A senha deve ter pelo menos 6 caracteres.' } })
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })

  if (error) return res.status(500).json({ error: { message: error.message } })
  res.json({ data: { success: true } })
}

const deleteAccount = async (req, res) => {
  const userId = req.user?.id || req.userId

  await supabaseAdmin.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('user_id', userId)
  await supabaseAdmin.from('accounts').update({ deleted_at: new Date().toISOString() }).eq('user_id', userId)
  await supabaseAdmin.from('goals').update({ deleted_at: new Date().toISOString() }).eq('user_id', userId)
  await supabaseAdmin.from('user_profiles').delete().eq('id', userId)

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) return res.status(500).json({ error: { message: error.message } })

  res.status(204).send()
}

module.exports = { getProfile, updateProfile, changePassword, deleteAccount }
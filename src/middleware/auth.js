const { supabase } = require('../lib/supabase')
const { supabaseAdmin } = require('../lib/supabaseAdmin')

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: { message: 'Token não fornecido. Faça login para continuar.' }
      })
    }

    const token = authHeader.replace('Bearer ', '')

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json({
        error: { message: 'Token inválido ou expirado. Faça login novamente.' }
      })
    }

    req.user = user

    // Verifica se o admin está impersonando outro usuário
    const impersonateId = req.headers['x-impersonate-id']

    if (impersonateId && impersonateId !== user.id) {
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (profile?.is_admin) {
        const { data: { user: impersonatedUser } } = await supabaseAdmin.auth.admin.getUserById(impersonateId)
        if (impersonatedUser) {
          req.user = impersonatedUser
          req.impersonatedBy = user.id
        }
      }
    }

    // ← LINHA QUE FALTAVA
    req.userId = req.user.id

    next()

  } catch (err) {
    return res.status(500).json({
      error: { message: 'Erro ao verificar autenticação.' }
    })
  }
}

module.exports = { authenticate: authMiddleware }
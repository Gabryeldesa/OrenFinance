const { supabase } = require('../../lib/supabase')

const getCategories = async (req, res) => {
  const userId = req.user.id

  // Busca categorias padrão + as do usuário
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .or(`user_id.eq.${userId},user_id.is.null`)
    .is('deleted_at', null)
    .order('name')

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  // Se o usuário tem uma versão customizada de uma categoria padrão,
  // esconde a padrão e mostra só a dele
  const userCats = data.filter(c => c.user_id === userId)
  const userOverrideIds = userCats.map(c => c.parent_id).filter(Boolean)

  const filtered = data.filter(c => {
    if (c.user_id === null && userOverrideIds.includes(c.id)) return false
    return true
  })

  res.json({ data: filtered })
}

const createCategory = async (req, res) => {
  const userId = req.user.id
  const { name, icon, color, type, parent_id } = req.body

  if (!name || !type) {
    return res.status(400).json({
      error: { message: 'Nome e tipo são obrigatórios.' }
    })
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: userId, name, icon, color, type, parent_id: parent_id || null })
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: { message: error.message } })
  }

  res.status(201).json({ data })
}

const updateCategory = async (req, res) => {
  const userId = req.user.id
  const { id } = req.params
  const { name, color, type } = req.body

  // Verifica se é categoria padrão (user_id = null)
  const { data: original } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .single()

  if (!original) {
    return res.status(404).json({ error: { message: 'Categoria não encontrada.' } })
  }

  // Se for padrão, cria uma cópia personalizada para o usuário
  if (original.user_id === null) {
    // Verifica se já existe uma cópia
    const { data: existing } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .eq('parent_id', id)
      .is('deleted_at', null)
      .single()

    if (existing) {
      // Atualiza a cópia que já existe
      const { data, error } = await supabase
        .from('categories')
        .update({ name, color, type })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) return res.status(500).json({ error: { message: error.message } })
      return res.json({ data })
    }

    // Cria nova cópia personalizada
    const { data, error } = await supabase
      .from('categories')
      .insert({
        user_id: userId,
        name,
        color,
        type,
        icon: original.icon,
        parent_id: id
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: { message: error.message } })
    return res.status(201).json({ data })
  }

  // Se for categoria do próprio usuário, edita normalmente
  const { data, error } = await supabase
    .from('categories')
    .update({ name, color, type })
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) return res.status(500).json({ error: { message: error.message } })
  if (!data) return res.status(404).json({ error: { message: 'Categoria não encontrada.' } })

  res.json({ data })
}

const deleteCategory = async (req, res) => {
  const userId = req.user.id
  const { id } = req.params

  // Verifica se é categoria padrão
  const { data: original } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .single()

  if (!original) {
    return res.status(404).json({ error: { message: 'Categoria não encontrada.' } })
  }

  if (original.user_id === null) {
    // Cria uma cópia marcada como deletada para esse usuário
    // Assim a padrão continua existindo para outros usuários
    const { error } = await supabase
      .from('categories')
      .insert({
        user_id: userId,
        name: original.name,
        color: original.color,
        type: original.type,
        icon: original.icon,
        parent_id: id,
        deleted_at: new Date().toISOString()
      })

    if (error) return res.status(500).json({ error: { message: error.message } })
    return res.status(204).send()
  }

  // Se for do próprio usuário, soft delete normal
  const { error } = await supabase
    .from('categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return res.status(500).json({ error: { message: error.message } })
  res.status(204).send()
}

module.exports = { getCategories, createCategory, updateCategory, deleteCategory }
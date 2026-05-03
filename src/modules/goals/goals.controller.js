const { supabase } = require('../../lib/supabase')

const getGoals = async (req, res) => {
  const userId = req.userId

  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: { message: error.message } })
  res.json({ data })
}

const createGoal = async (req, res) => {
  const userId = req.userId
  const { name, target_amount_cents, current_amount_cents, deadline } = req.body

  if (!name || !target_amount_cents) {
    return res.status(400).json({ error: { message: 'Nome e valor alvo são obrigatórios.' } })
  }

  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: userId,
      name,
      target_amount_cents,
      current_amount_cents: current_amount_cents || 0,
      deadline: deadline || null,
      is_completed: false
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: { message: error.message } })
  res.status(201).json({ data })
}

const updateGoal = async (req, res) => {
  const userId = req.userId
  const { id } = req.params
  const { name, target_amount_cents, current_amount_cents, deadline } = req.body

  const is_completed = current_amount_cents >= target_amount_cents
  const completed_at = is_completed ? new Date().toISOString() : null

  const { data, error } = await supabase
    .from('goals')
    .update({ name, target_amount_cents, current_amount_cents, deadline: deadline || null, is_completed, completed_at })
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) return res.status(500).json({ error: { message: error.message } })
  if (!data) return res.status(404).json({ error: { message: 'Meta não encontrada.' } })
  res.json({ data })
}

const deleteGoal = async (req, res) => {
  const userId = req.userId
  const { id } = req.params

  const { error } = await supabase
    .from('goals')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return res.status(500).json({ error: { message: error.message } })
  res.status(204).send()
}

const depositGoal = async (req, res) => {
  const userId = req.userId
  const { id } = req.params
  const { amount_cents, account_id } = req.body

  if (!amount_cents || amount_cents <= 0) {
    return res.status(400).json({ error: { message: 'Valor do aporte é obrigatório.' } })
  }

  // Busca a meta
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single()

  if (goalError || !goal) {
    return res.status(404).json({ error: { message: 'Meta não encontrada.' } })
  }

  const newAmount = goal.current_amount_cents + amount_cents
  const is_completed = newAmount >= goal.target_amount_cents
  const completed_at = is_completed ? new Date().toISOString() : null

  // Atualiza o valor da meta
  const { data: updatedGoal, error: updateError } = await supabase
    .from('goals')
    .update({
      current_amount_cents: newAmount,
      is_completed,
      completed_at
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (updateError) return res.status(500).json({ error: { message: updateError.message } })

  // Se tiver conta vinculada, cria transação de saída
  if (account_id) {
    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        account_id,
        description: `Aporte — ${goal.name}`,
        amount_cents,
        type: 'expense',
        date: new Date().toISOString().split('T')[0],
        is_confirmed: true,
        payment_method: null
      })

    if (txError) return res.status(500).json({ error: { message: txError.message } })
  }

  res.json({ data: updatedGoal })
}

module.exports = { getGoals, createGoal, updateGoal, deleteGoal, depositGoal }
const { supabase } = require('../../lib/supabase')

// GET /api/transfers
const getTransfers = async (req, res) => {
  try {
    const userId = req.user.id

    const { data, error } = await supabase
      .from('transfers')
      .select(`
        *,
        from_account:accounts!transfers_from_account_id_fkey(id, name),
        to_account:accounts!transfers_to_account_id_fkey(id, name)
      `)
      .eq('user_id', userId)
      .order('date', { ascending: false })

    if (error) return res.status(500).json({ error: { message: error.message } })

    return res.json({ data })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

// POST /api/transfers
const createTransfer = async (req, res) => {
  try {
    const userId = req.user.id
    const { from_account_id, to_account_id, amount_cents, date, notes } = req.body

    if (!from_account_id || !to_account_id) {
      return res.status(400).json({ error: { message: 'Selecione as contas de origem e destino.' } })
    }
    if (!amount_cents || amount_cents <= 0) {
      return res.status(400).json({ error: { message: 'Valor deve ser maior que zero.' } })
    }
    if (from_account_id === to_account_id) {
      return res.status(400).json({ error: { message: 'Conta de origem e destino não podem ser iguais.' } })
    }

    // Verifica se as duas contas pertencem ao usuário
    const { data: accounts, error: accError } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .in('id', [from_account_id, to_account_id])
      .is('deleted_at', null)

    if (accError || accounts.length !== 2) {
      return res.status(404).json({ error: { message: 'Uma ou mais contas não encontradas.' } })
    }

    const transferDate = date || new Date().toISOString().split('T')[0]

    // Cria transação de SAÍDA na conta de origem
    const { data: fromTx, error: fromError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        account_id: from_account_id,
        description: notes || 'Transferência enviada',
        amount_cents,
        type: 'transfer',
        date: transferDate,
        payment_method: 'ted',
        is_confirmed: true
      })
      .select()
      .single()

    if (fromError) return res.status(500).json({ error: { message: fromError.message } })

    // Cria transação de ENTRADA na conta de destino
    const { data: toTx, error: toError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        account_id: to_account_id,
        description: notes || 'Transferência recebida',
        amount_cents,
        type: 'transfer',
        date: transferDate,
        payment_method: 'ted',
        is_confirmed: true
      })
      .select()
      .single()

    if (toError) return res.status(500).json({ error: { message: toError.message } })

    // Registra a transferência na tabela transfers
    const { data: transfer, error: transferError } = await supabase
      .from('transfers')
      .insert({
        user_id: userId,
        from_account_id,
        to_account_id,
        from_transaction_id: fromTx.id,
        to_transaction_id: toTx.id,
        amount_cents,
        date: transferDate,
        notes: notes || null
      })
      .select()
      .single()

    if (transferError) return res.status(500).json({ error: { message: transferError.message } })

    return res.status(201).json({ data: transfer })
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

// DELETE /api/transfers/:id
const deleteTransfer = async (req, res) => {
  try {
    const userId = req.user.id
    const { id } = req.params

    const { data: transfer, error: findError } = await supabase
      .from('transfers')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (findError || !transfer) {
      return res.status(404).json({ error: { message: 'Transferência não encontrada.' } })
    }

    // Soft delete nas duas transações geradas
    await supabase
      .from('transactions')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', [transfer.from_transaction_id, transfer.to_transaction_id])

    // Deleta o registro da transferência
    const { error } = await supabase
      .from('transfers')
      .delete()
      .eq('id', id)

    if (error) return res.status(500).json({ error: { message: error.message } })

    return res.status(204).send()
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } })
  }
}

module.exports = { getTransfers, createTransfer, deleteTransfer } 

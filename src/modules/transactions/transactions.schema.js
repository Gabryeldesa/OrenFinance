const { z } = require('zod')

const createTransactionSchema = z.object({
  amount_cents: z
    .number({ required_error: 'Valor é obrigatório' })
    .int('Valor deve ser em centavos (número inteiro)')
    .positive('Valor deve ser maior que zero'),

  type: z.enum(['income', 'expense'], {
    required_error: 'Tipo é obrigatório',
    invalid_type_error: 'Tipo deve ser "income" ou "expense"'
  }),

  description: z
    .string({ required_error: 'Descrição é obrigatória' })
    .min(2, 'Descrição deve ter pelo menos 2 caracteres')
    .max(255, 'Descrição deve ter no máximo 255 caracteres')
    .trim(),

  date: z
    .string({ required_error: 'Data é obrigatória' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),

  category_id: z
    .string()
    .uuid('ID da categoria inválido')
    .optional()
    .nullable(),

  account_id: z
    .string()
    .uuid('ID da conta inválido')
    .optional()
    .nullable(),

  credit_card_id: z
    .string()
    .uuid('ID do cartão inválido')
    .optional()
    .nullable(),

  payment_method: z.enum([
    'pix', 'credit_card', 'debit_card', 'cash',
    'boleto', 'ted', 'doc', 'other'
  ]).optional().nullable(),

  is_confirmed: z.boolean().default(true),

  notes: z
    .string()
    .max(500, 'Observações devem ter no máximo 500 caracteres')
    .optional()
    .nullable()
})

const updateTransactionSchema = createTransactionSchema.partial()

module.exports = { createTransactionSchema, updateTransactionSchema }
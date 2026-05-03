// src/modules/accounts/accounts.schema.js
const { z } = require('zod')

const createAccountSchema = z.object({
  name: z
    .string({ required_error: 'Nome é obrigatório' })
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(50, 'Nome deve ter no máximo 50 caracteres')
    .trim(),

  type: z.enum(['checking', 'savings', 'cash', 'investment', 'other'], {
    required_error: 'Tipo é obrigatório',
    invalid_type_error: 'Tipo deve ser: checking, savings, cash, investment ou other'
  }),

  initial_balance: z
    .number({ invalid_type_error: 'Saldo inicial deve ser um número' })
    .int('Saldo deve ser em centavos (número inteiro)')
    .default(0),

  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve ser hex válido, ex: #FF5733')
    .optional()
    .nullable(),

  icon: z
    .string()
    .max(50)
    .optional()
    .nullable()
})

const updateAccountSchema = createAccountSchema.partial()

module.exports = { createAccountSchema, updateAccountSchema }
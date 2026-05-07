const logger = require('../lib/logger')

const errorHandler = (err, req, res, next) => {
  logger.error(`${req.method} ${req.url} — ${err.message}`)

  // Erro de validação do Zod (dados inválidos enviados pelo usuário)
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos.',
        details: err.errors.map(e => ({
          campo: e.path.join('.'),
          mensagem: e.message
        }))
      }
    })
  }

  // Erro de token JWT inválido
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Token inválido. Faça login novamente.'
      }
    })
  }

  // Qualquer outro erro não tratado
  res.status(err.status || 500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'Erro interno do servidor.'
    }
  })
}

module.exports = { errorHandler }
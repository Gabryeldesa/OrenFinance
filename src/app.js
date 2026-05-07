require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const compression = require('compression')

const categoryRoutes = require('./modules/categories/categories.routes')
const accountRoutes = require('./modules/accounts/accounts.routes')
const transactionRoutes = require('./modules/transactions/transactions.routes')
const { errorHandler } = require('./middleware/errorHandler')

const app = express()
const PORT = process.env.PORT || 3001

app.use(helmet())
app.use(compression())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: {
    error: { code: 'RATE_LIMIT', message: 'Muitas requisições. Aguarde 1 minuto.' }
  }
}))
app.use(express.json())
app.use((req, res, next) => {
  req.setTimeout(10000, () => {
    res.status(408).json({
      error: { code: 'TIMEOUT', message: 'Requisição demorou demais. Tente novamente.' }
    })
  })
  next()
})

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  })
})

// Rotas da API
app.use('/api/categories', categoryRoutes)
app.use('/api/accounts', accountRoutes)
app.use('/api/transactions', transactionRoutes)
app.use('/api/goals', require('./modules/goals/goals.routes'))
app.use('/api/admin', require('./modules/admin/admin.routes'))
app.use('/api/settings', require('./modules/settings/settings.routes'))
app.use('/api/cards', require('./modules/cards/cards.routes'))
app.use('/api/recurring', require('./modules/recurring/recurring.routes'))
app.use('/api/import', require('./modules/import/import.routes'))
app.use('/api/transfers', require('./modules/transfers/transfers.routes'))
const calendarRoutes = require('./modules/calendar/calendar.routes')
app.use('/api/calendar', calendarRoutes)
app.use('/api/insights', require('./modules/insights/insights.routes'))
app.use('/api/alerts', require('./modules/alerts/alerts.routes'))

// Rota não encontrada
app.use((req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Rota ${req.method} ${req.url} não encontrada` }
  })
})

// Tratador global de erros — deve ser o ÚLTIMO
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`)
  console.log(`📋 Ambiente: ${process.env.NODE_ENV}`)
})
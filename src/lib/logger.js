const winston = require('winston')

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/erros.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/geral.log' })
  ]
})

module.exports = logger
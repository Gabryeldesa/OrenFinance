const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middleware/auth')
const { getAlerts } = require('./alerts.controller')

router.use(authenticate)
router.get('/', getAlerts)

module.exports = router
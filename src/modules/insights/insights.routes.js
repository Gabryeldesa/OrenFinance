const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middleware/auth')
const { getInsights } = require('./insights.controller')

router.get('/', authenticate, getInsights)

module.exports = router
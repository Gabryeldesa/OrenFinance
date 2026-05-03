const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middleware/auth')
const { getCalendar } = require('./calendar.controller')

router.get('/', authenticate, getCalendar)

module.exports = router
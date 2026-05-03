const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middleware/auth')
const {
  getRecurring, createRecurring, updateRecurring,
  deleteRecurring, applyRecurring, autoApplyAll
} = require('./recurring.controller')

router.use(authenticate)
router.get('/', getRecurring)
router.post('/', createRecurring)
router.put('/:id', updateRecurring)
router.delete('/:id', deleteRecurring)
router.post('/apply', applyRecurring)
router.post('/auto', autoApplyAll)

module.exports = router
const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middleware/auth')
const {
  getCards,
  createCard,
  updateCard,
  deleteCard,
  getInvoices,
  payInvoice
} = require('./cards.controller')

router.use(authenticate)

router.get('/', getCards)
router.post('/', createCard)
router.put('/:id', updateCard)
router.delete('/:id', deleteCard)
router.get('/:id/invoices', getInvoices)
router.put('/:id/invoices/:invoiceId/pay', payInvoice)

module.exports = router
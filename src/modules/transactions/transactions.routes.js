// src/modules/transactions/transactions.routes.js
const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middleware/auth')
const {
  getTransactions,
  getSummary,
  createTransaction,
  updateTransaction,
  deleteTransaction
} = require('./transactions.controller')

router.get('/summary',  authenticate, getSummary)
router.get('/',         authenticate, getTransactions)
router.post('/',        authenticate, createTransaction)
router.put('/:id',      authenticate, updateTransaction)
router.delete('/:id',   authenticate, deleteTransaction)

module.exports = router
// src/modules/accounts/accounts.routes.js
const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middleware/auth')
const { getAccounts, createAccount, updateAccount, deleteAccount } = require('./accounts.controller')

router.get('/',       authenticate, getAccounts)
router.post('/',      authenticate, createAccount)
router.put('/:id',    authenticate, updateAccount)
router.delete('/:id', authenticate, deleteAccount)

module.exports = router
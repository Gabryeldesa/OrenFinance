 const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middleware/auth')
const { getTransfers, createTransfer, deleteTransfer } = require('./transfers.controller')

router.use(authenticate)

router.get('/', getTransfers)
router.post('/', createTransfer)
router.delete('/:id', deleteTransfer)

module.exports = router

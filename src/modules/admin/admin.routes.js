const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middleware/auth')
const { checkAdmin, checkIsAdmin, getUsers, blockUser, deleteUser, getUserData } = require('./admin.controller')

router.get('/check', authenticate, checkIsAdmin)

router.use(authenticate)
router.use(checkAdmin)

router.get('/users', getUsers)
router.get('/users/:id/data', getUserData)
router.patch('/users/:id/block', blockUser)
router.delete('/users/:id', deleteUser)

module.exports = router
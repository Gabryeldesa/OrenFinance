const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middleware/auth')
const {
  checkAdmin, checkIsAdmin,
  getUsers, blockUser, deleteUser, getUserData
} = require('./admin.controller')

// Rota pública para verificar se é admin (só precisa de autenticação)
router.get('/check', authenticate, checkIsAdmin)

// Todas as rotas abaixo exigem auth + ser admin
router.use(authenticate)
router.use(checkAdmin)

router.get('/users', getUsers)
router.get('/users/:id/data', getUserData)
router.patch('/users/:id/block', blockUser)
router.delete('/users/:id', deleteUser)

module.exports = router
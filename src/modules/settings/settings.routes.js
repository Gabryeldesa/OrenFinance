const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middleware/auth')
const { getProfile, updateProfile, changePassword, deleteAccount } = require('./settings.controller')

router.use(authenticate)

router.get('/profile', getProfile)
router.put('/profile', updateProfile)
router.put('/password', changePassword)
router.delete('/account', deleteAccount)

module.exports = router
const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middleware/auth')
const { getGoals, createGoal, updateGoal, deleteGoal, depositGoal } = require('./goals.controller')

router.use(authenticate)

router.get('/', getGoals)
router.post('/', createGoal)
router.put('/:id', updateGoal)
router.delete('/:id', deleteGoal)
router.post('/:id/deposit', depositGoal)

module.exports = router
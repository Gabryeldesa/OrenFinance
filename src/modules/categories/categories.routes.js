const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middleware/auth')
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} = require('./categories.controller')

router.get('/',       authenticate, getCategories)
router.post('/',      authenticate, createCategory)
router.put('/:id',    authenticate, updateCategory)
router.delete('/:id', authenticate, deleteCategory)

module.exports = router
const express = require('express')
const router = express.Router()
const multer = require('multer')
const { authenticate } = require('../../middleware/auth')
const { preview, confirm } = require('./import.controller')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true)
    } else {
      cb(new Error('Apenas arquivos CSV são suportados.'))
    }
  }
})

router.use(authenticate)
router.post('/preview', upload.single('file'), preview)
router.post('/confirm', confirm)

module.exports = router
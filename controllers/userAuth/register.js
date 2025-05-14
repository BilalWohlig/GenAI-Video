const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const UserAuth = require('../../services/userAuth/user')

const validationSchema = {
  type: 'object',
  required: true,
  properties: {
    email: { type: 'string' },
    password: { type: 'string' },
    type: { type: 'string' }
  }
}

const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'body')
}

const register = async (req, res) => {
  try {
    console.log('Controller received request:', req.body)
    const user = await UserAuth.register(req.body)
    res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: user })
  } catch (err) {
    console.log('Register Error', err)
    res.status(500).json({ ...__constants.RESPONSE_MESSAGES.SERVER_ERROR, error: err.message })
  }
}

router.post('/register', validation, register)

module.exports = router

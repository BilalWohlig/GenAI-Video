const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const UserAuth = require('../../services/userAuth/user')
const Authentication = require('../../middlewares/auth/authentication')

const validationSchema = {
  type: 'object',
  required: true,
  properties: {
  }
}
const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'body')
}

const oAuthLogin = async (req, res) => {
  try {
    console.log('Controller received id:', req.body)
    const user = await UserAuth.oAuthLogin(req.body)
    // Set JWT token and respond with user data
    const tokenMiddleware = Authentication.setToken(user, 50000)
    if (tokenMiddleware) {
      res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: user })
    }
  } catch (err) {
    console.log('oAuthlogin Error', err)
    return res.json({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.err || err })
  }
}

router.post('/oAuthLogin', Authentication.authenticate('jwt', { session: false }), validation, oAuthLogin)

module.exports = router

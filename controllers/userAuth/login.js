const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const UserAuth = require('../../services/userAuth/user')
const Authentication = require('../../middlewares/auth/authentication')
// const SceneService = require('../../services/scenes/sceneService')

const validationSchema = {
  type: 'object',
  required: true,
  properties: {
  }
}
const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'body')
}

const login = async (req, res) => {
  try {
    console.log('Controller received id:', req.body)
    const user = await UserAuth.login(req.body)
    // Set JWT token and respond with user data
    const tokenMiddleware = Authentication.setToken(user, 50000000)
    user.token = tokenMiddleware
    console.log('Token:', tokenMiddleware)
    if (tokenMiddleware) {
      res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: user })
    }
  } catch (err) {
    console.log('login Error', err)
    return res.json({ type: err.type || __constants.RESPONSE_MESSAGES.LOGIN_FAILED, err: err.err || err })
  }
}

router.post('/login', validation, login)

module.exports = router

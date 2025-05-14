const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const Authentication = require('../../middlewares/auth/authentication')
const UserDetails = require('../../services/userDetails/userDetails')

const validationSchema = {
  type: 'object',
  required: true,
  properties: {
  }
}
const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'body')
}

const getUserProfile = async (req, res) => {
  try {
    const result = await UserDetails.getUserProfile(req.user)
    res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: result })
  } catch (err) {
    console.log('getUserProfile Error', err)
    return res.json({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.err || err })
  }
}

router.get('/getUserProfile', Authentication.authenticate('jwt', { session: false }), validation, getUserProfile)

module.exports = router

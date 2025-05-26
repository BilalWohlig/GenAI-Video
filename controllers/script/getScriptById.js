const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const ScriptService = require('../../services/script/scriptService')
const Authentication = require('../../middlewares/auth/authentication')

const validationSchema = {
  type: 'object',
  required: true,
  properties: {}
}

const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'params')
}

const getScriptById = async (req, res) => {
  try {
    console.log('Authenticated user:', req.user)
    const { id: scriptId } = req.params
    const user = req.user

    const script = await ScriptService.getScriptById(scriptId, user)

    return res.json({
      ...__constants.RESPONSE_MESSAGES.SUCCESS,
      data: script
    })
  } catch (err) {
    console.error('getScriptById Error', err)
    return res.json({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.err || err
    })
  }
}

router.get('/getScriptById/:id',
  Authentication.authenticate('jwt', { session: false }),
  validation,
  getScriptById
)

module.exports = router

const express = require('express')
const router = express.Router()
const validationOfAPI = require('../../middlewares/validation')
const ScriptService = require('../../services/script/scriptService')
const __constants = require('../../config/constants')
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

const editScriptSceneByIndex = async (req, res) => {
  try {
    const { scriptId, sceneIndex, updates } = req.body

    if (!scriptId || sceneIndex === undefined || !updates) {
      return res.status(400).json({
        type: 'error',
        err: 'scriptId, sceneIndex and updates are required'
      })
    }

    const updatedScript = await ScriptService.editScriptSceneByIndex(scriptId, sceneIndex, updates, req.user)

    res.json({
      ...__constants.RESPONSE_MESSAGES.SUCCESS,
      data: updatedScript
    })
  } catch (err) {
    res.status(500).json({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.err || err })
  }
}
router.put('/editScriptSceneByIndex',
  validation,
  Authentication.authenticate('jwt', { session: false }),
  editScriptSceneByIndex
)

module.exports = router

const express = require('express')
const router = express.Router()
const validationOfAPI = require('../../middlewares/validation')
const ScriptService = require('../../services/script/scriptService')

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

    const updatedScript = await ScriptService.editScriptSceneByIndex(scriptId, sceneIndex, updates)

    res.json({
      type: 'success',
      message: 'Scene updated successfully',
      data: updatedScript
    })
  } catch (err) {
    res.status(500).json({
      type: 'error',
      err: err.message || 'Internal Server Error'
    })
  }
}
router.put('/editScriptSceneByIndex',
  validation,
  editScriptSceneByIndex
)

module.exports = router

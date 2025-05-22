const express = require('express')
const router = express.Router()
const ScriptService = require('../../services/script/scriptService')
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')

const validationSchema = {
  type: 'object',
  required: ['scriptId'],
  properties: {
    scriptId: { type: 'string' },
    sceneIdx: { type: 'number' } // optional
  }
}

const validation = (req, res, next) =>
  validationOfAPI(req, res, next, validationSchema, 'body')

const generateScriptImages = async (req, res) => {
  try {
    const { scriptId, sceneIdx } = req.body
    const result = await ScriptService.generateImagesForScript(scriptId, sceneIdx)
    res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: result })
  } catch (err) {
    console.error('Error generating images:', err)
    res.status(500).json({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.err || err
    })
  }
}

router.post('/generateScriptImages',
  validation,
  generateScriptImages
)

module.exports = router

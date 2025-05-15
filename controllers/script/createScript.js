const express = require('express')
const router = express.Router()
const ScriptService = require('../../services/script/scriptService')
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
// const Authentication = require('../../middlewares/auth/authentication')

const validationSchema = {
  type: 'object',
  required: ['title', 'topic', 'numberOfScenes', 'characterId'],
  properties: {
    title: { type: 'string' },
    topic: { type: 'string' },
    numberOfScenes: { type: 'string' },
    characterId: {
      type: 'array',
      items: { type: 'string' }
    }
  }
}

const validation = (req, res, next) =>
  validationOfAPI(req, res, next, validationSchema, 'body')

const createScript = async (req, res) => {
  try {
    const script = await ScriptService.createScript(req.body, req.user)
    res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: script })
  } catch (err) {
    console.error('Error creating script:', err)
    res.status(400).json({
      type: 'CREATE_SCRIPT_FAILED',
      message: err.message || 'Unexpected error',
      error: err
    })
  }
}

router.post('/createScript',
  // Authentication.authenticate('jwt', { session: false }),
  validation,
  createScript
)

module.exports = router

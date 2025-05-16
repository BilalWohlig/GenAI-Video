const express = require('express')
const router = express.Router()
const DemoService = require('../../services/demo/demoService')
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
    const script = await DemoService.createScript(req.body, req.user)
    res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: script })
  } catch (err) {
    console.error('Error creating script:', err)
    res.status(500).json({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.err || err })
  }
}

router.post('/createScript',
  // Authentication.authenticate('jwt', { session: false }),
  validation,
  createScript
)

module.exports = router

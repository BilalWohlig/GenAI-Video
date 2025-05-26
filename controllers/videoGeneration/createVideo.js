const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const videoGenerationService = require('../../services/videoGeneration/videoGeneration')
const Authentication = require('../../middlewares/auth/authentication')

const validationSchema = {
  type: 'object',
  required: ['prompt', 'image'],
  properties: {
    prompt: { type: 'string' },
    image: { type: 'string', format: 'uri' }
  }
}

const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'body')
}

const handleError = (err, res) => {
  console.log('Error:', err)
  res.status(400).json({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.message || err })
}

const createVideo = async (req, res) => {
  try {
    const data = await videoGenerationService.generateImageToVideo({
      prompt: req.body.prompt,
      image: req.body.image
    })
    res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data })
  } catch (err) {
    handleError(err, res)
  }
}

router.post(
  '/createVideo',
  Authentication.authenticate('jwt', { session: false }),
  validation,
  createVideo
)

module.exports = router

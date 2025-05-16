
const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const videoGenerationService = require('../../services/videoGeneration/videoGeneration')
const Authentication = require('../../middlewares/auth/authentication')

const validationSchema =
{
  type: 'object',
  required: ['scriptId'],
  properties: {
    projectId: { type: 'string' }
  }
}
const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'body')
}
const handleError = (err, res) => {
  console.log('Error:', err)
  res.status(400).json({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.message || err })
}
const getVideo = async (req, res) => {
  try {
    const data = await videoGenerationService.getVideo(req.body.projectId)

    res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: data })
  } catch (err) {
    handleError(err, res)
  }
}
router.post(
  '/getVideo',
  Authentication.authenticate('jwt', { session: false }),
  validation,
  getVideo
)

module.exports = router

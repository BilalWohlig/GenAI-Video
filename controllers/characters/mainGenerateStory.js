const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const CharacterService = require('../../services/characters/charactersService')
const Authentication = require('../../middlewares/auth/authentication')

const validationSchema = {
  type: 'object',
  required: true,
  properties: {
    topic: { type: 'string' }
  }
}
const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'body')
}

const mainGenerateStory = async (req, res) => {
  try {
    const { topic } = req.body
    const userId = req.user.id

    const characters = await CharacterService.mainGenerateStory(topic, userId)

    res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: characters })
  } catch (err) {
    console.error('mainGenerateStory Error:', err)
    return res.json({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.message || err })
  }
}

router.post(
  '/mainGenerateStory',
  Authentication.authenticate('jwt', { session: false }),
  validation,
  mainGenerateStory
)

module.exports = router

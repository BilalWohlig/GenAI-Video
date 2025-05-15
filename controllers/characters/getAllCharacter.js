const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const characterService = require('../../services/characters/charactersService')
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

const getAllCharacters = async (req, res) => {
  try {
    const page = parseInt(req.query.page)
    const limit = parseInt(req.query.limit)
    const characterName = req.query.name
    const { category } = req.body
    const result = await characterService.getAllCharacters(characterName, category, page, limit, req.user)
    res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: result })
  } catch (err) {
    console.log('getAllCharacters Error', err)
    return res.json({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.err || err })
  }
}

router.get('/getAllCharacters', Authentication.authenticate('jwt', { session: false }), validation, getAllCharacters)

module.exports = router

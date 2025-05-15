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

const getCharacterById = async (req, res) => {
  try {
    const { id } = req.params
    console.log('Controller received id:', id)
    const { character, characterHistory } = await characterService.getCharacterById(id, req.user)
    res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: { character, characterHistory } })
  } catch (err) {
    console.log('getCharacterById Error', err)
    return res.json({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.err || err })
  }
}

router.get('/getCharacterById/:id', Authentication.authenticate('jwt', { session: false }), validation, getCharacterById)

module.exports = router

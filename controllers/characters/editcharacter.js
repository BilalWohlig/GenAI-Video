const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const CharacterImages = require('../../services/characters/charactersService')
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

const editCharacter = async (req, res) => {
  try {
    const { id } = req.params
    // console.log('>>>>>', req.body)
    const result = await CharacterImages.editCharacter(id, req.body, req.user)
    // const imageId = result.imageId
    res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: result })
  } catch (err) {
    console.log('editCharacter Error', err)
    return res.json({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.err || err })
  }
}

router.put('/editCharacter/:id', Authentication.authenticate('jwt', { session: false }), validation, editCharacter)

module.exports = router

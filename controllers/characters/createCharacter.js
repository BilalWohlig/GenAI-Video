const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const CharacterImages = require('../../services/characters/charactersService')
const Authentication = require('../../middlewares/auth/authentication')
const multer = require('multer')
const helper = require('../../helper/helper')

const storage = multer.memoryStorage()

const upload = multer({ storage: storage })

const validationSchema = {
  type: 'object',
  required: true,
  properties: {
  }
}
const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'body')
}

const createCharacter = async (req, res) => {
  try {
    let referenceImageUrl = null
    console.log('>>>>>>>>>>>>', req.file)
    if (req.file && req.file.buffer) {
      referenceImageUrl = await helper.uploadImageToGCP(req.file.buffer, req.file.originalname, req.file.mimetype)
    }

    // Step 2: Create the character with the reference image URL
    const characterData = {
      ...req.body,
      referenceImage: referenceImageUrl // Add the reference image URL to the character data
    }
    const result = await CharacterImages.createCharacter(characterData, req.user)
    // const imageId = result.imageId
    console.log('Character Created: ', result)
    // Socket.IO setup

    res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: result })
  } catch (err) {
    console.log('createCharacter Error', err)
    return res.json({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.err || err })
  }
}

router.post('/createCharacter', Authentication.authenticate('jwt', { session: false }), upload.single('referenceImage'), validation, createCharacter)

module.exports = router

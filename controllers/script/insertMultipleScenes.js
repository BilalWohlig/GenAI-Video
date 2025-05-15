const express = require('express')
const router = express.Router()
const ScriptService = require('../../services/script/scriptService')
const validationOfAPI = require('../../middlewares/validation')

const validationSchema = {
  type: 'object',
  required: ['scriptId', 'scenesToInsert'],
  properties: {
    scriptId: { type: 'string' },
    scenesToInsert: {
      type: 'array',
      items: {
        type: 'object',
        required: ['index', 'scene'],
        properties: {
          index: { type: 'number' },
          scene: {
            type: 'object',
            required: ['narration', 'textToImagePrompt', 'imageToVideoPrompt'],
            properties: {
              narration: { type: 'string' },
              textToImagePrompt: { type: 'string' },
              imageToVideoPrompt: { type: 'string' }
            }
          }
        }
      }
    }
  }
}
const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'body')
}

const insertMultipleScenes = async (req, res) => {
  try {
    const { scriptId, scenesToInsert } = req.body

    if (!scriptId || !Array.isArray(scenesToInsert)) {
      return res.status(400).json({
        type: 'error',
        err: 'scriptId and scenesToInsert[] are required'
      })
    }

    const updatedScript = await ScriptService.insertMultipleScenes(scriptId, scenesToInsert)

    res.json({
      type: 'success',
      message: 'Scenes inserted successfully',
      data: updatedScript
    })
  } catch (err) {
    res.status(500).json({
      type: 'error',
      err: err.message || 'Internal Server Error'
    })
  }
}

router.put('/insertMultipleScenes', validation, insertMultipleScenes)

module.exports = router

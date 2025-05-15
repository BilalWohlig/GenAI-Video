const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const ScriptService = require('../../services/script/scriptService')
// const Authentication = require('../../middlewares/auth/authentication')

const validationSchema = {
  type: 'object',
  properties: {
  }
}

const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'body')
}

const getAllScripts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 15
    // const { userId } = req.body
    const result = await ScriptService.getAllScripts({ page, limit })
    res.json({
      ...__constants.RESPONSE_MESSAGES.SUCCESS,
      data: result.scripts,
      pagination: result.pagination
    })
  } catch (err) {
    console.error('getAllScripts Error', err)
    return res.json({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.err || err
    })
  }
}

router.post('/getAllScripts',
  // Authentication.authenticate('jwt', { session: false }),
  validation, getAllScripts)

module.exports = router

const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const Authentication = require('../../middlewares/auth/authentication')
const UserProfile = require('../../mongooseSchema/profileModel')
const UserDetails = require('../../services/userDetails/userDetails')
const multer = require('multer')
const helper = require('../../helper/helper')

// Multer setup for in-memory file storage
const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

// Validation schema (empty here, customize as needed)
const validationSchema = {
  type: 'object',
  required: true,
  properties: {}
}

const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'body')
}

// Controller function
const editUserProfile = async (req, res) => {
  try {
    // Update user profile fields from body
    const result = await UserDetails.editUserProfile(req.user, req.body, req.file)

    // Handle profile image upload if a file is present
    if (req.file && req.file.buffer) {
      console.log('📤 Uploading profile image using Helper.uploadImageToGCP')

      const uploadedImageUrl = await helper.uploadImageToGCP(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      )

      if (uploadedImageUrl) {
        // Update user profile with new image URL
        await UserProfile.findOneAndUpdate(
          { userID: req.user.id },
          { profileImage: uploadedImageUrl }
        )
        console.log('✅ Profile image updated for user:', req.user.id)
      } else {
        console.warn('⚠️ Failed to upload profile image')
      }
    } else {
      console.log('ℹ️ No profile image provided in the request')
    }

    // Return updated data
    res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: result })
  } catch (err) {
    console.error('❌ editUserProfile Error:', err)
    return res.json({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.err || err
    })
  }
}

// PUT route definition
router.put(
  '/editUserProfile',
  Authentication.authenticate('jwt', { session: false }),
  validation,
  upload.single('profileImage'),
  editUserProfile
)

module.exports = router

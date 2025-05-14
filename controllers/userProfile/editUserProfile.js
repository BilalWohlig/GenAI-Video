const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const Authentication = require('../../middlewares/auth/authentication')
const UserProfile = require('../../mongooseSchema/profileModel')
const UserDetails = require('../../services/userDetails/userDetails')
const path = require('path')
const fs = require('fs')
// const stream = require('stream')
// const { promisify } = require('util')
const FormData = require('form-data')
const axios = require('axios')
const moment = require('moment')
const multer = require('multer')

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

const handleProfileImage = async (profileImageBuffer, id) => {
//   const pipeline = promisify(stream.pipeline)
  const dummyDate = moment().format('DDMMYYYY_HH:mm:ss')
  const filePath = 'image_' + dummyDate + '.jpg'
  const newFilePath = path.join(__dirname, filePath)
  const writer = fs.createWriteStream(newFilePath)

  // Write the buffer to the file
  writer.write(profileImageBuffer)
  writer.end()

  // Wait for the stream to finish writing the file
  await new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
  })

  const formData = new FormData()
  formData.append('file', fs.createReadStream(newFilePath))

  const config = {
    method: 'post',
    url: 'http://localhost:1330/api/upload',
    data: formData,
    headers: {
      ...formData.getHeaders()
    }
  }

  console.log('Uploading image')
  const imageData = await axios(config)
  const s3Url = imageData.data.file
  console.log('Image data:', s3Url)

  // Update the profile image URL in the user's profile
  console.log(id)
  const updatedUser = await UserProfile.findOneAndUpdate({ userID: id }, { profileImage: s3Url })
  // Delete the temporary file after everything is done
  console.log('Updated user profile:', updatedUser)
  fs.unlinkSync(newFilePath)
}

const editUserProfile = async (req, res) => {
  try {
    // Edit the user profile details
    const result = await UserDetails.editUserProfile(req.user, req.body, req.file)
    // Check if a new profile image was uploaded
    if (req.file && req.file.buffer) {
      console.log('Profile image uploaded, handling image processing')
      await handleProfileImage(req.file.buffer, req.user.id)
    } else {
      console.log('No profile image provided in the request')
    }

    // Send the updated profile back to the client
    res.json({ ...__constants.RESPONSE_MESSAGES.SUCCESS, data: result })
  } catch (err) {
    console.error('editUserProfile Error', err)
    return res.json({ type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR, err: err.err || err })
  }
}

router.put('/editUserProfile', Authentication.authenticate('jwt', { session: false }), validation, upload.single('profileImage'), editUserProfile)

module.exports = router

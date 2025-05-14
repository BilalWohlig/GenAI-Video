const uploadUrl = `${process.env.UPLOAD_URL}/api/upload`
const FormData = require('form-data')
const axios = require('axios')
const { v4: uuidv4 } = require('uuid')
const fs = require('fs')
const dotenv = require('dotenv')
dotenv.config()
const ImageKit = require('imagekit')
const path = require('path')
const imagekit = new ImageKit({
  publicKey: process.env.IMAGE_KIT_PUBLIC_KEY,
  privateKey: process.env.IMAGE_KIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGE_KIT_URL
})

class Helper {
  async uploadImageToGCP (fileBuffer, originalFileName, mimeType) {
    const newFileName = `${uuidv4()}${path.extname(originalFileName)}`

    const form = new FormData()
    form.append('file', fileBuffer, {
      filename: newFileName,
      contentType: mimeType,
      knownLength: fileBuffer.length
    })

    try {
      const response = await axios.post(uploadUrl, form, {
        headers: {
          ...form.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      })
      console.log(`✅ Successfully uploaded to GCP: ${newFileName} ->`, response.data)

      const imageURL = await this.uploadImageAndSaveToImageKit(response.data.file, originalFileName)

      console.log('🚀 ~ helper ~ uploadImageToGCP ~ imageURL:', imageURL)
      return imageURL
    } catch (error) {
      console.error('❌ Error uploading to GCP:', error.response?.data || error.message)
      return null
    }
  }

  async uploadImageAndSaveToImageKit (gcpURL, destinationName) {
    try {
      const gcpFileUrl = gcpURL
      console.log('✅ Uploaded to GCP:', gcpFileUrl)

      const imagekitUploadResponse = await imagekit.upload({
        file: gcpFileUrl,
        fileName: path.basename(destinationName),
        useUniqueFileName: true
      })

      console.log('✅ Uploaded to ImageKit:', imagekitUploadResponse.url)
      return imagekitUploadResponse.url
    } catch (error) {
      console.error('❌ Error:', error)
      throw error
    }
  }

  async saveBase64ImageToGcp (b64Json, filename = 'image.png', directory = '../../images') {
    try {
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true })
      }
      const mimeType = b64Json.split(';')[0].split(':')[1]
      const buffer = Buffer.from(b64Json, 'base64')
      const imageUrl = await this.uploadImageToGCP(buffer, filename, mimeType)
      return imageUrl
    } catch (error) {
      console.error('❌ Error saving base64 image:', error)
      throw error
    }
  }
}

module.exports = new Helper()

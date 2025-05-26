const helper = require('../../helper/helper')
const scriptSchema = require('../../mongooseSchema/scriptSchema')
const Replicate = require('replicate')
const axios = require('axios')
const mime = require('mime-types') // for guessing content type
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
})
const fetch = require('node-fetch')
const API_KEY = process.env.KLING_JWT_TOKEN
console.log('API_KEY:', API_KEY)

class UserDesignService {
  async createVideo (scriptId, sceneIndex) {
    try {
      console.log('🎬 createVideo called with scriptId:', scriptId, 'sceneIndex:', sceneIndex)

      const scriptDoc = await scriptSchema.findById(scriptId)
      if (!scriptDoc) throw new Error('Script not found')

      const scene = scriptDoc.script[sceneIndex]
      if (!scene) throw new Error(`Scene at index ${sceneIndex} not found`)

      if (!scene.imageToVideoPrompt || !scene.imageUrl) {
        throw new Error('Scene is missing imageToVideoPrompt or imageUrl')
      }

      // Prepare object for video generation
      const obj = {
        name: `${scriptId}_scene${sceneIndex}.mp4`,
        prompt: scene.imageToVideoPrompt,
        imageUrl: scene.imageUrl
      }

      // Respond immediately
      setImmediate(async () => {
        try {
          console.log('⚙️ [Background] Starting generateVideoFromImage with:', obj)
          const videoUrl = await this.generateVideoFromImage(obj)
          console.log('✅ [Background] Video generated. URL:', videoUrl)

          // Append video URL to scene
          const freshDoc = await scriptSchema.findById(scriptId) // Fetch fresh copy
          if (!freshDoc?.script[sceneIndex]) return console.warn('⚠️ Scene disappeared from DB')

          freshDoc.script[sceneIndex].videoUrl = videoUrl
          freshDoc.markModified('script')
          await freshDoc.save()
          console.log('💾 [Background] Script updated with videoUrl.')
        } catch (bgErr) {
          console.error('🔥 [Background] Error during video generation:', bgErr.message)
        }
      })

      return { status: 'processing', message: 'Video generation started in background' }
    } catch (err) {
      console.error('❌ Error in createVideo:', err)
      throw new Error(err.message || 'Failed to create video')
    }
  }

  async generateVideoFromImage (options) {
    try {
      console.log('🚧 generateVideoFromImage called with:', options)

      const input = {
        prompt: options.prompt,
        duration: 10,
        cfg_scale: 0.5,
        start_image: options.imageUrl,
        aspect_ratio: '16:9',
        negative_prompt: ''
      }

      console.log('📤 Sending input to Replicate:', input)

      console.time('⏱️ VideoGenerationTimer')
      const output = await replicate.run('kwaivgi/kling-v1.6-pro', { input })
      console.timeEnd('⏱️ VideoGenerationTimer')

      const replicateVideoUrl = output.url().href
      console.log('🎞️ Replicate video URL:', replicateVideoUrl)

      // Download video
      const res = await axios.get(replicateVideoUrl, { responseType: 'arraybuffer' })
      const fileBuffer = res.data
      const mimeType = mime.lookup(replicateVideoUrl) || 'video/mp4'

      // Upload to GCP and ImageKit via helper
      const finalUrl = await helper.uploadImageToGCP(fileBuffer, options.name, mimeType)

      console.log('✅ Final ImageKit video URL:', finalUrl)
      return finalUrl
    } catch (error) {
      console.error('🔥 Error in generateVideoFromImage:', error.response?.data || error.message)
      throw error
    }
  }

  async getVideo (scriptId) {
    try {
      console.log('📥 getVideo called for scriptId:', scriptId)

      const data = await scriptSchema.find({ scriptId: scriptId })
      return data
    } catch (err) {
      console.error('❌ Error in getVideo:', err)
      throw new Error(err)
    }
  }

  async generateImageToVideo ({ prompt, image }) {
    const response = await fetch('https://api.klingai.com/v1/videos/image2video', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model_name: 'kling-v2-master',
        mode: 'pro',
        duration: '10',
        image,
        prompt,
        cfg_scale: 0.5
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Request failed: ${response.status} - ${error}`)
    }

    const result = await response.json()
    console.log('Video generation response:', result)
    return result
  }
}

module.exports = new UserDesignService()


const helper = require('../../helper/helper')
const scriptSchema = require('../../mongooseSchema/scriptSchema')
const Replicate = require('replicate')

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
})
class UserDesignService {
  async createVideo (scriptId) {
    try {
      // const script = await scriptSchema.findById(scriptId)

      const obj = {}
      obj.name = 'ChatGPT%20Image%20May%2016,%202025,%2010_51_04%20AM.png?updatedAt=1747373003354'
      obj.prompt = 'A cinematic scene inside a high-energy boxing locker room. The atmosphere is tense and electric, with muffled crowd roars and the rhythmic sound of gloves hitting punching bags in the background. Dhruv and Wajid, two determined fighters in boxing robes and hand wraps, sit side by side on a wooden bench under flickering overhead lights. The camera slowly pans around them as they talk quietly and seriously, strategizing before the match. Their expressions are intense and focused, showing deep brotherhood and unspoken trust. Steam rises from their bodies, sweat glistens on their skin, and the room hums with anticipation. Background details include hanging towels, lockers, and teammates warming up. Dialogue is subtle, emotional, and motivating. The mood is cinematic and dramatic.'
      //   script.script.imageToVideoPrompt
      obj.imageUrl = 'https://ik.imagekit.io/ttykjawpx/genAiVideo/ChatGPT%20Image%20May%2016,%202025,%2011_33_04%20AM.png?updatedAt=1747375407152'
      const data = await this.generateVideoFromImage(obj)

      return data
    } catch (err) {
      console.error('Error in creating a video :: ', err)
      throw new Error(err)
    }
  }

  async generateVideoFromImage (options) {
    try {
      const input = {
        prompt: options.prompt,
        duration: 5,
        cfg_scale: 0.5,
        start_image: options.imageUrl,
        aspect_ratio: '16:9',
        negative_prompt: ''
      }
      console.time('myTimer')
      const output = await replicate.run('kwaivgi/kling-v1.6-pro', { input })
      console.timeEnd('myTimer')
      console.log('🚀 ~ UserDesignService ~ generateVideoFromImage ~ output:', output)
      const video = await helper.uploadImageAndSaveToImageKit(output.url().href, options.name)
      console.log('🚀 ~ UserDesignService ~ generateVideoFromImage ~ video:', video)

      return output.url().href
    } catch (error) {
      console.error('Error generating video:', error.response?.data || error.message)
      throw error
    }
  }

  async getVideo (scriptId) {
    try {
      const data = await scriptSchema.find({
        scriptId: scriptId
      })
      return data
    } catch (err) {
      console.error('Error in getting a video :: ', err)
      throw new Error(err)
    }
  }
}

module.exports = new UserDesignService()

const OpenAI = require('openai')
const Character = require('../../mongooseSchema/characterSchema')
const helper = require('../../helper/helper')
const { default: mongoose } = require('mongoose')
const Script = require('../../mongooseSchema/scriptSchema')
require('dotenv').config()
const { toFile } = require('openai')
const axios = require('axios')
const { Readable } = require('stream')
const client = new OpenAI()
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const scriptSchema = require('../../mongooseSchema/scriptSchema')
const Replicate = require('replicate')
const mime = require('mime-types')
const GENERATED_DIR = path.resolve(__dirname, '../../generated')
const TEMP_DIR = path.resolve(__dirname, '../../temp')
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
})

class CharacterImages {
  constructor () {
    this.openai = new OpenAI({
      openAiApiKey: process.env.OPENAI_API_KEY
    })
  }

  async mainGenerateStory (topic, userId) {
    try {
      console.log('[mainGenerateStory] Starting main flow for topic:', topic)

      // 1. Detect characters and save to DB (images null)
      const systemMessage = {
        role: 'system',
        content: 'You are a character detection and prompt generation AI.'
      }

      const userMessage = {
        role: 'user',
        content: `
Given the story topic below, do two things:

1. Detect the main characters and provide their name and description.
2. For each character, generate a detailed, single-sentence visual prompt.

**IMPORTANT:**
- The character's name must be a single word only (e.g., "Sammy").
- Do NOT include any articles, titles, or descriptive phrases in the name.
- If the story includes important unnamed characters (like a father, guardian, teacher, etc.), assign a suitable single-word name yourself.
- Put all extra details in the description field.
- Each prompt MUST begin exactly with: "A full body 3D Pixar-animated style of <character name>" — replacing <character name> with the actual name.
- Make sure all prompts are safe, socially acceptable, non-violent, non-sexual, non-sensitive, and will not trigger content moderation systems.
Output a JSON array of objects, each object containing:
- "name": character's single-word name
- "description": short character description (can have multiple words)
- "prompt": a single-sentence prompt that starts with "A full body 3D Pixar-animated style of <character name>" and vividly describes the character in playful, animated detail.

Story topic:
"${topic}"
      `.trim()
      }

      const characterResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        messages: [systemMessage, userMessage]
      })

      const rawCharacters = characterResponse.choices[0].message.content.trim()
      const cleanedCharacters = rawCharacters.replace(/```json|```/g, '').trim()
      let characters = JSON.parse(cleanedCharacters)

      // Filter valid characters
      characters = characters.filter(c =>
        c.name && typeof c.name === 'string' && !c.name.includes(' ') &&
      c.description && typeof c.description === 'string' &&
      c.prompt && typeof c.prompt === 'string'
      )

      // Save characters to DB with imageUrl: null
      const savedCharacters = await Character.insertMany(
        characters.map(c => ({
          userId,
          name: c.name,
          topic,
          description: c.description,
          promptHistory: [c.prompt],
          imageUrl: null
        }))
      )

      // Prepare for script generation: map saved characters with DB ids
      const characterDataForScript = savedCharacters.map(c => ({
        id: c._id,
        name: c.name,
        description: c.description,
        prompt: c.promptHistory[0],
        imageUrl: null
      }))

      // 2. Generate script with characters (imageUrl and videoUrl empty)
      const scriptSystemMsg = {
        role: 'system',
        content: 'You are a scriptwriting AI that creates detailed, animated story scripts for short videos.'
      }

      const characterListText = characterDataForScript.map(c => `${c.name} (${c.description})`).join(', ')

      const scriptUserMsg = {
        role: 'user',
        content: `
Create a story script based on the following topic and characters.

**Topic:** ${topic}

**Characters:**
${characterListText}

**Instructions:**
- Generate a multi-scene story with a clear beginning, middle, and end.
- Each scene must include:
  - "narration": The narrator’s line for the scene.
- "textToImagePrompt": A vivid visual description starting with "A full body 3D Pixar-animated style of..." followed by the main characters in that scene and their surroundings. The image must be in landscape format (16:9 aspect ratio), with a clear background setting and dynamic character poses.
  - "imageToVideoPrompt": A short, descriptive prompt to animate the scene.
  - "imageUrl": ""  (empty string)
  - "videoUrl": ""  (empty string)

- Make sure all prompts are safe, socially acceptable, non-violent, non-sexual, non-sensitive, and will not trigger content ]moderation systems.

- Scenes must include at least one character, so the prompt always references one or more characters.
  - Scenes should include a mix of:
    - Solo scenes: featuring one character.
    - Pair scenes: featuring two characters interacting.
    - Group scenes: featuring three or more characters.
  - Maintain consistent character appearances and attributes across all scenes.
  - Each scene’s narration and prompts should be concise but rich in visual storytelling.
  - Use creative, coherent transitions between scenes to ensure narrative flow.
  - Respond with a JSON array of exactly 15 scenes.
      `.trim()
      }

      const scriptResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        messages: [scriptSystemMsg, scriptUserMsg]
      })

      const rawScript = scriptResponse.choices[0].message.content.trim()
      const cleanedScript = rawScript.replace(/```json|```/g, '').trim()
      const scenes = JSON.parse(cleanedScript)

      console.log({ userId, topic, characterIds: savedCharacters.map(c => c._id) })

      // ✅ Normalize scenes before saving
      const updatedScenes = scenes.map(scene => ({
        narration: scene.narration,
        textToImagePrompt: scene.textToImagePrompt,
        imageToVideoPrompt: scene.imageToVideoPrompt || scene.textToImagePrompt,
        imageUrl: '', // placeholder
        videoUrl: '' // placeholder
      }))

      // ✅ Save to MongoDB with normalized scenes
      const newScript = await Script.create({
        userId,
        characterId: savedCharacters.map(c => c._id),
        topic,
        script: updatedScenes
      })

      // 3. Start background character image generation (async)
      this.generateCharacterImages(savedCharacters.map(c => c._id))
        .then(() => {
          console.log('[mainGenerateStory] Character images generated')
          // 4. After characters done, generate scene images
          return this.generateSceneImages(newScript._id)
            .then(async () => {
              console.log('[mainGenerateStory] Scene image generation done')

              // 🎥 Now generate videos for each scene asynchronously
              const freshScript = await Script.findById(newScript._id)
              if (!freshScript) throw new Error('Script not found for video generation')

              const videoPromises = freshScript.script.map((scene, index) => {
                if (scene.imageUrl && scene.imageToVideoPrompt) {
                  return this.createVideo(freshScript._id, index)
                    .then(res => console.log(`🎬 [Scene ${index}] Video generation started`, res))
                    .catch(err => console.error(`🔥 [Scene ${index}] Video generation failed`, err.message))
                } else {
                  console.warn(`⚠️ [Scene ${index}] Missing imageUrl or imageToVideoPrompt, skipping`)
                  return Promise.resolve()
                }
              })

              await Promise.allSettled(videoPromises)
              console.log('[mainGenerateStory] All videos triggered')

              return {
                characters: characterDataForScript,
                script: {
                  id: freshScript._id,
                  topic: freshScript.topic,
                  scenes: freshScript.script
                }
              }
            })
        })

      // 5. Return characters and script immediately (images null for now)
      return {
        characters: characterDataForScript,
        script: {
          id: newScript._id,
          topic: newScript.topic,
          scenes: newScript.script
        }
      }
    } catch (err) {
      console.error('[mainGenerateStory] Error:', err)
      throw err
    }
  }

  async generateCharacterImages (characterIds) {
    const MAX_RETRIES = 2

    try {
      console.log('[generateCharacterImages] Starting batch image generation for:', characterIds)

      const characters = await Character.find({ _id: { $in: characterIds } })

      await Promise.allSettled(
        characters.map(async (char) => {
          const prompt = char.promptHistory[0]
          if (!prompt) {
            console.warn(`[generateCharacterImages] No prompt for character ${char._id}, skipping`)
            return
          }

          let imageBase64 = null
          let attempt = 0

          while (attempt <= MAX_RETRIES && !imageBase64) {
            try {
              console.log(`[generateCharacterImages] (${attempt + 1}/${MAX_RETRIES + 1}) Generating image for ${char.name}`)

              const result = await this.openai.images.generate({
                model: 'gpt-image-1',
                prompt
              })

              imageBase64 = result.data[0]?.b64_json

              if (!imageBase64) {
                console.warn(`[generateCharacterImages] No image data returned for ${char.name} on attempt ${attempt + 1}`)
              }
            } catch (err) {
              console.error(`[generateCharacterImages] Error on attempt ${attempt + 1} for ${char.name}:`, err.message)
            }

            attempt++
          }

          if (!imageBase64) {
            console.error(`[generateCharacterImages] Failed to generate image for ${char.name} after ${MAX_RETRIES + 1} attempts`)
            return
          }

          try {
            const filename = `${char._id}.png`
            const imageUrl = await helper.saveBase64ImageToGcp(imageBase64, filename)

            if (!imageUrl) {
              console.error(`[generateCharacterImages] Failed to upload image for ${char.name}`)
              return
            }

            char.imageUrl = imageUrl
            await char.save()

            console.log(`[generateCharacterImages] Image saved for ${char.name}: ${imageUrl}`)
          } catch (uploadErr) {
            console.error(`[generateCharacterImages] Upload error for ${char.name}:`, uploadErr.message)
          }
        })
      )

      console.log('[generateCharacterImages] All character image generation tasks complete.')
    } catch (err) {
      console.error('[generateCharacterImages] Fatal error in batch processing:', err.message)
    }
  }

  async fetchRemoteImageAsFile (url, filename) {
    const response = await axios.get(url, { responseType: 'arraybuffer' })
    const buffer = Buffer.from(response.data, 'binary')
    const stream = Readable.from(buffer)
    return await toFile(stream, filename, { type: 'image/png' })
  }

  async downloadImage (imageUrl, outputFolder = './images') {
    try {
    // Ensure output folder exists
      if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true })
      }

      // Extract image filename from URL
      const fileName = path.basename(new URL(imageUrl).pathname)
      const filePath = path.join(outputFolder, fileName)

      // Download image as arraybuffer
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' })

      // Write image buffer to file
      fs.writeFileSync(filePath, response.data)

      console.log(`Image downloaded: ${filePath}`)
      return filePath // Return local path to downloaded image
    } catch (error) {
      console.error('Error downloading image:', error.message)
      throw error
    }
  }

  async generateSceneImages (scriptId, sceneIdx = null) {
    try {
      console.log(`🔍 Generating scene images for script ID: ${scriptId}`)
      const scriptDoc = await Script.findById(scriptId)
      if (!scriptDoc || !Array.isArray(scriptDoc.script)) {
        throw new Error('❌ Invalid script for image generation')
      }

      // Fetch all characters related to the script with their imageUrls
      const characterIds = scriptDoc.characterId.map(c => c._id || c)
      const characters = await Character.find({ _id: { $in: characterIds } })
      if (characters.length === 0) {
        console.warn('⚠️ No characters found for image references')
      }

      const charFileMap = new Map()
      for (const char of characters) {
        const charName = (char.name || char.characterName || 'unnamed').toLowerCase()
        const imageUrl = Array.isArray(char.imageUrl) ? char.imageUrl[0] : char.imageUrl
        if (!imageUrl) continue

        try {
          const filename = `${charName.replace(/\s+/g, '_')}_${uuidv4()}.png`
          const localPath = await this.downloadImage(imageUrl, filename) // your existing downloader
          const openAIFile = await toFile(fs.createReadStream(localPath), null, { type: 'image/png' })
          charFileMap.set(charName, openAIFile)
        } catch (err) {
          console.warn(`⚠️ Failed to prepare reference image for character "${charName}":`, err.message)
        }
      }

      if (charFileMap.size === 0) {
        console.info('ℹ️ No character reference images available, will generate from text only.')
      }

      const scenes = scriptDoc.script
      const sceneIndices = sceneIdx !== null ? [sceneIdx] : [...Array(scenes.length).keys()]
      const BATCH_SIZE = scriptDoc.numberOfScenes || scenes.length

      for (let i = 0; i < sceneIndices.length; i += BATCH_SIZE) {
        const batchIndices = sceneIndices.slice(i, i + BATCH_SIZE)
        console.log(`🧩 Processing batch ${i / BATCH_SIZE + 1} scenes: ${batchIndices.join(', ')}`)

        const generated = await Promise.all(
          batchIndices.map(async (idx) => {
            const scene = scenes[idx]
            try {
              const sceneText = (scene.textToImagePrompt || '').toLowerCase()
              // Find all matching character files referenced in prompt
              const matchedCharFiles = []
              for (const [charName, file] of charFileMap.entries()) {
                const regex = new RegExp(`\\b${charName}\\b`, 'i')
                if (regex.test(sceneText)) matchedCharFiles.push(file)
              }

              let rsp
              if (matchedCharFiles.length > 0) {
                rsp = await client.images.edit({
                  model: 'gpt-image-1',
                  image: matchedCharFiles[0],
                  prompt: `${scene.textToImagePrompt}, landscape format, 16:9 aspect ratio`
                })
              } else {
                rsp = await client.images.generate({
                  model: 'gpt-image-1',
                  prompt: `${scene.textToImagePrompt}, landscape format, 16:9 aspect ratio`
                })
              }

              const base64Image = rsp.data[0].b64_json
              const savedImageUrl = await helper.saveBase64ImageToGcp(base64Image, `scene_${scriptId}_${idx + 1}.png`)
              // Save image url to file system too if needed
              const localFileName = `${scriptId}_scene${idx + 1}.png`
              const imageBuffer = Buffer.from(base64Image, 'base64')

              if (!fs.existsSync(GENERATED_DIR)) {
                fs.mkdirSync(GENERATED_DIR, { recursive: true })
              }

              fs.writeFileSync(path.join(GENERATED_DIR, localFileName), imageBuffer)
              console.log(`📁 Scene ${idx + 1} image saved at ${savedImageUrl}`)
              return { sceneIdx: idx, imageUrl: savedImageUrl }
            } catch (err) {
              console.error(`❌ Error generating image for scene ${idx + 1}:`, err.message)
              return null
            }
          })
        )

        for (const result of generated) {
          if (result && result.imageUrl) {
            scriptDoc.script[result.sceneIdx].imageUrl = result.imageUrl
          }
        }

        scriptDoc.markModified('script')
        await scriptDoc.save()
        console.log(`💾 Script updated with images after batch ${i / BATCH_SIZE + 1}`)
      }

      // Cleanup temporary files if any
      for (const file of fs.readdirSync(TEMP_DIR)) {
        fs.unlinkSync(path.join(TEMP_DIR, file))
      }

      console.log(`✅ Completed scene image generation for script ID: ${scriptId}`)
    } catch (error) {
      console.error('❌ generateSceneImages error:', error.message)
    }
  }

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

          // 🔄 Atomic update
          const updateResult = await scriptSchema.updateOne(
            { _id: scriptId },
            { $set: { [`script.${sceneIndex}.videoUrl`]: videoUrl } }
          )

          if (updateResult.modifiedCount === 0) {
            console.warn(`⚠️ [Background] Scene ${sceneIndex} not updated. It might have been deleted or modified.`)
          } else {
            console.log('💾 [Background] Script updated with videoUrl.')
          }
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
    const MAX_RETRIES = 2
    let attempt = 0
    let finalUrl = null

    while (attempt <= MAX_RETRIES && !finalUrl) {
      try {
        console.log(`🚧 Attempt ${attempt + 1}/${MAX_RETRIES + 1} - generateVideoFromImage with:`, options)

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

        const res = await axios.get(replicateVideoUrl, { responseType: 'arraybuffer' })
        const fileBuffer = res.data
        const mimeType = mime.lookup(replicateVideoUrl) || 'video/mp4'

        finalUrl = await helper.uploadImageToGCP(fileBuffer, options.name, mimeType)

        console.log('✅ Final ImageKit video URL:', finalUrl)
      } catch (error) {
        console.error(`🔥 Error in generateVideoFromImage (attempt ${attempt + 1}):`, error.response?.data || error.message)
      }

      attempt++
    }

    if (!finalUrl) {
      throw new Error(`Failed to generate video after ${MAX_RETRIES + 1} attempts`)
    }

    return finalUrl
  }

  async getAllCharacters (characterName, category, pageNumber, pageLimit, user) {
    try {
      // Calculate the number of documents to skip
      const limit = pageLimit || 6
      const page = pageNumber || 1
      const skip = (page - 1) * limit

      // Create the query object with user ID and status (if applicable)
      const query = {
        userId: mongoose.Types.ObjectId(user.id)
      }

      // Add search functionality if a character name is provided
      if (characterName) {
        query.name = { $regex: characterName, $options: 'i' }
      }
      // Fetch the characters with pagination
      const characters = await Character.find(query)
        .sort({ updatedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)

      // Get the current page count of Characters
      const currentPageCharacterCount = characters.length

      // Optional: Get the total count of characters for pagination info
      const totalCharacters = await Character.countDocuments(query)

      return {
        characters,
        totalCharacters,
        currentPage: page,
        totalPages: Math.ceil(totalCharacters / limit),
        currentPageCharacterCount
      }
    } catch (err) {
      console.log('Error in getAllCharacters function :: ', err)
      throw new Error(err)
    }
  }

  async getCharacterById (id, user) {
    const characterHistory = []

    try {
      const ifCharacter = await Character.findOne({ userId: user.id, _id: id })
      console.log('Fetching character with id:', id) // Log the id
      if (ifCharacter) {
        const character = await Character.findById(id)

        if (!character) {
          console.error('Character not found with id:', id) // Log when character is not found
          throw new Error('User does not have access to this character')
        }

        if (character.imageUrl_history && character.prompt_history) {
          for (let i = 0; i < character.imageUrl_history.length; i++) {
            characterHistory.push({
              image: character.imageUrl_history[i],
              prompt: character.prompt_history[i]
            })
          }
        }
        return { character, characterHistory }
      } else {
        console.error('User does not have access to this character') // Log when user does not have access to the character
        throw new Error('User does not have access to this character')
      }
    } catch (err) {
      console.error('Error in getCharacterById function ::', err) // More detailed error logging
      throw new Error(err)
    }
  }

  async editCharacter (id, body, user) {
    try {
      const { newPrompt, userSelectedUrl } = body
      console.log('Fetching character with id:', id)

      const character = await Character.findOne({ userId: user.id, _id: id })

      if (!character) {
        console.error('User does not have access to this character')
        throw new Error('User does not have access to this character')
      }

      // Build prompt
      let prompt = newPrompt
      if (userSelectedUrl != null) {
        prompt += ` --cref ${userSelectedUrl}`
      }
      prompt += ' --ar 16:9'

      // Push to history
      if (!character.promptHistory) character.promptHistory = []
      character.promptHistory.push(prompt)
      await character.save()

      // Generate image with gpt-image-1
      const response = await this.openai.images.generate({
        model: 'gpt-image-1',
        prompt: character.promptHistory[0] // using the first prompt from history
      })

      const imageData = response.data[0].b64_json
      const imageUrl = await helper.saveBase64ImageToGcp(imageData, 'character.png')

      character.imageUrl = imageUrl
      await character.save()

      return imageUrl
    } catch (err) {
      if (err.code === 'moderation_blocked') {
        console.error('Prompt blocked by moderation:', err.message)
        throw new Error('Prompt rejected due to moderation')
      }

      console.error('Error in editCharacter function ::', err)
      throw new Error(err.message || 'Unexpected error occurred')
    }
  }
}

module.exports = new CharacterImages()

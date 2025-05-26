const OpenAI = require('openai')
const Script = require('../../mongooseSchema/scriptSchema.js')
const Character = require('../../mongooseSchema/characterSchema.js')
const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch')
const { v4: uuidv4 } = require('uuid')
require('dotenv').config()
const helper = require('../../helper/helper')
const { toFile } = OpenAI

const GENERATED_DIR = path.join(__dirname, '../../public/generated')
const TEMP_DIR = path.join(__dirname, '../../temp')

if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true })
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})
class ScriptService {
  // constructor () {
  //   this.openai = new OpenAI({
  //     openAiApiKey: process.env.OPENAI_API_KEY
  //   })
  // }

  async createScript (info, user) {
    try {
      const { title, topic, numberOfScenes, characterId } = info

      if (!title || !topic || !characterId) {
        throw new Error('Script validation failed: title, topic, and characterId are required.')
      }

      const totalScenes = parseInt(numberOfScenes)
      if (isNaN(totalScenes) || totalScenes <= 0) {
        throw new Error('Invalid numberOfScenes value')
      }

      const characterIds = Array.isArray(characterId) ? characterId : [characterId]
      const characters = await Character.find({ _id: { $in: characterIds } })

      if (!characters || characters.length === 0) {
        throw new Error('Character(s) not found')
      }

      const characterNameList = characters.map(c => c.characterName)

      const inputPrompt = `
      Create a ${totalScenes}-scene video script based on the following details:
      - **Title**: "${title}"
      - **Topic**: "${topic}"
      - **Main Character(s)**: ${characterNameList.join(', ')}
      
      Distribute the characters across scenes thoughtfully following these guidelines:
      
      - For the ${characterNameList.length} characters and ${totalScenes} scenes:
        - Each character should have approximately ${Math.max(1, Math.floor(totalScenes / (characterNameList.length * 4)))} to ${Math.max(1, Math.floor(totalScenes / (characterNameList.length * 2)))} solo scenes, where only that character appears alone.
        - The remaining scenes should include meaningful combinations of characters, such as pairs, triplets, or full groups, depending on the total number of characters.
        - Aim for variety and natural storytelling flow — not all scenes need all characters, but the story must maintain continuity and emotional engagement.
        - Ensure the distribution balances screen time and develops each character individually as well as in groups.
      
      The video should be short — around 1 to 2 minutes in runtime.
      
      Each scene should contain:
      1. **Narration** (1–2 lines): A smooth and natural continuation from the previous scene, capturing the emotional tone and core action. The narration across scenes must read like one continuous story — not disjointed or standalone moments.
      2. **Text-to-Image Prompt**: A richly detailed visual description for generating a static image. Include:
         - Character(s) (describe their consistent outfit, pose, and expression)
         - Environment and setting (scene background, weather, lighting)
         - Props or key objects
         - Camera angle and composition
         - Mood and atmosphere
         - **Style**: Use the phrase “in 3D Pixar animated style”
         - Visual continuity with the previous scene (e.g., if characters wore red vests and blue vests, keep that consistent unless a wardrobe change is part of the story)
      
      3. **Image-to-Video Prompt**: Describe how the static image should animate, using camera motion (e.g., zoom, pan), character movement, transitions (e.g., fade, cut), or environmental animation.
      
      Guidelines:
      - The story must have a **strong beginning and end**, and each scene must connect logically with the previous one.
      - Maintain **consistency in character appearance** (e.g., clothing, style) across all scenes.
      - You can use **solo scenes** — not all scenes must include all characters. Choose naturally where only one character is needed.
      - Ensure the visual prompts are **in sync with each other across scenes** (e.g., background, outfit, tone should evolve naturally, not reset).
      - Make the story **friendly, imaginative**, and appropriate for a general audience.
      - Use **engaging narration, simple language**, and clear visual storytelling.
      
      Return the result in this **strict JSON format**:
      
      [
        {
          "narration": "Scene 1 narration...",
          "textToImagePrompt": "Visual description prompt in 3D Pixar animated style...",
          "imageToVideoPrompt": "Animation or motion instruction..."
        },
        ...
      ]
      `

      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant for creating a short video script from the given title and topic.'
          },
          { role: 'user', content: inputPrompt }
        ],
        temperature: 0
      })

      let rawOutput = completion.choices[0].message.content.trim()

      if (rawOutput.startsWith('```')) {
        rawOutput = rawOutput.replace(/^```(?:json)?/, '').replace(/```$/, '').trim()
      }

      let parsedScript
      try {
        parsedScript = JSON.parse(rawOutput)
      } catch (err) {
        console.error('OpenAI response is not valid JSON:', rawOutput)
        throw new Error('Failed to parse script response from AI')
      }

      const newScript = new Script({
        characterId: characterIds,
        title,
        topic,
        numberOfScenes: totalScenes,
        token_count: completion.usage?.total_tokens,
        script: parsedScript.map(scene => ({
          ...scene,
          imageUrl: '',
          videoUrl: ''
        }))
      })
      await newScript.save()

      console.log('Script created successfully.')
      return newScript
    } catch (error) {
      console.error('Error creating script:', error.message)
      throw error
    }
  }

  async downloadImage (url, filename) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to download image: ${url}`)
    const buffer = await res.buffer()
    const filepath = path.join(TEMP_DIR, filename)
    fs.writeFileSync(filepath, buffer)
    return filepath
  }

  async generateImagesForScript (scriptId, sceneIdx = null) {
    try {
      console.log(`🔍 Looking for script with ID: ${scriptId}`)
      const scriptDoc = await Script.findById(scriptId)
      if (!scriptDoc || !Array.isArray(scriptDoc.script)) {
        throw new Error('❌ Invalid script for image generation')
      }

      const characterIds = scriptDoc.characterId.map(c => c._id || c)
      console.log(`👥 Character IDs found: ${characterIds.join(', ')}`)

      const characters = await Character.find({ _id: { $in: characterIds } })
      console.log(`📦 Found ${characters.length} character(s) from DB.`)

      const charFileMap = new Map()
      for (const char of characters) {
        const imageUrl = Array.isArray(char.imageUrl) ? char.imageUrl[0] : char.imageUrl
        const charName = (char.characterName || char.name || 'Unnamed').toLowerCase()

        if (!imageUrl) {
          console.warn(`⚠️ Character "${charName}" has no imageUrl.`)
          continue
        }

        try {
          const filename = `${charName.replace(/\s+/g, '_')}_${uuidv4()}.png`
          console.log(`⬇️ Downloading image for character "${charName}" from ${imageUrl}`)
          const localPath = await this.downloadImage(imageUrl, filename)
          const openAIFile = await toFile(fs.createReadStream(localPath), null, { type: 'image/png' })
          charFileMap.set(charName, openAIFile)
          console.log(`📄 OpenAI file prepared for "${charName}"`)
        } catch (err) {
          console.warn(`❌ Failed to process image for "${charName}":`, err.message)
        }
      }

      if (charFileMap.size === 0) {
        throw new Error('❌ No character images available after download')
      }

      console.log('🚀 Starting image generation for script scenes...')

      const scenes = scriptDoc.script
      const sceneIndices = sceneIdx !== null ? [sceneIdx] : [...Array(scenes.length).keys()]
      const BATCH_SIZE = scriptDoc.numberOfScenes

      for (let i = 0; i < sceneIndices.length; i += BATCH_SIZE) {
        const batchIndices = sceneIndices.slice(i, i + BATCH_SIZE)
        console.log(`🧩 Processing batch ${i / BATCH_SIZE + 1}: Scene indices ${batchIndices.join(', ')}`)

        const generated = await Promise.all(
          batchIndices.map(async (sceneIdxInBatch) => {
            const scene = scenes[sceneIdxInBatch]
            try {
              const sceneText = scene.textToImagePrompt.toLowerCase()
              const matchedCharFiles = []

              for (const [charName, file] of charFileMap.entries()) {
                const regex = new RegExp(`\\b${charName}\\b`, 'i')
                if (regex.test(sceneText)) {
                  matchedCharFiles.push(file)
                }
              }

              if (matchedCharFiles.length === 0) {
                console.info(`ℹ️ Scene ${sceneIdxInBatch + 1} has no character references — generating image without character input.`)
              }

              console.log(`🎨 Scene ${sceneIdxInBatch + 1} using ${matchedCharFiles.length} character image(s)`)

              let rsp
              if (matchedCharFiles.length > 0) {
                // Use image editing when character image references exist
                rsp = await client.images.edit({
                  model: 'gpt-image-1',
                  image: matchedCharFiles,
                  prompt: scene.textToImagePrompt
                })
              } else {
                // Use pure generation when no images are provided
                rsp = await client.images.generate({
                  model: 'gpt-image-1',
                  prompt: scene.textToImagePrompt,
                  n: 1,
                  size: '1792x1024' // or your preferred size
                })
              }

              const imageBase64 = rsp.data[0].b64_json
              const imageUrl = await helper.saveBase64ImageToGcp(imageBase64, 'scene.png')
              const fileName = `${scriptId}_scene${sceneIdxInBatch + 1}.png`
              const filePath = path.join(GENERATED_DIR, fileName)
              fs.writeFileSync(filePath, imageUrl)

              console.log(`📁 Scene ${sceneIdxInBatch + 1} image saved: ${imageUrl}`)
              return { sceneIdx: sceneIdxInBatch, imageUrl }
            } catch (err) {
              console.error(`❌ Scene ${sceneIdxInBatch + 1} image edit failed:`, err.message)
              return null
            }
          })
        )

        for (const result of generated) {
          if (result && result.imageUrl) {
            scriptDoc.script[result.sceneIdx].imageUrl = result.imageUrl
            console.log(`📝 Updated scene ${result.sceneIdx + 1} with image URL: ${result.imageUrl}`)
          }
        }

        scriptDoc.markModified('script')
        await scriptDoc.save()
        console.log(`💾 Saved updated script after batch ${i / BATCH_SIZE + 1}`)
      }

      console.log(`🧹 Cleaning up temp images from ${TEMP_DIR}`)
      for (const file of fs.readdirSync(TEMP_DIR)) {
        fs.unlinkSync(path.join(TEMP_DIR, file))
      }

      console.log(`✅✅ Image generation complete for script: ${scriptId}${sceneIdx !== null ? ` (Scene ${sceneIdx + 1})` : ''}`)
    } catch (error) {
      console.error('❌ generateImagesForScript error:', error.message)
    }
  }

  async getAllScripts ({ userId, page = 1, limit = 10 }) {
    try {
      const query = {}

      // Optional: Filter scripts created by a specific user
      if (userId) {
        query.userId = userId
      }

      const skip = (page - 1) * limit

      const scripts = await Script.find(query)
        .populate('characterId', 'characterName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)

      const total = await Script.countDocuments(query)

      return {
        scripts,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit)
        }
      }
    } catch (error) {
      console.error('Error fetching scripts:', error.message)
      throw new Error('Failed to fetch scripts')
    }
  }

  async getScriptById (scriptId, user) {
    try {
      if (!scriptId || typeof scriptId !== 'string') {
        throw new Error('Invalid scriptId')
      }

      const script = await Script.findById(scriptId).populate('characterId', 'characterName')

      if (!script) {
        throw new Error('Script not found')
      }

      if (!script.userId || script.userId.toString() !== user.id.toString()) {
        throw new Error('Unauthorized: You do not own this script')
      }

      return script
    } catch (error) {
      console.error('Error fetching script by ID:', error.message)
      throw new Error('Failed to fetch script')
    }
  }

  async editScriptSceneByIndex (scriptId, sceneIndex, updates) {
    try {
      if (!scriptId) throw new Error('scriptId is required')
      if (sceneIndex === undefined || sceneIndex < 0) throw new Error('Valid sceneIndex is required')
      if (!updates || typeof updates !== 'object') throw new Error('Update object is required')

      const scriptDoc = await Script.findById(scriptId)
      if (!scriptDoc) throw new Error('Script not found')
      // if (!scriptDoc.userId || scriptDoc.userId.toString() !== user._id.toString()) {
      //   throw new Error('Unauthorized: You do not own this script')
      // }
      if (!scriptDoc.script || sceneIndex >= scriptDoc.script.length) {
        throw new Error('Scene index is out of bounds')
      }

      const setObject = {}
      if (updates.narration !== undefined) {
        setObject[`script.${sceneIndex}.narration`] = updates.narration
      }
      if (updates.textToImagePrompt !== undefined) {
        setObject[`script.${sceneIndex}.textToImagePrompt`] = updates.textToImagePrompt
      }
      if (updates.imageToVideoPrompt !== undefined) {
        setObject[`script.${sceneIndex}.imageToVideoPrompt`] = updates.imageToVideoPrompt
      }

      const updatedScript = await Script.findOneAndUpdate(
        { _id: scriptId },
        { $set: setObject },
        { new: true }
      )

      return updatedScript
    } catch (err) {
      console.error('editScriptSceneByIndex Error:', err.message)
      throw err
    }
  }

  async insertMultipleScenes (scriptId, scenesToInsert, user) {
    try {
      if (!scriptId) throw new Error('scriptId is required')
      if (!Array.isArray(scenesToInsert) || scenesToInsert.length === 0) {
        throw new Error('scenesToInsert must be a non-empty array')
      }

      const scriptDoc = await Script.findById(scriptId)
      if (!scriptDoc) throw new Error('Script not found')

      // Ownership check: only allow if script.userId matches logged-in user
      if (!scriptDoc.userId || scriptDoc.userId.toString() !== user._id.toString()) {
        throw new Error('Unauthorized: You do not own this script')
      }

      if (!Array.isArray(scriptDoc.script)) {
        throw new Error('Script scenes not initialized properly')
      }

      const sortedInsertions = scenesToInsert.sort((a, b) => a.index - b.index)

      let offset = 0
      for (const { index, scene } of sortedInsertions) {
        if (index === undefined || typeof scene !== 'object') {
          throw new Error('Each item must have a valid index and scene object')
        }
        const adjustedIndex = index + offset
        scriptDoc.script.splice(adjustedIndex, 0, scene)
        offset += 1
      }

      scriptDoc.numberOfScenes = scriptDoc.script.length
      await scriptDoc.save()
      return scriptDoc
    } catch (err) {
      console.error('insertMultipleScenes Error:', err.message)
      throw err
    }
  }
}

module.exports = new ScriptService()

const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch')
const { v4: uuidv4 } = require('uuid')
require('dotenv').config()

const OpenAI = require('openai')
const { toFile } = OpenAI

const Script = require('../../mongooseSchema/scriptSchema.js')
const Character = require('../../mongooseSchema/characterSchema.js')

const GENERATED_DIR = path.join(__dirname, '../../public/generated')
const TEMP_DIR = path.join(__dirname, '../../temp')

if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true })
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

class ScriptService {
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
        script: parsedScript
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

  async generateImagesForScript (scriptId) {
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
      const BATCH_SIZE = scriptDoc.numberOfScenes

      for (let i = 0; i < scenes.length; i += BATCH_SIZE) {
        const batch = scenes.slice(i, i + BATCH_SIZE)
        console.log(`🧩 Processing batch ${i / BATCH_SIZE + 1}: Scenes ${i + 1} to ${i + batch.length}`)

        const generated = await Promise.all(
          batch.map(async (scene, idx) => {
            const sceneIndex = i + idx + 1
            try {
              const sceneText = scene.textToImagePrompt.toLowerCase()
              const matchedCharFiles = []

              for (const [charName, file] of charFileMap.entries()) {
                const regex = new RegExp(`\\b${charName}\\b`, 'i') // full word match
                if (regex.test(sceneText)) {
                  matchedCharFiles.push(file)
                }
              }

              // fallback to default (first character) if none found
              if (matchedCharFiles.length === 0) {
                console.warn(`⚠️ Scene ${sceneIndex} has no character match — using first character.`)
                matchedCharFiles.push([...charFileMap.values()][0])
              }

              console.log(`🎨 Scene ${sceneIndex} using ${matchedCharFiles.length} character image(s)`)

              const rsp = await client.images.edit({
                model: 'gpt-image-1',
                image: matchedCharFiles,
                prompt: scene.textToImagePrompt
              })

              const imageBase64 = rsp.data[0].b64_json
              const imageBuffer = Buffer.from(imageBase64, 'base64')
              const fileName = `${scriptId}_scene${sceneIndex}.png`
              const filePath = path.join(GENERATED_DIR, fileName)
              fs.writeFileSync(filePath, imageBuffer)

              console.log(`📁 Scene ${sceneIndex} image saved: ${filePath}`)
              return `/generated/${fileName}`
            } catch (err) {
              console.error(`❌ Scene ${sceneIndex} image edit failed:`, err.message)
              return null
            }
          })
        )

        generated.forEach((imageUrl, j) => {
          if (imageUrl) {
            const sceneIdx = i + j
            scriptDoc.script[sceneIdx].imageUrl = imageUrl
            console.log(`📝 Updated scene ${sceneIdx + 1} with image URL: ${imageUrl}`)
          }
        })

        scriptDoc.markModified('script')
        await scriptDoc.save()
        console.log(`💾 Saved updated script after batch ${i / BATCH_SIZE + 1}`)
      }

      console.log(`🧹 Cleaning up temp images from ${TEMP_DIR}`)
      for (const file of fs.readdirSync(TEMP_DIR)) {
        fs.unlinkSync(path.join(TEMP_DIR, file))
      }

      console.log(`✅✅ Image generation complete for script: ${scriptId}`)
    } catch (error) {
      console.error('❌ generateImagesForScript error:', error.message)
    }
  }
}

module.exports = new ScriptService()

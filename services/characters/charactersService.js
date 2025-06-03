const OpenAI = require('openai')
const Character = require('../../mongooseSchema/characterSchema')
const helper = require('../../helper/helper')
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
const { execSync, spawnSync } = require('node:child_process')
const { access } = require('node:fs/promises')
const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim()
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
})
const apiKey = process.env.ELEVENLABS_API_KEY
const baseURL = 'https://api.elevenlabs.io/v1'
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
- If the story includes important unnamed characters (like a father, guardian, teacher, etc.), assign them a fictional single-word name.
- Use only safe, respectful, and family-friendly language in names and descriptions.
- Each character’s prompt MUST begin exactly with: “A full body 3D Pixar-animated style of <character name>”
- The visual prompt should describe the character in a fun, cinematic setting. Use playful and colorful language — describe the character’s appearance, outfit, mood, background environment, lighting, and camera framing.
- Ensure that the generated image is **landscape (16:9)** and visually engaging, without violence, sensitivity, or controversial themes.
- Avoid any references to race, skin tone, or real-world likeness. Focus on outfits, mood, colors, accessories, and personality.
- The size of the image should be **at least 621x621 pixels**.
- The image should not be squared or have a height/width ratio of 4:3.
Output a JSON array of character objects, each containing:
- "name": A single-word character name.
- "description": A short phrase describing the character’s role or traits.
- “prompt”: A single-sentence description that begins with “A full body 3D Pixar-animated style of ”, vividly portraying the character with playful, animated details. The image should be in landscape orientation with a 16:9 aspect ratio, capturing the character in a lively, cinematic scene.
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
      console.log('[mainGenerateStory] Raw character response:', rawCharacters)

      const cleanedCharacters = rawCharacters.replace(/```json|```/g, '').trim()
      let characters = JSON.parse(cleanedCharacters)

      characters = characters.filter(
        c =>
          c.name &&
        typeof c.name === 'string' &&
        !c.name.includes(' ') &&
        c.description &&
        typeof c.description === 'string' &&
        c.prompt &&
        typeof c.prompt === 'string'
      )

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

      const characterDataForScript = savedCharacters.map(c => ({
        id: c._id,
        name: c.name,
        description: c.description,
        prompt: c.promptHistory[0],
        imageUrl: null
      }))

      // 2. Generate script with characters
      const scriptSystemMsg = {
        role: 'system',
        content: 'You are a scriptwriting AI that creates detailed, animated story scripts for short videos.'
      }

      const characterListText = characterDataForScript
        .map(c => `${c.name} (${c.description})`)
        .join(', ')

      const scriptUserMsg = {
        role: 'user',
        content: `
Create a Pixar-style animated story script based on the topic and characters below.

**Topic:** ${topic}

**Characters:**
${characterListText}

Guidelines for the video script:

- The story should last 1 to 2 minutes in runtime, and have **exactly 15 scenes**.
- Each scene must feel like a natural continuation of the previous one, creating a cohesive narrative arc.
- The story should be heartwarming, playful, imaginative, and safe for all audiences.
- Do NOT use any violent, controversial, sensitive, or real-world topics.
- The environment and tone must stay true to a **3D Pixar-animated style** — colorful, whimsical, cinematic.

Each scene object should include:

1. **"narration"** – 1 sentence (5–7 seconds worth). It should describe the emotional moment or key action in the scene, connecting smoothly with the prior one.
2. **"textToImagePrompt"** – Starts with "3D Pixar animated style," followed by a rich, detailed, and imaginative description of the scene. It should mention the characters in action, environment, props, lighting, mood, and framing. Ensure landscape 16:9 framing. No sensitive or unsafe content.
3. **"imageToVideoPrompt"** – Starts with "3D Pixar animated video of", followed by a short animation instruction (e.g., “slow zoom while the character smiles and waves”). Keep camera and gesture movements smooth, light, and visually stable.
4. **"imageUrl"** – Leave empty.
5. **"videoUrl"** – Leave empty.

Strictly avoid:
- Photorealistic language.
- Excessive movement (no jumping, running, dancing).
- Mentioning brands, real places, or famous people.
- Depictions that may be interpreted as offensive or culturally sensitive.

Example output format:

[
  {
    "narration": "Each scene narration should be a single line of text and should not exceed 5–7 seconds in duration.",
    "textToImagePrompt": "Prompt to generate image.",
    "imageToVideoPrompt": "Prompt to generate video.",
    "imageUrl": "",
    "videoUrl": ""
  },
  ...
]
  `.trim()
      }

      const scriptResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        messages: [scriptSystemMsg, scriptUserMsg]
      })

      const extractFirstJsonArray = (text) => {
        try {
          const match = text.match(/\[\s*{[\s\S]*}\s*]/)
          if (!match) throw new Error('No JSON array found in response')
          return JSON.parse(match[0])
        } catch (err) {
          console.error('[mainGenerateStory] Failed to extract JSON array. Raw text:\n', text)
          throw err
        }
      }

      const rawScript = scriptResponse.choices[0].message.content.trim()
      console.log('[mainGenerateStory] Raw script output:', rawScript)

      const scenes = extractFirstJsonArray(rawScript)

      const updatedScenes = scenes.map(scene => ({
        narration: scene.narration,
        textToImagePrompt: scene.textToImagePrompt,
        imageToVideoPrompt: scene.imageToVideoPrompt || scene.textToImagePrompt,
        imageUrl: '',
        videoUrl: ''
      }))

      const newScript = await Script.create({
        userId,
        characterId: savedCharacters.map(c => c._id),
        topic,
        script: updatedScenes
      })
      // Trigger character image generation, then scene images, then videos
      this.generateCharacterImages(savedCharacters.map(c => c._id))
        .then(() => {
          console.log('[mainGenerateStory] Character images generated')
          return this.generateSceneImages(newScript._id)
        })
        .then(async () => {
          console.log('[mainGenerateStory] Scene images generated')

          const freshScript = await Script.findById(newScript._id)
          if (!freshScript) throw new Error('Script not found for video generation')

          const videoResults = await Promise.allSettled(
            freshScript.script.map((scene, index) => {
              if (scene.imageUrl && scene.imageToVideoPrompt) {
                return this.generateVideoFromImage({
                  imageUrl: scene.imageUrl,
                  prompt: scene.imageToVideoPrompt,
                  name: `scene${index}.mp4`
                })
                  .then(url => {
                    freshScript.script[index].videoUrl = url
                    return true
                  })
                  .catch(err => {
                    console.error(`🔥 [Scene ${index}] Video generation failed:`, err.message)
                    return false
                  })
              } else {
                console.warn(`⚠️ [Scene ${index}] Missing imageUrl or prompt, skipping`)
                return Promise.resolve(false)
              }
            })
          )

          await freshScript.save()

          const allSuccessful = videoResults.every(r => r.status === 'fulfilled' && r.value === true)

          if (allSuccessful) {
            console.log('in heree', freshScript.script.length)
            await this.trimAndMux({ totalClips: freshScript.script.length })
            console.log('[mainGenerateStory] trimAndMux completed successfully')

            // ✅ Narration processing after successful video generation
            await this.processNarrations(freshScript.script, topic, userId)
          } else {
            console.warn('[mainGenerateStory] Skipping trimAndMux due to video generation failures')
          }
        })
        .catch(err => {
          console.error('[mainGenerateStory] Background generation error:', err.message)
        })

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

  // Separate processNarrations function outside, bound to class context:
  async processNarrations (scenes, topic, userId) {
  // Step 1: Save narration file and get its path
    const narrationFilePath = await this.saveNarrationsToFile(scenes, topic, userId)

    // Step 2: Convert narration file to audio using the saved file path
    const audioFiles = await this.convertNarrationFileToAudioInBulk(narrationFilePath)

    return audioFiles
  }

  async convertNarrationFileToAudioInBulk (narrationFilePath) {
    if (!apiKey) throw new Error('API key is required')
    if (!baseURL) throw new Error('baseURL is required')

    // Prepare Audios folder
    const audiosFolder = path.join(process.cwd(), 'Audios')
    if (!fs.existsSync(audiosFolder)) {
      fs.mkdirSync(audiosFolder)
    }

    const axiosInstance = axios.create({
      baseURL,
      headers: {
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      timeout: 30000
    })

    try {
      const defaultModel = 'eleven_multilingual_v2'
      const defaultVoiceSettings = {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.0,
        use_speaker_boost: true
      }

      const fileContent = await fs.promises.readFile(narrationFilePath, 'utf-8')
      const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 0)

      if (lines.length === 0) throw new Error('Narration file is empty')

      const voiceIds = [
        'EXAVITQu4vr4xnSDxMaL', // Sarah
        'AZnzlk1XvdvUeBnXmlld', // Domi
        'aXbjk4JoIDXdCNz29TrS', // Sunny
        'onwK4e9ZLuTAKqWW03F9' // Daniel
      ]
      const selectedVoiceId = voiceIds[Math.floor(Math.random() * voiceIds.length)]

      const generatedAudioInfo = []

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const requestBody = {
          text: line,
          modelId: defaultModel,
          voiceSettings: { ...defaultVoiceSettings }
        }

        const response = await axiosInstance.post(
        `/text-to-speech/${selectedVoiceId}`,
        requestBody,
        { responseType: 'arraybuffer' }
        )

        if (response.status !== 200) {
          throw new Error(`TTS API failed with status ${response.status}`)
        }

        const filename = `audio${i + 1}.mp3`
        const outputPath = path.join(audiosFolder, filename)

        await fs.promises.writeFile(outputPath, Buffer.from(response.data))
        console.log(`🔊 Saved line ${i + 1} audio to: ${outputPath}`)

        generatedAudioInfo.push({ filename, path: outputPath })
      }

      return generatedAudioInfo
    } catch (err) {
      console.error('❌ Error in convertNarrationFileToAudioInBulk:', err)
      throw err
    }
  }

  async saveNarrationsToFile (scenes) {
    try {
      const fileName = `narration_${uuidv4()}.txt`
      const filePath = path.join(__dirname, 'narrations', fileName)

      const narrationsText = scenes.map(s => s.narration).join('\n')

      // Ensure directory exists
      fs.mkdirSync(path.dirname(filePath), { recursive: true })

      // Write file
      fs.writeFileSync(filePath, narrationsText, 'utf8')
      console.log(`[Narration File] Saved to ${filePath}`)

      return filePath
    } catch (err) {
      console.error('[saveNarrationsToFile] Failed to save narrations:', err)
    }
  }

  async refineCharacterPromptWithGpt (originalPrompt) {
    try {
      const chatResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that rewrites image generation prompts to make them safe, child-appropriate, and compliant with OpenAI’s safety guidelines while preserving the visual intent.'
          },
          {
            role: 'user',
            content: `Rephrase this prompt to be safer and still effective for image generation:\n\n"${originalPrompt}"`
          }
        ],
        temperature: 0.7
      })

      const refined = chatResponse.choices?.[0]?.message?.content?.trim()
      if (!refined) {
        console.warn('[refinePromptWithGpt] No response from GPT.')
        return null
      }

      console.log('[refinePromptWithGpt] Refined prompt:', refined)
      return refined
    } catch (err) {
      console.error('[refinePromptWithGpt] Failed to get refined prompt:', err.message)
      return null
    }
  }

  async generateCharacterImages (characterIds) {
    const MAX_RETRIES = 2

    try {
      console.log('[generateCharacterImages] Starting character image generation for:', characterIds)

      const characters = await Character.find({ _id: { $in: characterIds } })
      const validCharacters = characters.filter(c => c.promptHistory?.[0])

      if (validCharacters.length === 0) {
        console.warn('[generateCharacterImages] No valid characters with prompts.')
        return
      }

      await Promise.allSettled(
        validCharacters.map(async (char) => {
          let prompt = char.promptHistory[0]
          let imageBase64 = null
          let attempt = 0
          let lastError = null

          // Try original prompt up to MAX_RETRIES
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
              lastError = err
              console.error(`[generateCharacterImages] Error on attempt ${attempt + 1} for ${char.name}:`, err.message)
            }

            attempt++
          }

          // If image not generated and safety error occurred
          if (!imageBase64 && lastError?.status === 400 && lastError.message?.toLowerCase().includes('safety')) {
            console.warn(`[generateCharacterImages] Safety error detected for ${char.name}, refining prompt with GPT-4o...`)

            const refinedPrompt = await this.refineCharacterPromptWithGpt(prompt)
            if (!refinedPrompt) {
              console.error(`[generateCharacterImages] Could not refine prompt for ${char.name}`)
              return
            }

            try {
              const result = await this.openai.images.generate({
                model: 'gpt-image-1',
                prompt: refinedPrompt
              })

              imageBase64 = result.data[0]?.b64_json
              if (imageBase64) {
                prompt = refinedPrompt
                // Optionally save refined prompt
                char.promptHistory.unshift(refinedPrompt)
              } else {
                console.warn(`[generateCharacterImages] Still no image data for ${char.name} after refined prompt`)
                return
              }
            } catch (refineErr) {
              console.error(`[generateCharacterImages] Refined prompt failed for ${char.name}:`, refineErr.message)
              return
            }
          }

          if (!imageBase64) {
            console.error(`[generateCharacterImages] Failed to generate image for ${char.name} after all attempts`)
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

  async refineScenePromptWithGpt (originalPrompt) {
    try {
      const chatResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You rephrase image generation prompts to make them child-safe and compliant with OpenAI safety filters while preserving the scene’s visual meaning.'
          },
          {
            role: 'user',
            content: `Rephrase this prompt to be safe and usable for image generation:\n\n"${originalPrompt}"`
          }
        ],
        temperature: 0.7
      })

      const refined = chatResponse.choices?.[0]?.message?.content?.trim()
      return refined || null
    } catch (err) {
      console.error('[refinePromptWithGpt] Error:', err.message)
      return null
    }
  }

  async generateSceneImages (scriptId, sceneIdx = null) {
    try {
      console.log(`🔍 Generating scene images for script ID: ${scriptId}`)
      const scriptDoc = await Script.findById(scriptId)
      if (!scriptDoc || !Array.isArray(scriptDoc.script)) throw new Error('❌ Invalid script for image generation')

      const characterIds = scriptDoc.characterId.map(c => c._id || c)
      const characters = await Character.find({ _id: { $in: characterIds } })

      const charFileMap = new Map()
      for (const char of characters) {
        const charName = (char.name || char.characterName || 'unnamed').toLowerCase()
        const imageUrl = Array.isArray(char.imageUrl) ? char.imageUrl[0] : char.imageUrl
        if (!imageUrl) continue

        try {
          const filename = `${charName.replace(/\s+/g, '_')}_${uuidv4()}.png`
          const localPath = await this.downloadImage(imageUrl, filename)
          const openAIFile = await toFile(fs.createReadStream(localPath), null, { type: 'image/png' })
          charFileMap.set(charName, openAIFile)
        } catch (err) {
          console.warn(`⚠️ Failed to prepare image for "${charName}":`, err.message)
        }
      }

      const scenes = scriptDoc.script
      const sceneIndices = sceneIdx !== null ? [sceneIdx] : [...Array(scenes.length).keys()]
      const BATCH_SIZE = scriptDoc.numberOfScenes || scenes.length

      for (let i = 0; i < sceneIndices.length; i += BATCH_SIZE) {
        const batchIndices = sceneIndices.slice(i, i + BATCH_SIZE)
        console.log(`🧩 Processing scenes: ${batchIndices.join(', ')}`)

        const generated = await Promise.all(
          batchIndices.map(async (idx) => {
            const scene = scenes[idx]
            const prompt = `${scene.textToImagePrompt}, landscape format, 16:9 aspect ratio`.toLowerCase()

            const matchedCharFiles = []
            for (const [charName, file] of charFileMap.entries()) {
              if (new RegExp(`\\b${charName}\\b`, 'i').test(prompt)) matchedCharFiles.push(file)
            }

            const tryGenerate = async (inputPrompt) => {
              try {
                if (matchedCharFiles.length > 0) {
                  return await client.images.edit({
                    model: 'gpt-image-1',
                    image: matchedCharFiles[0],
                    prompt: inputPrompt
                  })
                } else {
                  return await client.images.generate({
                    model: 'gpt-image-1',
                    prompt: inputPrompt
                  })
                }
              } catch (err) {
                if (err.status === 400 && err.message.toLowerCase().includes('safety')) {
                  console.warn(`⚠️ Scene ${idx + 1} blocked due to safety, refining prompt...`)
                  const refinedPrompt = await this.refineScenePromptWithGpt(inputPrompt)
                  if (refinedPrompt) {
                    try {
                      return await tryGenerate(refinedPrompt)
                    } catch (refinedErr) {
                      console.error(`❌ Refined prompt also failed for scene ${idx + 1}:`, refinedErr.message)
                      return null
                    }
                  } else {
                    console.warn(`⚠️ No refined prompt returned for scene ${idx + 1}`)
                    return null
                  }
                } else {
                  console.error(`❌ Scene ${idx + 1} error:`, err.message)
                  return null
                }
              }
            }

            const rsp = await tryGenerate(prompt)
            if (!rsp?.data?.[0]?.b64_json) return null

            const base64Image = rsp.data[0].b64_json
            const savedImageUrl = await helper.saveBase64ImageToGcp(base64Image, `scene_${scriptId}_${idx + 1}.png`)
            const imageBuffer = Buffer.from(base64Image, 'base64')
            const localFileName = `${scriptId}_scene${idx + 1}.png`

            if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true })
            fs.writeFileSync(path.join(GENERATED_DIR, localFileName), imageBuffer)

            console.log(`📁 Scene ${idx + 1} saved: ${savedImageUrl}`)
            return { sceneIdx: idx, imageUrl: savedImageUrl }
          })
        )

        for (const result of generated) {
          if (result?.imageUrl) {
            scriptDoc.script[result.sceneIdx].imageUrl = result.imageUrl
          }
        }

        scriptDoc.markModified('script')
        await scriptDoc.save()
        console.log(`💾 Updated script after batch ${i / BATCH_SIZE + 1}`)
      }

      for (const file of fs.readdirSync(TEMP_DIR)) {
        fs.unlinkSync(path.join(TEMP_DIR, file))
      }

      console.log(`✅ All scene images generated for script ID: ${scriptId}`)
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

  async refineVideoPrompt (originalPrompt) {
    const sensitiveWords = ['sexy', 'naked', 'hot', 'revealing', 'provocative', 'lingerie']
    let refinedPrompt = originalPrompt

    for (const word of sensitiveWords) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi')
      refinedPrompt = refinedPrompt.replace(regex, '')
    }

    refinedPrompt = refinedPrompt.replace(/a photo of/i, 'an illustration of').trim()
    refinedPrompt += ' in a child-friendly 3D Pixar animated style'

    console.log('🧼 Refined Prompt:', refinedPrompt)
    return refinedPrompt
  }

  async generateVideoFromImage (options) {
    const MAX_RETRIES = 4
    let attempt = 0
    let finalUrl = null
    let currentPrompt = options.prompt

    const videosFolder = path.join(process.cwd(), 'Videos')
    if (!fs.existsSync(videosFolder)) {
      fs.mkdirSync(videosFolder)
    }

    const sceneIndexFile = path.join(videosFolder, 'scene_index.txt')
    if (!fs.existsSync(sceneIndexFile)) {
      fs.writeFileSync(sceneIndexFile, '0', 'utf8')
    }

    function getNextSceneIndexSync () {
      const fd = fs.openSync(sceneIndexFile, 'r+')
      const buf = Buffer.alloc(10)
      fs.readSync(fd, buf, 0, 10, 0)
      const current = parseInt(buf.toString().trim(), 10) || 0
      const next = current + 1
      fs.ftruncateSync(fd, 0)
      fs.writeSync(fd, next.toString(), 0, 'utf8')
      fs.closeSync(fd)
      return next
    }

    const sceneIndex = getNextSceneIndexSync()
    const localFilePath = path.join(videosFolder, `scene${sceneIndex}.mp4`)

    while (attempt <= MAX_RETRIES && !finalUrl) {
      try {
        console.log(`🚧 Attempt ${attempt + 1}/${MAX_RETRIES + 1} - generateVideoFromImage with:`, currentPrompt)

        const input = {
          prompt: currentPrompt,
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

        fs.writeFileSync(localFilePath, fileBuffer)
        console.log(`💾 Saved locally at ${localFilePath}`)

        finalUrl = await helper.uploadImageToGCP(fileBuffer, options.name || `scene${sceneIndex}`, mimeType)
        console.log('✅ Final ImageKit video URL:', finalUrl)
        return finalUrl
      } catch (error) {
        const errorMsg = error.response?.data || error.message
        console.error(`🔥 Error in generateVideoFromImage (attempt ${attempt + 1}):`, errorMsg)

        if (errorMsg.toString().toLowerCase().includes('sensitive') && attempt < MAX_RETRIES) {
          console.log('🛡️ Prompt flagged as sensitive. Refining...')
          currentPrompt = await this.refineVideoPrompt(currentPrompt)
        }
      }

      attempt++
    }

    if (!finalUrl) {
      throw new Error(`Failed to generate video after ${MAX_RETRIES + 1} attempts`)
    }
  }

  async trimAndMux ({ totalClips = 15, fadeTime = 0.5 }) {
    const baseDir = path.resolve(__dirname)
    const audiosDir = path.resolve(__dirname, '../../Audios')
    const videosDir = path.resolve(__dirname, '../../Videos')
    const outputDir = path.resolve(__dirname, '../../Output')
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir)

    const narrationDir = path.resolve(__dirname, './narrations')

    console.log(`[Init] Base Dir: ${baseDir}`)
    console.log(`[Init] Audios Dir: ${audiosDir}`)
    console.log(`[Init] Videos Dir: ${videosDir}`)
    console.log(`[Init] Output Dir: ${outputDir}`)
    console.log(`[Init] Narration Dir: ${narrationDir}`)

    const narrationFiles = fs.readdirSync(narrationDir).filter(f =>
      f.startsWith('narration_') && f.endsWith('.txt')
    )
    if (narrationFiles.length !== 1) {
      throw new Error(`Expected exactly one narration file, found ${narrationFiles.length}`)
    }

    const narrationPath = path.join(narrationDir, narrationFiles[0])
    const narrationLines = fs.readFileSync(narrationPath, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)

    if (narrationLines.length < totalClips) {
      throw new Error(`Narration file has only ${narrationLines.length} lines, but ${totalClips} clips expected.`)
    }

    const trimmedFiles = []

    for (let idx = 0; idx < totalClips; idx++) {
      console.log(`\n===== Processing Clip ${idx + 1}/${totalClips} =====`)

      const video = path.join(videosDir, `scene${idx + 1}.mp4`)
      const audio = path.join(audiosDir, `audio${idx + 1}.mp3`)
      const out = path.join(outputDir, `final_clip${idx + 1}.mp4`)

      await access(video)
      await access(audio)

      const durOutput = sh(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audio}"`)
      const dur = parseFloat(durOutput)
      if (isNaN(dur)) throw new Error(`Invalid duration for audio ${audio}`)

      const subtitleText = narrationLines[idx]
      const srtPath = path.join(baseDir, `subtitle${idx + 1}.srt`)
      const formatTime = (seconds) => {
        const ms = Math.floor(seconds * 1000)
        const date = new Date(ms).toISOString().substr(11, 12).replace('.', ',')
        return date
      }

      const srtContent = `1\n00:00:00,000 --> ${formatTime(dur + 0.35)}\n${subtitleText}\n`
      fs.writeFileSync(srtPath, srtContent, 'utf8')

      const fadeIn = idx === 0 || idx === totalClips - 1
      const fadeOut = idx === totalClips - 1 || idx === 0

      let fadeEffects = ''
      let audioFadeEffects = ''
      if (fadeIn && fadeOut) {
        fadeEffects = `,fade=t=in:st=0:d=${fadeTime},fade=t=out:st=${dur - fadeTime}:d=${fadeTime}`
        audioFadeEffects = `afade=t=in:st=0:d=${fadeTime},afade=t=out:st=${dur - fadeTime}:d=${fadeTime}`
      } else if (fadeIn) {
        fadeEffects = `,fade=t=in:st=0:d=${fadeTime}`
        audioFadeEffects = `afade=t=in:st=0:d=${fadeTime}`
      } else if (fadeOut) {
        fadeEffects = `,fade=t=out:st=${dur - fadeTime}:d=${fadeTime}`
        audioFadeEffects = `afade=t=out:st=${dur - fadeTime}:d=${fadeTime}`
      }

      const srtFilterPath = srtPath.replace(/\\/g, '/')

      const ffArgs = [
        '-ss', '0', '-t', (dur + 0.3).toString(), '-i', video,
        '-i', audio,
        '-map', '0:v', '-map', '1:a',
        '-c:v', 'libx264', '-crf', '20', '-preset', 'fast',
        '-c:a', 'aac', '-ac', '2',
        '-vf', `fps=30,format=yuv420p,subtitles='${srtFilterPath}':force_style='FontName=Arial,FontSize=16,PrimaryColour=&Hffffff,OutlineColour=&H000000,BorderStyle=1,Outline=1,Shadow=0,MarginV=30'${fadeEffects}`,
        ...(audioFadeEffects ? ['-af', audioFadeEffects] : []),
        '-shortest', out
      ]

      const result = spawnSync('ffmpeg', ffArgs, { stdio: 'inherit' })
      if (result.status !== 0) throw new Error(`ffmpeg failed on clip ${idx + 1}`)

      trimmedFiles.push(path.resolve(out))
    }

    // 🔗 Final concatenation
    console.log('\n===== Starting Final Concatenation =====')
    const listPath = path.join(baseDir, 'list.txt')
    const listText = trimmedFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
    fs.writeFileSync(listPath, listText)

    const concatResult = spawnSync('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', 'final.mp4'
    ], { stdio: 'inherit' })

    if (concatResult.status !== 0) {
      throw new Error(`ffmpeg failed while concatenating clips. Status: ${concatResult.status}`)
    }

    console.log('🎉 Final video created: final.mp4')

    // 🧹 Cleanup
    const tryUnlink = (f) => {
      try { fs.unlinkSync(f) } catch (e) { }
    }

    fs.readdirSync(audiosDir).forEach(f => f.startsWith('audio') && tryUnlink(path.join(audiosDir, f)))
    fs.readdirSync(videosDir).forEach(f => f.startsWith('scene') && tryUnlink(path.join(videosDir, f)))
    fs.readdirSync(outputDir).forEach(f => f.startsWith('final_clip') && tryUnlink(path.join(outputDir, f)))
    fs.readdirSync(baseDir).forEach(f => f.startsWith('subtitle') && tryUnlink(path.join(baseDir, f)))
    tryUnlink(listPath)
    narrationFiles.forEach(f => tryUnlink(path.join(narrationDir, f)))

    console.log('✅ Cleanup completed.')
  }
}

module.exports = new CharacterImages()

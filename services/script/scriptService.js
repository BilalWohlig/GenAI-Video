const OpenAI = require('openai')
const client = new OpenAI()
const Script = require('../../mongooseSchema/scriptSchema.js')
const Character = require('../../mongooseSchema/characterSchema.js')

class ScriptService {
  constructor () {
    this.openai = new OpenAI({
      openAiApiKey: process.env.OPENAI_API_KEY
    })
  }

  async createScript (info, user) {
    try {
      const { title, topic, numberOfScenes, characterId } = info

      if (!title || !topic || !characterId) {
        throw new Error(
          'Script validation failed: title, topic, and characterId are required.'
        )
      }

      const totalScenes = parseInt(numberOfScenes)
      if (isNaN(totalScenes) || totalScenes <= 0) {
        throw new Error('Invalid numberOfScenes value')
      }

      const characterIds = Array.isArray(characterId)
        ? characterId
        : [characterId]
      const characters = await Character.find({ _id: { $in: characterIds } })
      if (!characters || characters.length === 0) {
        throw new Error('Character(s) not found')
      }

      const characterNameList = characters
        .map((char, idx) => char.characterName)
        .join(', ')

      const inputPrompt = `
Create a ${totalScenes}-scene video script based on the following:
- **Title**: "${title}"
- **Topic**: "${topic}"
- **Main Character(s)**: ${characterNameList}

The video should be short — approximately 1 to 2 minutes in runtime.

Each scene should contain the following:
1. **Narration** (1–2 lines): A short voiceover describing the scene’s key action or emotion and naturally continuing from the previous scene. Ensure the narration flows together across scenes like a continuous storyline, not isolated moments. The viewer should feel the scenes are parts of one narrative arc.
2. **Text-to-Image Prompt**: A rich, detailed visual description for generating an image. Include character(s), lighting, mood, environment, style (e.g. cinematic, anime), key props, and setting details.
3. **Image-to-Video Prompt**: A clear instruction on how the static image should animate — such as camera motion, subject movement, or transitions (e.g. slow zoom, pan, dynamic cut, fade-in).

Guidelines:
- The story must have a **strong beginning and end**, with **clear continuity**.
- All scenes should be **logically connected and flow well**.
- The character(s) — ${characterNameList} — should appear and participate meaningfully in narration and visuals throughout.
- Content should be **friendly and appropriate for a general audience**.
- Use **simple language, engaging storytelling**, and imaginative visuals.

Return the result in this JSON format:

[
  {
    "narration": "Scene 1 narration...",
    "textToImagePrompt": "Visual description prompt...",
    "imageToVideoPrompt": "Animation style or motion prompt..."
  },
  ...
]
`

      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant for creating a short video script from the given title and topic. Use this title and topic, only nothing else.'
          },
          { role: 'user', content: inputPrompt }
        ],
        temperature: 0.7
      })

      let rawOutput = completion.choices[0].message.content.trim()

      if (rawOutput.startsWith('```')) {
        rawOutput = rawOutput
          .replace(/^```(?:json)?/, '')
          .replace(/```$/, '')
          .trim()
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

  async getAllScripts ({ userId, page = 1, limit = 10 }) {
    try {
      const query = {}

      //   // Optional: Filter scripts created by a specific user
      //   if (userId) {
      //     query.userId = userId
      //   }

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

  async getScriptById (scriptId) {
    try {
      if (!scriptId || typeof scriptId !== 'string') {
        throw new Error('Invalid scriptId')
      }

      const script = await Script.findById(scriptId).populate('characterId', 'characterName')

      if (!script) {
        throw new Error('Script not found')
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

  async insertMultipleScenes (scriptId, scenesToInsert) {
    try {
      if (!scriptId) throw new Error('scriptId is required')
      if (!Array.isArray(scenesToInsert) || scenesToInsert.length === 0) {
        throw new Error('scenesToInsert must be a non-empty array')
      }

      const scriptDoc = await Script.findById(scriptId)
      if (!scriptDoc) throw new Error('Script not found')

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

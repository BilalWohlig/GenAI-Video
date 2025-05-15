const OpenAI = require('openai')
const Character = require('../../mongooseSchema/characterSchema')
const helper = require('../../helper/helper')
const { default: mongoose } = require('mongoose')

require('dotenv').config()

class CharacterImages {
  constructor () {
    this.openai = new OpenAI({
      openAiApiKey: process.env.OPENAI_API_KEY
    })
  }

  // Create a new character
  async createCharacter (user, char, imageFile) {
    try {
      const character = new Character(char)
      if (!char.name || !char.description) {
        throw new Error('Character validation failed: name and description are required.')
      }
      // Generate a prompt using OpenAI
      const completions = await this.openai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant for creating gpt-image-1 prompts to generate Pixar-style animated caricature images. Do not include text or quotation marks in the image. Focus on visual details.'
          },
          {
            role: 'user',
            content: `
You are generating a Pixar-style full-body character illustration.

Step 1: Carefully observe the reference image and extract key visual features such as hairstyle, facial shape, expression, attire, and general appearance — all while maintaining a creative and stylized approach.

Step 2: Use the following character info to enhance the visual style and personality:
- Age Group: ${character.age}
- Description: ${character.description}

Step 3: Do not recreate the subject photorealistically — instead, reinterpret them as a whimsical Pixar-style animated character.

Step 4: The output should describe a full-body Pixar-style character in a standing pose, entire figure visible from head to toe, with details about outfit, posture, footwear, and overall animated vibe.

Reference Image: ${character.referenceImage}
`.trim()
          }
        ],
        model: 'gpt-4o-mini',
        temperature: 0
      })

      let generatedPrompt = completions.choices[0].message.content
      // 1. Remove extra whitespace
      generatedPrompt = generatedPrompt.replace(/\s+/g, ' ').trim()

      // 2. Remove unwanted special characters, but allow full stops (.) and hyphens (-)
      generatedPrompt = generatedPrompt.replace(/[^\w\s.-]/g, '')

      // 3. Remove any leading slashes (/)
      generatedPrompt = generatedPrompt.replace(/^\/+/, '')

      if (character.referenceImage) {
        generatedPrompt += ` --Reference Image: ${character.referenceImage}`
      }
      generatedPrompt += ' --ar 16:9'
      generatedPrompt += ` --Name: ${character.name} --age: ${character.age}`
      character.promptHistory.push(generatedPrompt)
      character.userId = user.id
      character.imageUrl = 'Image generation in process......'
      character.imageUrlStatus = 'processing'
      await character.save()

      this.generateCharacterImage(character._id, imageFile)

      return character
    } catch (err) {
      console.log('Error in createCharacter function :: ', err)
      throw new Error(err)
    }
  }

  async generateCharacterImage (charId) {
    try {
      const character = await Character.findById(charId)
      if (!character.promptHistory[0] || typeof character.promptHistory[0] !== 'string' || !character.promptHistory[0].trim()) {
        throw new Error('Prompt must be a non-empty string.')
      }

      const response = await this.openai.images.generate({
        model: 'gpt-image-1',
        prompt: character.promptHistory[0]
      })
      const imageData = response.data[0].b64_json
      const imageUrl = await helper.saveBase64ImageToGcp(imageData, 'character.png')

      character.imageUrl = imageUrl
      character.imageUrlStatus = 'completed'
      await character.save()
      return
    } catch (error) {
      console.error('Error generating character image with GPT-Image-1:', error)
      const character = await Character.findById(charId)
      character.imageUrlStatus = 'failed'
      await character.save()
      throw error
    }
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

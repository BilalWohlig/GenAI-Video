const OpenAI = require('openai')
const Character = require('../../mongooseSchema/characterSchema')
const helper = require('../../helper/helper')
require('dotenv').config()

class CharacterImages {
  constructor () {
    this.openai = new OpenAI({
      openAiApiKey: process.env.OPENAI_API_KEY
    })
  }

  // Create a new character
  async createCharacter (char, user) {
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
            content: 'You are a helpful assistant for creating Midjourney-style prompts to generate Pixar-style animated caricature images. Do not include text or quotation marks in the image. Focus on visual details.'
          },
          {
            role: 'user',
            content: `Generate a prompt for a Pixar-style caricature image using only the following details: Name: ${character.name}, Description: ${character.description}, Reference Image: ${character.referenceImage}. The prompt should be clean, natural language, and optimized for image generation. Do not include any text on the image or quotation marks.`
          }
        ],
        model: 'gpt-4o-mini'
      })

      let generatedPrompt = completions.choices[0].message.content
      // 1. Remove extra whitespace
      generatedPrompt = generatedPrompt.replace(/\s+/g, ' ').trim()

      // 2. Remove unwanted special characters, but allow full stops (.) and hyphens (-)
      generatedPrompt = generatedPrompt.replace(/[^\w\s.-]/g, '')

      // 3. Remove any leading slashes (/)
      generatedPrompt = generatedPrompt.replace(/^\/+/, '')

      if (character.referenceImage) {
        generatedPrompt += ` --cref ${character.referenceImage}`
      }
      generatedPrompt += ' --ar 16:9'
      character.promptHistory.push(generatedPrompt)
      character.userId = user.id
      character.imageUrl = 'Image generation in process......'
      character.imageUrlStatus = 'processing'
      await character.save()

      this.generateCharacterImage(character._id, generatedPrompt)

      return character
    } catch (err) {
      console.log('Error in createCharacter function :: ', err)
      throw new Error(err)
    }
  }

  async generateCharacterImage (charId, prompt) {
    try {
      const character = await Character.findById(charId)
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        throw new Error('Prompt must be a non-empty string.')
      }

      const response = await this.openai.images.generate({
        model: 'gpt-image-1',
        prompt
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
        user_id: user.id,
        s3Url: { $exists: true, $ne: [] } // Check that s3Url exists and is not empty
      }
      if (category === 'selected') {
        query.status = 'selected'
      } else if (category === 'not selected') {
        query.status = 'not selected'
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
      const ifCharacter = await Character.findOne({ user_id: user.id, _id: id })
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
}

module.exports = new CharacterImages()

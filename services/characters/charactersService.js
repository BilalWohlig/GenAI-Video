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
}

module.exports = new CharacterImages()

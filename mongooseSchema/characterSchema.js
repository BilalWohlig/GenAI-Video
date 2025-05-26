const mongoose = require('mongoose')
const { Schema } = mongoose

const characterSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ''
    },
    promptHistory: {
      type: [String],
      default: []
    },
    imageUrl: {
      type: String,
      default: 'Image generation in process...'
    },
    imageUrlStatus: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing'
    }
  },
  {
    timestamps: true
  }
)

module.exports = mongoose.model('Character', characterSchema)

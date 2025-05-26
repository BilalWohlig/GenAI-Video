const mongoose = require('mongoose')
const { Schema } = mongoose

const scriptSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    characterId: [{
      type: Schema.Types.ObjectId,
      ref: 'Character',
      required: true
    }],
    title: {
      type: String,
      required: false
    },
    topic: {
      type: String,
      required: true
    },
    numberOfScenes: {
      type: Number,
      default: 15
    },
    status: {
      type: String,
      enum: ['draft', 'final'],
      default: 'draft'
    },
    token_count: {
      type: Number
    },
    script: {
      type: [Object],
      required: true
    }
  },
  {
    timestamps: true
  }
)

module.exports = mongoose.model('Script', scriptSchema)

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
      required: true
    },
    topic: {
      type: String,
      required: true
    },
    numberOfScenes: {
      type: Number,
      required: true,
      min: 1
    },
    status: {
      type: String,
      enum: ['draft', 'final'],
      default: 'draft'
      // required: true
    },
    token_count: {
      type: Number
      // required: true
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

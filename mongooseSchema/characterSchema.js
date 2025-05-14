const mongoose = require('mongoose')
const { Schema } = mongoose

const characterSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  referenceImage: {
    type: String
  },
  imageUrl: {
    type: [String]
  },
  imageUrlStatus: {
    type: String,
    enum: ['idle', 'queued', 'processing', 'completed', 'failed'],
    default: 'idle'
  },
  promptHistory: {
    type: [String]
  },
  status: {
    type: Boolean,
    default: false
  }
},
{
  timestamps:
  true
})

const Character = mongoose.model('Character', characterSchema)
module.exports = Character

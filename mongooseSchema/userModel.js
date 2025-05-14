const mongoose = require('mongoose')
const { Schema } = mongoose

const userSchema = new Schema({
  email: {
    type: String,
    required: true
  },
  password: {
    type: String
    // required: true
  },
  type: {
    type: String,
    enum: ['google', 'email']
    // required: true
  }
})

const User = mongoose.model('User', userSchema)
module.exports = User

const mongoose = require('mongoose')
const { Schema } = mongoose

const profileSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  userName: {
    type: String
    // required: true
  },
  email: {
    type: String,
    required: true
  },
  firstName: {
    type: String
    // required: true
  },
  lastName: {
    type: String
    // required: true
  },
  job: {
    type: String
    // required: true
  },
  about: {
    type: String
    // required: true
  },
  profileImage: {
    type: String
  }
})

const Profile = mongoose.model('Profile', profileSchema)
module.exports = Profile

const UserProfile = require('../../mongooseSchema/profileModel')

class Profile {
  async getUserProfile (user) {
    try {
      const profile = await UserProfile.findOne({ userID: user.id })
      console.log('User Profile', profile)
      if (!profile) {
        console.log('User Profile not Found')
        throw new Error('User Profile not found')
      }
      return profile
    } catch (error) {
      console.error('Error fetching profile:', error)
      throw new Error('Could not fetch profile')
    }
  }

  async editUserProfile (user, body, file) {
    try {
      if (file) {
        body.profileImage = file.path
      }

      const updatedProfile = await UserProfile.findOneAndUpdate(
        { userID: user.id },
        { $set: body },
        { new: true, runValidators: true }
      )

      if (!updatedProfile) {
        throw new Error('User profile not found')
      }

      return updatedProfile
    } catch (error) {
      console.error('Error editing profile:', error)
      throw new Error('Could not update profile')
    }
  }
}

module.exports = new Profile()

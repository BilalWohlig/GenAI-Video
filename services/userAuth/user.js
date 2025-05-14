const User = require('../../mongooseSchema/userModel')
const UserProfile = require('../../mongooseSchema/profileModel')
const bcrypt = require('bcrypt')
const dotenv = require('dotenv')
dotenv.config()

class UserAuth {
  constructor (email, password) {
    this.email = email
    this.password = password
  }

  async register (user) {
    const { email, password, confirmPassword, type } = user

    if (!email || !password || !confirmPassword || !type) {
      throw new Error('Please enter all required fields')
    }

    // Email regex: valid format like name@example.com
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format')
    }

    // Password regex:
    // Minimum 8 characters, at least one uppercase, one lowercase, one number, and one special character
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/
    if (!passwordRegex.test(password)) {
      throw new Error('Password must be at least 8 characters and include uppercase, lowercase, number, and special character')
    }

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match')
    }

    try {
      const userExists = await User.findOne({ email })
      if (userExists) {
        throw new Error('User already exists')
      }

      const hashedPassword = await bcrypt.hash(password, 10)
      const newUser = await User.create({
        email,
        password: hashedPassword,
        type
      })

      console.log('New User created')
      return {
        message: 'User registered successfully',
        user: {
          email: newUser.email,
          id: newUser._id
        }
      }
    } catch (error) {
      console.error('Error registering user:', error.message)
      throw error
    }
  }

  // login the user
  async login (user) {
    const { email, password } = user

    if (!email || !password) {
      throw new Error('Please enter all required fields')
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format')
    }

    try {
      const userExists = await User.findOne({ email })
      if (!userExists) {
        throw new Error('User does not exist')
      }

      const isPasswordValid = await bcrypt.compare(password, userExists.password)
      if (!isPasswordValid) {
        throw new Error('Invalid credentials')
      }

      let profile = await UserProfile.findOne({ userID: userExists._id })
      if (!profile) {
        profile = new UserProfile({
          userID: userExists._id,
          email: userExists.email
        })
        await profile.save()
        console.log('New profile created: ', profile)
      } else {
        console.log('Profile already exists for this user')
      }

      return {
        email: userExists.email,
        id: userExists._id
      }
    } catch (error) {
      console.error('Error logging in:', error.message)
      throw error
    }
  }

  // login with OAuth

  async oAuthLogin (user) {
    let { email } = user

    if (!email) {
      throw new Error('Please enter all required fields')
    }

    // Normalize email
    email = email.trim().toLowerCase()

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format')
    }

    try {
      let userExists = await User.findOne({ email })

      if (!userExists) {
        const newUser = await User.create({
          email,
          type: 'oauth', // optional: can distinguish oauth users
          isOAuthUser: true // optional: future reference
        })
        await newUser.save()
        userExists = newUser
      }

      return {
        email: userExists.email,
        id: userExists._id
      }
    } catch (error) {
      console.error('Error logging in:', error.message)
      throw error
    }
  }
}

module.exports = new UserAuth()

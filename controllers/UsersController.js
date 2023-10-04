const sha1 = require('sha1');
const DBClient = require('../utils/db');
const redisClient = require('../utils/redis');

const UsersController = {
  async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    const userExists = await DBClient.getUser({ email });

    if (userExists) {
      return res.status(400).json({ error: 'Already exists' });
    }

    const hashedPassword = sha1(password);
    const newUser = await DBClient.createUser({
      email,
      password: hashedPassword,
    });

    return res.status(201).json({ id: newUser._id, email: newUser.email });
  },
};

const UserController = {
  async getMe(req, res) {
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Retrieve user ID from Redis using the token
    const userId = await redisClient.get(`auth_${token}`);

    // console.log(`userID: ${userId}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Retrieve user details based on user ID
    const user = await DBClient.getUserById(userId);

    // console.log(`User: ${user}`);

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Return user object (email and id only)
    return res.status(200).json({ id: user._id, email: user.email });
  },
};

module.exports = { UserController, UsersController };

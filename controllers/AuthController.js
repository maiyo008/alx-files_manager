const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');

class AuthController {
  static async getConnect(req, res) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const authParts = authHeader.split(' ');

    if (authParts.length !== 2 || authParts[0] !== 'Basic') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const authDecoded = Buffer.from(authParts[1], 'base64').toString();
    const [email, password] = authDecoded.split(':');
    const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');

    // Find the user based on email and hashedPassword
    const user = await dbClient.getUserByEmailAndPassword(email, hashedPassword);

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Generate a random token
    const token = uuidv4();

    // console.log(`token: ${token}`);
    // console.log(`UserId: ${user._id}`);

    // Store user ID in Redis with the token as the key
    redisClient.set(`auth_${token}`, user._id, 24 * 60 * 60); // Expires in 24 hours

    return res.status(200).json({ token });
  }

  static getDisconnect(req, res) {
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Retrieve user ID from Redis using the token
    const userId = redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Delete token from Redis
    redisClient.del(`auth_${token}`);

    return res.status(204).send();
  }
}

module.exports = AuthController;

const RedisClient = require('../utils/redis');
const DBClient = require('../utils/db');

const AppController = {
  async getStatus(req, res) {
    const redisStatus = RedisClient.isAlive();
    const dbStatus = await DBClient.isAlive();
    res.json({ redis: redisStatus, db: dbStatus });
  },

  async getStats(req, res) {
    const usersCount = await DBClient.nbUsers();
    const filesCount = await DBClient.nbFiles();
    res.json({ users: usersCount, files: filesCount });
  },
};

module.exports = AppController;

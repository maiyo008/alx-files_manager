#!/usr/bin/node

const { v4 } = require('uuid'); // for generation of tokens
const dbClient = require('../utils/db');// the databse clientt
const redisClient = require('../utils/redis');
const { getAuthzHeader, pwdHashed } = require('../utils/utils');

class AuthController {
  static async getConnect(req, res) {  //handler for connect endpont
    const authzHeader = getAuthzHeader(req);// get authorization header

    if (!authzHeader) { // no authorization
      res.status(401).json({ error: 'Unauthorized' }); //unauthorized response
      return;
    }

    const [email, password] = Buffer.from(authzHeader.split(' ')[1], 'base64')// decoding the base64-encoded email and password
      .toString('utf-8')
      .split(':');

    const user = await dbClient.getUser(email);// you get the user from db using email and password

    if (!user || user.password !== pwdHashed(password)) { // maybe user diesnt exist or wrong password
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = v4(); // generate a new token
    await redisClient.set(`auth_${token}`, user._id.toString('utf8'), 60 * 60 * 24);
    res.status(200).json({ token });
  }

  static async getDisconnect(req, res) {
    const token = req.headers['x-token'];

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const id = await redisClient.get(`auth_${token}`);

    if (!id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await redisClient.del(`auth_${token}`);
    res.status(204).end();
  }

  static async getMe(req, res) {
    const token = req.headers['x-token'];

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const id = await redisClient.get(`auth_${token}`);

    if (!id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await dbClient.getUserById(id);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    res.status(200).json({ id: user._id, email: user.email });
  }
}

module.exports = AuthController;

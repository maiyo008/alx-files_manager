const { MongoClient } = require('mongodb');
const { ObjectId } = require('mongodb');

class DBClient {
  constructor() {
    this.host = process.env.DB_HOST || 'localhost';
    this.port = process.env.DB_PORT || 27017;
    this.database = process.env.DB_DATABASE || 'files_manager';
    this.url = `mongodb://${this.host}:${this.port}`;
    this.client = new MongoClient(this.url, { useUnifiedTopology: true });
    this.db = null; // Reference to the MongoDB database
  }

  async connect() {
    await this.client.connect();
    this.db = this.client.db(this.database);
  }

  isAlive() {
    return this.db !== null; // Check if the database connection is established
  }

  async nbUsers() {
    const usersCollection = this.db.collection('users');
    const count = await usersCollection.countDocuments();
    return count;
  }

  async nbFiles() {
    const filesCollection = this.db.collection('files');
    const count = await filesCollection.countDocuments();
    return count;
  }

  async createUser(userData) {
    try {
      const usersCollection = this.db.collection('users');
      const result = await usersCollection.insertOne(userData);
      return result.ops[0];
    } catch (error) {
      throw new Error(`Error creating user: ${error.message}`);
    }
  }

  async getUser(query) {
    try {
      const usersCollection = this.db.collection('users');
      const user = await usersCollection.findOne(query);
      return user;
    } catch (error) {
      throw new Error(`Error fetching user: ${error.message}`);
    }
  }

  async getUserById(id) {
    const usersCollection = this.db.collection('users');
    const user = await usersCollection.findOne({ _id: ObjectId(id) });
    return user;
  }

  async getUserByEmailAndPassword(email, password) {
    const usersCollection = this.db.collection('users');
    const user = await usersCollection.findOne({ email, password });
    return user;
  }
}

const dbClient = new DBClient();

// Connect to the database when the application starts
dbClient.connect()
  .then(() => {
    // console.log('Connected to MongoDB');
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  });

module.exports = dbClient;

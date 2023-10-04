#!/usr/bin/node

// Require necessary modules and libraries
const { v4: uuidv4 } = require('uuid'); // Generates unique identifiers
const fs = require('fs').promises; // File system operations
const { ObjectID } = require('mongodb'); // MongoDB ObjectID for querying
const mime = require('mime-types'); // For determining file MIME type
const Queue = require('bull'); // For background job processing
const dbClient = require('../utils/db'); // MongoDB client
const redisClient = require('../utils/redis'); // Redis client for caching

// Create a new Bull queue for processing files asynchronously
const fileQueue = new Queue('fileQueue', 'redis://127.0.0.1:6379');

// Define a class for handling file-related operations
class FilesController {
  // Method to get the user associated with a request
  static async getUser(request) {
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (userId) {
      const users = dbClient.db.collection('users');
      const idObject = new ObjectID(userId);
      const user = await users.findOne({ _id: idObject });

      if (!user) {
        return null;
      }

      return user;
    }

    return null;
  }

  // Method to handle file uploads
  static async postUpload(request, response) {
    const user = await FilesController.getUser(request);

    if (!user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    // Extract data from the request body
    const { name } = request.body;
    const { type } = request.body;
    const { parentId } = request.body;
    const isPublic = request.body.isPublic || false;
    const { data } = request.body;

    // Check for missing required fields
    if (!name) {
      return response.status(400).json({ error: 'Missing name' });
    }
    if (!type) {
      return response.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) {
      return response.status(400).json({ error: 'Missing data' });
    }

    // Access the MongoDB files collection
    const files = dbClient.db.collection('files');

    // Check if the parent folder (if specified) exists
    if (parentId) {
      const idObject = new ObjectID(parentId);
      const file = await files.findOne({ _id: idObject, userId: user._id });

      if (!file) {
        return response.status(400).json({ error: 'Parent not found' });
      }

      if (file.type !== 'folder') {
        return response.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    // Handle folder creation
    if (type === 'folder') {
      files
        .insertOne({
          userId: user._id,
          name,
          type,
          parentId: parentId || 0,
          isPublic,
        })
        .then((result) =>
          response.status(201).json({
            id: result.insertedId,
            userId: user._id,
            name,
            type,
            isPublic,
            parentId: parentId || 0,
          })
        )
        .catch((error) => {
          console.log(error);
        });
    } else {
      // Handle file creation
      const filePath = process.env.FOLDER_PATH || '/tmp/files_manager';
      const fileName = `${filePath}/${uuidv4()}`;
      const buff = Buffer.from(data, 'base64');

      try {
        // Create the file directory if it doesn't exist
        try {
          await fs.mkdir(filePath);
        } catch (error) {
          // Ignore if the directory already exists
        }

        // Write the file data to disk
        await fs.writeFile(fileName, buff, 'utf-8');
      } catch (error) {
        console.log(error);
      }

      // Insert the file record into the database
      files
        .insertOne({
          userId: user._id,
          name,
          type,
          isPublic,
          parentId: parentId || 0,
          localPath: fileName,
        })
        .then((result) => {
          response.status(201).json({
            id: result.insertedId,
            userId: user._id,
            name,
            type,
            isPublic,
            parentId: parentId || 0,
          });

          // If the file is an image, add it to the processing queue
          if (type === 'image') {
            fileQueue.add({
              userId: user._id,
              fileId: result.insertedId,
            });
          }
        })
        .catch((error) => console.log(error));
    }

    return null;
  }

  // Method to retrieve file information by ID
  static async getShow(request, response) {
    const user = await FilesController.getUser(request);

    if (!user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = request.params.id;
    const files = dbClient.db.collection('files');
    const idObject = new ObjectID(fileId);
    const file = await files.findOne({ _id: idObject, userId: user._id });

    if (!file) {
      return response.status(404).json({ error: 'Not found' });
    }

    return response.status(200).json(file);
  }

  // Method to retrieve a list of user files
  static async getIndex(request, response) {
    const user = await FilesController.getUser(request);

    if (!user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const { parentId, page } = request.query;
    const pageNum = page || 0;
    const files = dbClient.db.collection('files');
    let query;

    // Define the MongoDB query based on parent folder (if specified)
    if (!parentId) {
      query = { userId: user._id };
    } else {
      query = { userId: user._id, parentId: ObjectID(parentId) };
    }

    // Use aggregation to fetch paginated results
    files.aggregate([
      { $match: query },
      { $sort: { _id: -1 } },
      {
        $facet: {
          metadata: [{ $count: 'total' }, { $addFields: { page: parseInt(pageNum, 10) } }],
          data: [{ $skip: 20 * parseInt(pageNum, 10) }, { $limit: 20 }],
        },
      },
    ]).toArray((err, result) => {
      if (result) {
        const final = result[0].data.map((file) => {
          const tmpFile = {
            ...file,
            id: file._id,
          };
          delete tmpFile._id;
          delete tmpFile.localPath;
          return tmpFile;
        });

        return response.status(200).json(final);
      }

      console.log('Error occurred');
      return response.status(404).json({ error: 'Not found' });
    });

    return null;
  }

  // Method to make a file public
  static async putPublish(request, response) {
    const user = await FilesController.getUser(request);

    if (!user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = request.params;
    const files = dbClient.db.collection('files');
    const idObject = new ObjectID(id);
    const newValue = { $set: { isPublic: true } };
    const options = { returnOriginal: false };

    files.findOneAndUpdate({ _id: idObject, userId: user._id }, newValue, options, (err, file) => {
      if (!file.lastErrorObject.updatedExisting) {
        return response.status(404).json({ error: 'Not found' });
      }

      return response.status(200).json(file.value);
    });

    return null;
  }

  // Method to make a file private
  static async putUnpublish(request, response) {
    const user = await FilesController.getUser(request);

    if (!user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = request.params;
    const files = dbClient.db.collection('files');
    const idObject = new ObjectID(id);
    const newValue = { $set: { isPublic: false } };
    const options = { returnOriginal: false };

    files.findOneAndUpdate({ _id: idObject, userId: user._id }, newValue, options, (err, file) => {
      if (!file.lastErrorObject.updatedExisting) {
        return response.status(404).json({ error: 'Not found' });
      }

      return response.status(200).json(file.value);
    });

    return null;
  }

  // Method to serve a file to the user
  static async getFile(request, response) {
    const { id } = request.params;
    const files = dbClient.db.collection('files');
    const idObject = new ObjectID(id);

    files.findOne({ _id: idObject }, async (err, file) => {
      if (!file) {
        return response.status(404).json({ error: 'Not found' });
      }

      if (file.isPublic) {
        if (file.type === 'folder') {
          return response.status(400).json({ error: "A folder doesn't have content" });
        }

        try {
          let fileName = file.localPath;
          const size = request.param('size');

          if (size) {
            fileName = `${file.localPath}_${size}`;
          }

          const data = await fs.readFile(fileName);
          const contentType = mime.contentType(file.name);

          return response.header('Content-Type', contentType).status(200).send(data);
        } catch (error) {
          console.log(error);
          return response.status(404).json({ error: 'Not found' });
        }
      } else {
        const user = await FilesController.getUser(request);

        if (!user) {
          return response.status(404).json({ error: 'Not found' });
        }

        if (file.userId.toString() === user._id.toString()) {
          if (file.type === 'folder') {
            return response.status(400).json({ error: "A folder doesn't have content" });
          }

          try {
            let fileName = file.localPath;
            const size = request.param('size');

            if (size) {
              fileName = `${file.localPath}_${size}`;
            }

            const contentType = mime.contentType(file.name);
            return response.header('Content-Type', contentType).status(200).sendFile(fileName);
          } catch (error) {
            console.log(error);
            return response.status(404).json({ error: 'Not found' });
          }
        } else {
          console.log(`Wrong user: file.userId=${file.userId}; userId=${user._id}`);
          return response.status(404).json({ error: 'Not found' });
        }
      }
    });
  }
}

module.exports = FilesController;

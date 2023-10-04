const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const dbClient = require('../utils/db');
const { ObjectId } = require('mongodb');


class FilesController {
    static async postUpload(req, res) {
        const token = req.headers['x-token'];
        const userId = await redisClient.get(`auth_${token}`);

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized'});
        }

        const { name, type, parentId, isPublic, data } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Missing name'});
        }
        if (!type || !['folder', 'file', 'image'].includes(type)) {
            return res.status(400).json({ error: 'Missing or invalid type'});
        }
        if (type !== 'folder' && !data) {
            return res.status(400).json({ error: 'Missing data'});
        }

        if (parentId) {
            const filesCollection = dbClient.db.collection('files');
            const parentFile = await filesCollection.findOne({ _id: ObjectId(parentId) });

            if (!parentFile) {
                return res.status(400).json({ error: 'Parent not found' });
            }

            if (parentFile.type !== 'folder') {
                return res.status(400).json({ error: 'Parent is not a folder' });
            }
        }
        
        let localPath = null;
        if (type !== 'folder') {
            const filename = uuidv4(); //Generate unique filename
            const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';

            //create folder if it does not exist
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }

            //save file locally
            localPath = path.join(folderPath, filename);
            fs.writeFileSync(localPath, Buffer.from(data, 'base64'));
        }

        const newFile = {
            userId: ObjectId(userId),
            name,
            type,
            isPublic: Boolean(isPublic),
            parentId: parentId ? ObjectId(parentId) : null,
            localPath,
        };

        //Add the new file to the DB
        const fileCollection = dbClient.db.collection('files');
        const result = await filesCollection.insertOne(newFile);

        return res.status(201).json(result.ops[0]);
    }
}

module.exports = FilesController;

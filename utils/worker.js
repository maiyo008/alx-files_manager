// Require necessary modules
const Queue = require('bull');
const imageThumbnail = require('image-thumbnail');
const fs = require('fs').promises;
const { ObjectID } = require('mongodb');
const dbClient = require('./utils/db');

// Create a queue for processing files
const fileQueue = new Queue('fileQueue', 'redis://127.0.0.1:6379');
const userQueue = new Queue('userQueue', 'redis://127.0.0.1:6379');

// Function to generate a thumbnail of a specific width
async function thumbNail(width, localPath) {
  const thumbnail = await imageThumbnail(localPath, { width });
  return thumbnail;
}

// Process the file queue
fileQueue.process(async (job, done) => {
  console.log('Processing...');
  const { fileId } = job.data;
  if (!fileId) {
    done(new Error('Missing fileId'));
  }

  const { userId } = job.data;
  if (!userId) {
    done(new Error('Missing userId'));
  }

  console.log(fileId, userId);
  const files = dbClient.db.collection('files');
  const idObject = new ObjectID(fileId);

  // Find the file in the database
  files.findOne({ _id: idObject }, async (err, file) => {
    if (!file) {
      console.log('Not found');
      done(new Error('File not found'));
    } else {
      const fileName = file.localPath;

      // Generate thumbnails of different sizes
      const thumbnail500 = await thumbNail(500, fileName);
      const thumbnail250 = await thumbNail(250, fileName);
      const thumbnail100 = await thumbNail(100, fileName);

      console.log('Writing files to the system');
      const image500 = `${file.localPath}_500`;
      const image250 = `${file.localPath}_250`;
      const image100 = `${file.localPath}_100`;

      // Write the thumbnails to the system
      await fs.writeFile(image500, thumbnail500);
      await fs.writeFile(image250, thumbnail250);
      await fs.writeFile(image100, thumbnail100);
      done();
    }
  });
});

// Process the user queue
userQueue.process(async (job, done) => {
  const { userId } = job.data;
  if (!userId) done(new Error('Missing userId'));
  const users = dbClient.db.collection('users');
  const idObject = new ObjectID(userId);
  const user = await users.findOne({ _id: idObject });
  if (user) {
    console.log(`Welcome ${user.email}!`);
  } else {
    done(new Error('User not found'));
  }
});

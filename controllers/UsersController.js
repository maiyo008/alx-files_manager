#!/usr/bin/node

const dbClient = require('../utils/db');//import the database client

class UsersController {
  static async postNew(req, res) { //a function to handle post request
    const { email, password } = req.body; //extract email and password from the request body

    // Define error response codes and messages
    const missingEmailError = { code: 400, message: 'Missing email' };
    const missingPasswordError = { code: 400, message: 'Missing password' };
    const alreadyExistError = { code: 400, message: 'Already exist' };

    if (!email) { //check if email is missing
      res.status(missingEmailError.code).json({ error: missingEmailError.message });
      return;
    }

    if (!password) { //check if password is missing
      res.status(missingPasswordError.code).json({ error: missingPasswordError.message });
      return;
    }

    const userExist = await dbClient.userExist(email); // is there a user with the same email

    if (userExist) { // if the email exists
      res.status(alreadyExistError.code).json({ error: alreadyExistError.message });
      return;
    }
    //hashing password for security
    const hashedPassword = sha1(password);

    
    const user = await dbClient.createUser(email, hashedPassword); //create the new user in the database
    const id = `${user.insertedId}`; 
    res.status(201).json({ id, email });
  }
}

module.exports = UsersController;

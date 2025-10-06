import express from 'express';
import mongoose from 'mongoose';
import { PolyMongo } from '../dist/index.js';

const app = express();
app.use(express.json());

// User schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
});

// Create wrapper synchronously - initialization happens on first query
const wrapper = new PolyMongo({
  mongoURI: 'mongodb://localhost:27017',
  
});

const User = wrapper.wrapModel(mongoose.model('User', userSchema));

// Add user route
app.post('/add-user/:db', async (req, res) => {
  try {
    const { db } = req.params;
    const user = await User.db(db).create(req.body);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// View users route
app.get('/view-user/:db', async (req, res) => {
  try {
    const { db } = req.params;
    const users = await User.db(db).find().lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
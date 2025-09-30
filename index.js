// index.js (entry point)
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const routes = require('./routes');
const { createRootUser } = require('./config/firebase');

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'chave-super-secreta',
  resave: false,
  saveUninitialized: false
}));

// mount routes
app.use('/', routes);

// create root user at startup (non-blocking)
createRootUser().catch(err => {
  console.error('createRootUser failed:', err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

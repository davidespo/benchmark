const express = require('express');
const app = express();
const port = 3032;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/delay/:delay', (req, res) => {
  const delay = parseInt(req.params.delay);
  setTimeout(() => res.send('Hello World!'), delay);
});

let count = 0;
app.post('/count', (req, res) => {
  count++;
  res.send({ count });
});
app.get('/count', (req, res) => {
  res.send({ count });
});

app.listen(port, () => {
  console.log(`Test REST service listening at http://localhost:${port}`);
});

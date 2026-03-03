import express from 'express';

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'API Running' });
});

export default app;

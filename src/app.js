import express from 'express';
import apiV1Router from '#routes/v1/index.routes.js';
import { errorHandler } from '#shared/middlewares/error-handler.middleware.js';

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'API Running' });
});

app.use('/v1', apiV1Router);

// Global error handler (must be registered after all routes)
app.use(errorHandler);

export default app;

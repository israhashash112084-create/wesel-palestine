import express from 'express';
import apiV1Router from '#routes/v1/index.routes.js';
import { errorHandler } from '#shared/middlewares/error-handler.middleware.js';
import cookieParser from 'cookie-parser';

const app = express();

app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
  res.json({ status: 'API Running' });
});

app.use('/api/v1', apiV1Router);

// Global error handler (must be registered after all routes)
app.use(errorHandler);

export default app;

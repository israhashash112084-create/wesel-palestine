const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const errorHandler = require('./middleware/error');

const roadRouter = require('./modules/road/routes');
const reportsRouter = require('./modules/reports/routes');
const routingRouter = require('./modules/routing/routes');
const alertsRouter = require('./modules/alerts/routes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'API Running' });
});

app.use('/api/v1/road', roadRouter);
app.use('/api/v1/reports', reportsRouter);
app.use('/api/v1/routes', routingRouter);
app.use('/api/v1/alerts', alertsRouter);

app.use(errorHandler);

module.exports = app;

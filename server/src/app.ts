import cors from 'cors';
import express from 'express';
import { runRouter } from './routes/run.js';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api', runRouter);

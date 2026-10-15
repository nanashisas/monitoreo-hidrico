const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);

const corsOptions = {
    origin: [
        'https://nanashisas.github.io',
        'http://localhost:8080',
        'http://localhost:3000'
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(helmet());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));

// Rutas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/estaciones', require('./routes/estaciones'));
app.use('/api/mediciones', require('./routes/mediciones'));
app.use('/api/alertas', require('./routes/alertas'));
app.use('/api/refugios', require('./routes/refugios'));
app.use('/api/familias', require('./routes/familias'));
app.use('/api/personas', require('./routes/personas'));
app.use('/api/asistencias', require('./routes/asistencias'));
app.use('/api/vehiculos', require('./routes/vehiculos'));

app.get('/health', (req, res) => res.json({ status: 'OK' }));
app.use('*', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor en puerto ${PORT}`));

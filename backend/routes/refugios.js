const express = require('express');
const { query } = require('../config/database');
const { autenticarToken, autorizarRol } = require('../middleware/auth');

const router = express.Router();

// GET /api/refugios - lista con porcentaje de ocupación
router.get('/', autenticarToken, async (req, res) => {
    try {
        const result = await query(`
            SELECT r.*,
                CASE 
                    WHEN r.capacidad_maxima > 0 
                    THEN ROUND((r.ocupacion_actual::decimal / r.capacidad_maxima) * 100, 1)
                    ELSE 0 
                END as porcentaje_ocupacion
            FROM refugios r
            WHERE r.activo = true
            ORDER BY r.nombre
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo refugios:', error);
        res.status(500).json({ error: 'Error al obtener refugios' });
    }
});

// GET /api/refugios/:id
router.get('/:id', autenticarToken, async (req, res) => {
    try {
        const result = await query('SELECT * FROM refugios WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Refugio no encontrado' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener refugio' });
    }
});

// POST /api/refugios
router.post('/', autenticarToken, autorizarRol('admin'), async (req, res) => {
    try {
        const { nombre, direccion, latitud, longitud, capacidad_maxima, encargado, telefono, observaciones } = req.body;
        if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
        const result = await query(
            `INSERT INTO refugios (nombre, direccion, latitud, longitud, capacidad_maxima, encargado, telefono, observaciones)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [nombre, direccion, latitud, longitud, capacidad_maxima || 0, encargado, telefono, observaciones]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando refugio:', error);
        res.status(500).json({ error: 'Error al crear refugio' });
    }
});

// PUT /api/refugios/:id
router.put('/:id', autenticarToken, autorizarRol('admin'), async (req, res) => {
    try {
        const { nombre, direccion, latitud, longitud, capacidad_maxima, ocupacion_actual, encargado, telefono, observaciones, activo } = req.body;
        const result = await query(
            `UPDATE refugios SET
                nombre = COALESCE($1, nombre),
                direccion = COALESCE($2, direccion),
                latitud = COALESCE($3, latitud),
                longitud = COALESCE($4, longitud),
                capacidad_maxima = COALESCE($5, capacidad_maxima),
                ocupacion_actual = COALESCE($6, ocupacion_actual),
                encargado = COALESCE($7, encargado),
                telefono = COALESCE($8, telefono),
                observaciones = COALESCE($9, observaciones),
                activo = COALESCE($10, activo)
             WHERE id = $11 RETURNING *`,
            [nombre, direccion, latitud, longitud, capacidad_maxima, ocupacion_actual, encargado, telefono, observaciones, activo, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Refugio no encontrado' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar refugio' });
    }
});

// DELETE /api/refugios/:id (soft delete)
router.delete('/:id', autenticarToken, autorizarRol('admin'), async (req, res) => {
    try {
        await query('UPDATE refugios SET activo = false WHERE id = $1', [req.params.id]);
        res.json({ mensaje: 'Refugio desactivado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar refugio' });
    }
});

// PATCH /api/refugios/:id/ocupacion - actualizar ocupación
router.patch('/:id/ocupacion', autenticarToken, autorizarRol('admin', 'editor'), async (req, res) => {
    try {
        const { ocupacion_actual } = req.body;
        const result = await query(
            'UPDATE refugios SET ocupacion_actual = $1 WHERE id = $2 RETURNING *',
            [ocupacion_actual, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Refugio no encontrado' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar ocupación' });
    }
});

// GET /api/refugios/:id/familias - Familias alojadas en un refugio
router.get('/:id/familias', autenticarToken, async (req, res) => {
    try {
        const result = await query(`
            SELECT f.*,
                (SELECT COUNT(*) FROM personas p WHERE p.familia_id = f.id AND p.activo = true) as cantidad_integrantes
            FROM familias f
            WHERE f.refugio_id = $1 AND f.activo = true
            ORDER BY f.prioridad NULLS LAST, f.numero_familia
        `, [req.params.id]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo familias del refugio:', error);
        res.status(500).json({ error: 'Error al obtener familias del refugio' });
    }
});

module.exports = router;

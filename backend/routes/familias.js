const express = require('express');
const { query } = require('../config/database');
const { autenticarToken, autorizarRol } = require('../middleware/auth');

const router = express.Router();

// GET /api/familias (sin cambios)
router.get('/', autenticarToken, async (req, res) => {
    try {
        const { refugio_id, estacion_id, estado } = req.query;
        let sql = `
            SELECT f.*, r.nombre as refugio_nombre, e.nombre as estacion_nombre,
                (SELECT COUNT(*) FROM personas p WHERE p.familia_id = f.id AND p.activo = true) as cantidad_integrantes
            FROM familias f
            LEFT JOIN refugios r ON f.refugio_id = r.id
            LEFT JOIN estaciones e ON f.estacion_id = e.id
            WHERE f.activo = true
        `;
        const params = [];
        let c = 1;
        if (refugio_id) { sql += ` AND f.refugio_id = $${c}`; params.push(refugio_id); c++; }
        if (estacion_id) { sql += ` AND f.estacion_id = $${c}`; params.push(estacion_id); c++; }
        if (estado) { sql += ` AND f.estado = $${c}`; params.push(estado); c++; }
        sql += ' ORDER BY f.prioridad NULLS LAST, f.numero_familia';
        const result = await query(sql, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo familias:', error);
        res.status(500).json({ error: 'Error al obtener familias' });
    }
});

// GET /api/familias/:id (sin cambios)
router.get('/:id', autenticarToken, async (req, res) => {
    try {
        const famRes = await query('SELECT * FROM familias WHERE id = $1', [req.params.id]);
        if (famRes.rows.length === 0) return res.status(404).json({ error: 'Familia no encontrada' });
        const personasRes = await query(
            'SELECT * FROM personas WHERE familia_id = $1 AND activo = true ORDER BY edad DESC',
            [req.params.id]
        );
        res.json({ ...famRes.rows[0], personas: personasRes.rows });
    } catch (error) {
        console.error('Error obteniendo familia:', error);
        res.status(500).json({ error: 'Error al obtener familia' });
    }
});

// Función auxiliar para recalcular la ocupación de un refugio
async function recalcularOcupacionRefugio(refugio_id) {
    if (!refugio_id) return;
    await query(`
        UPDATE refugios
        SET ocupacion_actual = (
            SELECT COALESCE(SUM(cantidad_personas), 0)
            FROM familias
            WHERE refugio_id = $1 AND estado = 'EVACUADO' AND activo = true
        )
        WHERE id = $1
    `, [refugio_id]);
}

// POST /api/familias
router.post('/', autenticarToken, autorizarRol('admin', 'editor'), async (req, res) => {
    try {
        const {
            numero_familia, responsable, telefono, ubicacion, latitud, longitud,
            cantidad_personas, prioridad, necesidad, transporte, tipo_transporte,
            animales, detalle_animales, destino, estado, refugio_id, estacion_id, observaciones
        } = req.body;
        const result = await query(
            `INSERT INTO familias (
                numero_familia, responsable, telefono, ubicacion, latitud, longitud,
                cantidad_personas, prioridad, necesidad, transporte, tipo_transporte,
                animales, detalle_animales, destino, estado, refugio_id, estacion_id, observaciones
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
            [
                numero_familia, responsable, telefono, ubicacion, latitud, longitud,
                cantidad_personas || 0, prioridad, necesidad, transporte || false, tipo_transporte,
                animales || false, detalle_animales, destino, estado || 'PENDIENTE',
                refugio_id || null, estacion_id || null, observaciones
            ]
        );

        // Recalcular ocupación si aplica
        if (refugio_id && (estado === 'EVACUADO' || estado === 'ASISTIDO')) {
            await recalcularOcupacionRefugio(refugio_id);
        }

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando familia:', error);
        res.status(500).json({ error: 'Error al crear familia' });
    }
});

// PUT /api/familias/:id
router.put('/:id', autenticarToken, autorizarRol('admin', 'editor'), async (req, res) => {
    try {
        const {
            numero_familia, responsable, telefono, ubicacion, latitud, longitud,
            cantidad_personas, prioridad, necesidad, transporte, tipo_transporte,
            animales, detalle_animales, destino, estado, refugio_id, estacion_id, observaciones, activo
        } = req.body;

        // Guardar refugio anterior para recalcularlo después
        const anteriorRes = await query('SELECT refugio_id FROM familias WHERE id = $1', [req.params.id]);
        const refugioAnterior = anteriorRes.rows[0]?.refugio_id;

        const result = await query(
            `UPDATE familias SET
                numero_familia = COALESCE($1, numero_familia),
                responsable = COALESCE($2, responsable),
                telefono = COALESCE($3, telefono),
                ubicacion = COALESCE($4, ubicacion),
                latitud = COALESCE($5, latitud),
                longitud = COALESCE($6, longitud),
                cantidad_personas = COALESCE($7, cantidad_personas),
                prioridad = COALESCE($8, prioridad),
                necesidad = COALESCE($9, necesidad),
                transporte = COALESCE($10, transporte),
                tipo_transporte = COALESCE($11, tipo_transporte),
                animales = COALESCE($12, animales),
                detalle_animales = COALESCE($13, detalle_animales),
                destino = COALESCE($14, destino),
                estado = COALESCE($15, estado),
                refugio_id = $16,
                estacion_id = $17,
                observaciones = COALESCE($18, observaciones),
                activo = COALESCE($19, activo),
                updated_at = NOW()
             WHERE id = $20 RETURNING *`,
            [
                numero_familia, responsable, telefono, ubicacion, latitud, longitud,
                cantidad_personas, prioridad, necesidad, transporte, tipo_transporte,
                animales, detalle_animales, destino, estado,
                refugio_id, estacion_id, observaciones, activo, req.params.id
            ]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Familia no encontrada' });

        // Recalcular ocupación del refugio anterior (si cambió de refugio)
        if (refugioAnterior && refugioAnterior !== refugio_id) {
            await recalcularOcupacionRefugio(refugioAnterior);
        }
        // Recalcular ocupación del nuevo refugio
        if (refugio_id) {
            await recalcularOcupacionRefugio(refugio_id);
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando familia:', error);
        res.status(500).json({ error: 'Error al actualizar familia' });
    }
});

// DELETE /api/familias/:id (soft delete)
router.delete('/:id', autenticarToken, autorizarRol('admin'), async (req, res) => {
    try {
        const famRes = await query('SELECT refugio_id FROM familias WHERE id = $1', [req.params.id]);
        const refugio_id = famRes.rows[0]?.refugio_id;

        await query('UPDATE familias SET activo = false WHERE id = $1', [req.params.id]);

        if (refugio_id) await recalcularOcupacionRefugio(refugio_id);

        res.json({ mensaje: 'Familia desactivada' });
    } catch (error) {
        console.error('Error eliminando familia:', error);
        res.status(500).json({ error: 'Error al eliminar familia' });
    }
});

module.exports = router;

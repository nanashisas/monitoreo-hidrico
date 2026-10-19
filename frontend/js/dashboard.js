// ==================== VARIABLES GLOBALES ====================
let map;
let marcadores = {};
let estacionesData = [];
let usuarioActual = null;
let refugiosData = [];
let familiasData = [];
let familiaActual = null;

// Capas del mapa
let capasActivas = { estaciones: true, refugios: true, familias: true, alertas: false };
let capaEstaciones = L.layerGroup();
let capaRefugios = L.layerGroup();
let capaFamilias = L.layerGroup();
let capaAlertas = L.layerGroup();
let refugiosMarkers = {};
let familiasMarkers = {};
let alertasMarkers = {};

// ==================== MAPA ====================
function inicializarMapa() {
    if (map) return;
    map = L.map('map').setView(CONFIG.MAPA.centroInicial, CONFIG.MAPA.zoomInicial);
    L.tileLayer(CONFIG.MAPA.tileLayer, {
        attribution: CONFIG.MAPA.atribucion,
        maxZoom: 19
    }).addTo(map);

    capaEstaciones.addTo(map);
    capaRefugios.addTo(map);
    capaFamilias.addTo(map);
}

async function cargarEstaciones() {
    try {
        const estaciones = await api.getEstaciones();
        estacionesData = estaciones;

        capaEstaciones.clearLayers();
        marcadores = {};

        estaciones.forEach(estacion => {
            const color = obtenerColorEstado(estacion);
            const icono = L.icon({
                iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            });
            const marcador = L.marker([estacion.latitud, estacion.longitud], { icon: icono })
                .bindPopup(crearPopup(estacion))
                .bindTooltip(crearTooltip(estacion), {
                    direction: 'top',
                    offset: [0, -30],
                    opacity: 0.9,
                    sticky: true
                });
            capaEstaciones.addLayer(marcador);
            marcadores[estacion.id] = marcador;
        });

        actualizarSelectEstaciones();
        if (typeof cargarEstacionesAdmin === 'function') cargarEstacionesAdmin();
    } catch (error) {
        console.error('Error cargando estaciones:', error);
    }
}

function obtenerColorEstado(estacion) {
    if (estacion.tipo === 'rio') {
        const valor = parseFloat(estacion.ultima_medicion_rio);
        if (isNaN(valor)) return 'grey';
        if (estacion.nivel_critico && valor >= parseFloat(estacion.nivel_critico)) return 'red';
        if (estacion.nivel_alerta && valor >= parseFloat(estacion.nivel_alerta)) return 'yellow';
        return 'green';
    }
    return 'blue';
}

function obtenerTendencia(estacion) {
    if (estacion.tipo !== 'rio') return { flecha: '–', color: 'blue', diferencia: null };
    const ultima = parseFloat(estacion.ultima_medicion_rio);
    const anterior = parseFloat(estacion.medicion_anterior_rio);
    if (isNaN(ultima) || isNaN(anterior) || ultima === anterior) {
        return { flecha: '–', color: 'blue', diferencia: null };
    }
    const diff = ultima - anterior;
    if (diff > 0) return { flecha: '↑', color: 'red', diferencia: diff.toFixed(2) };
    return { flecha: '↓', color: 'green', diferencia: Math.abs(diff).toFixed(2) };
}

function crearTooltip(estacion) {
    let valorMostrar, unidad, tendencia;
    if (estacion.tipo === 'rio') {
        valorMostrar = (estacion.ultima_medicion_rio !== null && estacion.ultima_medicion_rio !== undefined) ? estacion.ultima_medicion_rio : 'Sin datos';
        unidad = 'm';
        tendencia = obtenerTendencia(estacion);
    } else {
        valorMostrar = (estacion.ultima_precipitacion !== null && estacion.ultima_precipitacion !== undefined) ? estacion.ultima_precipitacion : 'Sin datos';
        unidad = 'mm';
        tendencia = { flecha: '–', color: 'blue', diferencia: null };
    }
    const tendenciaTexto = tendencia.diferencia ? `${tendencia.flecha} (${tendencia.diferencia})` : tendencia.flecha;
    return `<div style="font-weight:bold;">${estacion.nombre}</div><div>${tendenciaTexto} &nbsp; ${valorMostrar} ${unidad}</div>`;
}

function crearPopup(estacion) {
    let valorMostrar, fechaMostrar, unidad, tendenciaHTML;
    if (estacion.tipo === 'rio') {
        valorMostrar = (estacion.ultima_medicion_rio !== null && estacion.ultima_medicion_rio !== undefined) ? estacion.ultima_medicion_rio : 'Sin datos';
        fechaMostrar = estacion.fecha_ultima_medicion_rio ? new Date(estacion.fecha_ultima_medicion_rio).toLocaleString() : 'N/A';
        unidad = 'm';
        const tendencia = obtenerTendencia(estacion);
        tendenciaHTML = `<span style="color:${tendencia.color}; font-size:1.2em;">${tendencia.flecha}</span>${tendencia.diferencia ? ` (${tendencia.diferencia})` : ''}`;
    } else {
        valorMostrar = (estacion.ultima_precipitacion !== null && estacion.ultima_precipitacion !== undefined) ? estacion.ultima_precipitacion : 'Sin datos';
        fechaMostrar = estacion.fecha_ultima_precipitacion ? new Date(estacion.fecha_ultima_precipitacion).toLocaleString() : 'N/A';
        unidad = 'mm';
        tendenciaHTML = `<span style="color:blue; font-size:1.2em;">–</span>`;
    }
    const umbralesHTML = estacion.tipo === 'rio' ? `
        ${estacion.nivel_alerta ? `<p><strong>Nivel alerta:</strong> ${estacion.nivel_alerta} m</p>` : ''}
        ${estacion.nivel_critico ? `<p><strong>Nivel crítico:</strong> ${estacion.nivel_critico} m</p>` : ''}
        ${estacion.altura_colapso_defensa ? `<p><strong>Colapso defensa:</strong> ${estacion.altura_colapso_defensa} m</p>` : ''}
    ` : '';

    const gmapsLink = `https://www.google.com/maps?q=${estacion.latitud},${estacion.longitud}`;

    return `
        <div class="popup-estacion">
            <h6>${estacion.nombre}</h6>
            <p><strong>Tipo:</strong> ${estacion.tipo === 'rio' ? 'Río' : 'Pluviométrica'}</p>
            <p><strong>Última medición:</strong> ${valorMostrar} ${unidad} ${tendenciaHTML}</p>
            <p><strong>Fecha:</strong> ${fechaMostrar}</p>
            ${umbralesHTML}
            <a href="${gmapsLink}" target="_blank" class="btn btn-sm btn-outline-primary mt-2">
                <i class="fas fa-map-marked-alt me-1"></i> Ver en Google Maps
            </a>
        </div>
    `;
}

function actualizarSelectEstaciones() {
    const selects = [
        document.getElementById('selectEstacion'),
        document.getElementById('selectEstacionGrafico'),
        document.getElementById('selectEstacionMediciones'),
        document.getElementById('selectEstacionRio'),
        document.getElementById('selectEstacionLluvia'),
        document.getElementById('selectEstacionAlerta'),
        document.getElementById('famEstacion')
    ];
    selects.forEach(select => {
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">Seleccionar...</option>';
        let estacionesFiltradas = estacionesData;
        if (select.id === 'selectEstacionRio') estacionesFiltradas = estacionesData.filter(e => e.tipo === 'rio');
        if (select.id === 'selectEstacionLluvia') estacionesFiltradas = estacionesData.filter(e => e.tipo === 'pluviometrica');
        estacionesFiltradas.forEach(est => {
            const opt = document.createElement('option');
            opt.value = est.id;
            opt.textContent = est.nombre;
            select.appendChild(opt);
        });
        if ([...select.options].some(o => o.value === current)) select.value = current;
        else select.value = '';
    });
}

// ==================== CAPAS DEL MAPA ====================

async function cargarRefugiosEnMapa() {
    try {
        const refugios = await api.getRefugios();
        capaRefugios.clearLayers();
        refugiosMarkers = {};

        refugios.forEach(r => {
            if (!r.latitud || !r.longitud) return;

            const ocupacion = r.porcentaje_ocupacion || 0;
            const color = ocupacion >= 90 ? '#dc3545' : (ocupacion >= 70 ? '#ffc107' : '#28a745');

            const icono = L.divIcon({
                className: 'custom-marker-refugio',
                html: `<div style="background:${color}; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3);"><i class="fas fa-home" style="font-size:14px;"></i></div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 30],
                popupAnchor: [0, -30]
            });

            const marcador = L.marker([r.latitud, r.longitud], { icon: icono })
                .bindPopup(`
                    <div>
                        <h6>${r.nombre}</h6>
                        <p><strong>Dirección:</strong> ${r.direccion || 'N/A'}</p>
                        <p><strong>Capacidad:</strong> ${r.capacidad_maxima}</p>
                        <p><strong>Ocupación:</strong> ${r.ocupacion_actual} (${ocupacion}%)</p>
                        <p><strong>Encargado:</strong> ${r.encargado || 'N/A'}</p>
                        <p><strong>Teléfono:</strong> ${r.telefono || 'N/A'}</p>
                        <div class="d-flex gap-1 mt-2">
                            <a href="https://www.google.com/maps?q=${r.latitud},${r.longitud}" target="_blank" class="btn btn-sm btn-outline-primary">
                                <i class="fas fa-map-marked-alt me-1"></i> Ver en Google Maps
                            </a>
                            ${r.telefono ? `
                                <a href="https://web.whatsapp.com/send/?phone=54${(r.telefono || '').toString().replace(/\D/g, '')}&text&type=phone_number&app_absent=0"
                                   target="_blank"
                                   class="btn btn-sm btn-success">
                                    <i class="fab fa-whatsapp me-1"></i> WhatsApp
                                </a>
                            ` : ''}
                        </div>
                    </div>
                `)
                .bindTooltip(`<b>${r.nombre}</b><br>Ocupación: ${ocupacion}%`, {
                    direction: 'top',
                    offset: [0, -30]
                });
            
            capaRefugios.addLayer(marcador);
            refugiosMarkers[r.id] = marcador;
        });
    } catch (error) {
        console.error('Error cargando refugios en mapa:', error);
    }
}

async function cargarFamiliasEnMapa() {
    try {
        const familias = await api.getFamilias();
        capaFamilias.clearLayers();
        familiasMarkers = {};

        familias.forEach(f => {
            if (!f.latitud || !f.longitud) return;

            const color = f.prioridad === 'ALTA' ? '#dc3545' : (f.prioridad === 'MEDIA' ? '#fd7e14' : '#0d6efd');

            const icono = L.divIcon({
                className: 'custom-marker-familia',
                html: `<div style="background:${color}; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3);"><i class="fas fa-users" style="font-size:12px;"></i></div>`,
                iconSize: [26, 26],
                iconAnchor: [13, 26],
                popupAnchor: [0, -26]
            });

            const marcador = L.marker([f.latitud, f.longitud], { icon: icono })
                .bindPopup(`
                    <div>
                        <h6>Familia ${f.responsable || ''}</h6>
                        <p><strong>N.º:</strong> ${f.numero_familia || 'N/A'}</p>
                        <p><strong>Ubicación:</strong> ${f.ubicacion || 'N/A'}</p>
                        <p><strong>Personas:</strong> ${f.cantidad_integrantes || 0}</p>
                        <p><strong>Prioridad:</strong> ${f.prioridad || 'N/A'}</p>
                        <p><strong>Necesidad:</strong> ${f.necesidad || 'N/A'}</p>
                        <p><strong>Estado:</strong> ${f.estado}</p>
                        <div class="d-flex flex-wrap gap-1 mt-2">
                            <button class="btn btn-sm btn-primary" onclick="verFamilia(${f.id})">
                                <i class="fas fa-users me-1"></i> Ver integrantes
                            </button>
                            <a href="https://www.google.com/maps?q=${f.latitud},${f.longitud}" target="_blank" class="btn btn-sm btn-outline-primary">
                                <i class="fas fa-map-marked-alt me-1"></i> Maps
                            </a>
                            ${f.telefono ? `
                                <a href="https://web.whatsapp.com/send/?phone=54${(f.telefono || '').toString().replace(/\D/g, '')}&text&type=phone_number&app_absent=0"
                                   target="_blank"
                                   class="btn btn-sm btn-success">
                                    <i class="fab fa-whatsapp me-1"></i> WhatsApp
                                </a>
                            ` : ''}
                        </div>
                    </div>
                `)
                .bindTooltip(`<b>${f.responsable}</b><br>Prioridad: ${f.prioridad || 'N/A'} | Personas: ${f.cantidad_integrantes || 0}`, {
                    direction: 'top',
                    offset: [0, -26]
                });
            
            capaFamilias.addLayer(marcador);
            familiasMarkers[f.id] = marcador;
        });
    } catch (error) {
        console.error('Error cargando familias en mapa:', error);
    }
}

async function cargarAlertasEnMapa() {
    try {
        const alertas = await api.getAlertas({ limite: 50 });
        capaAlertas.clearLayers();
        alertasMarkers = {};

        for (const alerta of alertas) {
            const estacion = estacionesData.find(e => e.id === alerta.estacion_id);
            if (!estacion) continue;

            const esCritica = alerta.tipo_alerta === 'CRÍTICO';
            const color = esCritica ? '#dc3545' : '#fd7e14';

            const icono = L.divIcon({
                className: 'custom-marker-alerta',
                html: `<div style="background:${color}; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; border:3px solid white; box-shadow:0 2px 8px rgba(0,0,0,0.4); animation: pulse 2s infinite;"><i class="fas fa-exclamation-triangle" style="font-size:14px;"></i></div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 32],
                popupAnchor: [0, -32]
            });

            const marcador = L.marker([estacion.latitud, estacion.longitud], { icon: icono })
                .bindPopup(`
                    <div>
                        <h6>${esCritica ? '🔴' : '🟠'} Alerta ${alerta.tipo_alerta}</h6>
                        <p><strong>Estación:</strong> ${estacion.nombre}</p>
                        <p><strong>Fecha:</strong> ${new Date(alerta.fecha_generacion || alerta.fecha_envio).toLocaleString()}</p>
                        <p>${alerta.mensaje || ''}</p>
                    </div>
                `)
                .bindTooltip(`<b>${esCritica ? 'CRÍTICO' : 'ALERTA'}</b><br>${estacion.nombre}`, {
                    direction: 'top',
                    offset: [0, -32]
                });

            capaAlertas.addLayer(marcador);
            alertasMarkers[alerta.id] = marcador;
        }
    } catch (error) {
        console.error('Error cargando alertas en mapa:', error);
    }
}

function toggleCapa(nombre) {
    const checkbox = document.getElementById(`capa${nombre.charAt(0).toUpperCase() + nombre.slice(1)}`);
    const activa = checkbox ? checkbox.checked : false;
    capasActivas[nombre] = activa;

    let capa;
    switch (nombre) {
        case 'estaciones': capa = capaEstaciones; break;
        case 'refugios': capa = capaRefugios; break;
        case 'familias': capa = capaFamilias; break;
        case 'alertas': capa = capaAlertas; break;
    }

    if (!capa) return;

    if (activa) {
        if (!map.hasLayer(capa)) capa.addTo(map);
    } else {
        if (map.hasLayer(capa)) map.removeLayer(capa);
    }
}

window.inicializarMapa = inicializarMapa;
window.cargarEstaciones = cargarEstaciones;
window.actualizarSelectEstaciones = actualizarSelectEstaciones;
window.toggleCapa = toggleCapa;

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        if (!api.getToken()) {
            window.location.href = 'login.html';
            return;
        }

        usuarioActual = await api.getUsuarioActual();
        document.getElementById('userName').textContent = usuarioActual.nombre || usuarioActual.username;
        aplicarPermisos(usuarioActual.rol);

        inicializarMapa();
        await cargarEstaciones();
        inicializarGraficos();
        await cargarAlertas();
        await cargarRefugios();
        await cargarFamilias();
        await cargarAsistencias();
        await cargarVehiculos();

        await cargarRefugiosEnMapa();
        await cargarFamiliasEnMapa();
        await cargarAlertasEnMapa();

        inicializarFormularios();
        await cargarEstacionesAdmin();

        document.getElementById('loadingScreen').style.display = 'none';
    } catch (error) {
        console.error('Error inicializando:', error);
        window.location.href = 'login.html';
    }
});

function aplicarPermisos(rol) {
    const esAdmin = rol === 'admin';
    const esEditor = rol === 'editor' || esAdmin;

    if (!esAdmin) {
        ['#estaciones', '#refugios'].forEach(sel => {
            const el = document.querySelector(`[data-bs-target="${sel}"]`);
            if (el) el.style.display = 'none';
        });
    }

    if (!esEditor) {
        ['#mediciones', '#alertas', '#asistencias', '#vehiculos'].forEach(sel => {
            const el = document.querySelector(`[data-bs-target="${sel}"]`);
            if (el) el.style.display = 'none';
        });
    }

    if (!esAdmin) {
        const tabGestion = document.querySelector('[data-bs-target="#gestionMediciones"]');
        if (tabGestion) tabGestion.style.display = 'none';
    }
}

// ==================== FORMULARIOS ====================
function inicializarFormularios() {
    const formMedicion = document.getElementById('formMedicion');
    if (formMedicion) formMedicion.addEventListener('submit', registrarMedicion);

    const formEstacion = document.getElementById('formEstacion');
    if (formEstacion) formEstacion.addEventListener('submit', guardarEstacion);

    const formFamilia = document.getElementById('formFamilia');
    if (formFamilia) formFamilia.addEventListener('submit', guardarFamilia);

    const formRefugio = document.getElementById('formRefugio');
    if (formRefugio) formRefugio.addEventListener('submit', guardarRefugio);

    const formAsistencia = document.getElementById('formAsistencia');
    if (formAsistencia) formAsistencia.addEventListener('submit', guardarAsistencia);

    const formVehiculo = document.getElementById('formVehiculo');
    if (formVehiculo) formVehiculo.addEventListener('submit', guardarVehiculo);

    const formPersonaFamilia = document.getElementById('formPersonaFamilia');
    if (formPersonaFamilia) formPersonaFamilia.addEventListener('submit', guardarPersonaFamilia);
}

// ==================== MEDICIONES ====================
async function registrarMedicion(e) {
    e.preventDefault();
    let btn = null;
    const estacion_id = document.getElementById('selectEstacion').value;
    const tipo_medicion = document.getElementById('selectTipo').value;
    const valor = parseFloat(document.getElementById('inputValor').value);
    const observaciones = document.getElementById('inputObservaciones').value;
    const fecha_hora = document.getElementById('inputFechaHora').value || new Date().toISOString();
    const porcentaje_reservorio = parseFloat(document.getElementById('inputReservorio').value) || null;

    if (!estacion_id || !tipo_medicion || isNaN(valor)) {
        alert('Complete los campos obligatorios');
        return;
    }

    try {
        btn = document.querySelector('#formMedicion button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Registrando...';

        const resultado = await api.registrarMedicion({
            estacion_id, valor, tipo_medicion, observaciones, fecha_hora, porcentaje_reservorio
        });
        let mensaje = '✅ Medición registrada exitosamente';

        if (resultado.alerta_generada && resultado.archivo_base64) {
            const blob = base64ToBlob(
                resultado.archivo_base64,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            const enlace = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = enlace;
            a.download = resultado.archivo_excel || 'alerta.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(enlace);

            const modal = document.getElementById('modalAlerta');
            if (modal) {
                const btnCancelar = document.getElementById('btnCancelarModal');
                const btnDescargar = document.getElementById('btnDescargarModal');
                if (btnCancelar) btnCancelar.onclick = () => { modal.style.display = 'none'; };
                if (btnDescargar) {
                    btnDescargar.onclick = () => {
                        const enlace2 = URL.createObjectURL(blob);
                        const a2 = document.createElement('a');
                        a2.href = enlace2;
                        a2.download = resultado.archivo_excel || 'alerta.xlsx';
                        document.body.appendChild(a2);
                        a2.click();
                        document.body.removeChild(a2);
                        URL.revokeObjectURL(enlace2);
                        modal.style.display = 'none';
                    };
                }
                modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
                modal.style.display = 'flex';
            }

            mensaje += '<br>✅ Excel descargado automáticamente.';
        }

        mostrarMensaje(mensaje, 'success');
        document.getElementById('formMedicion').reset();
        await cargarEstaciones();
        actualizarGraficoRio();
        actualizarGraficoLluvia();
        await cargarAlertas();
    } catch (error) {
        mostrarMensaje('Error: ' + error.message, 'danger');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save me-1"></i> Registrar';
        }
    }
}

async function cargarMediciones() {
    const estacionId = document.getElementById('selectEstacionMediciones').value;
    const filtros = { limite: 100 };
    if (estacionId) filtros.estacion_id = estacionId;

    try {
        const mediciones = await api.getMediciones(filtros);
        const lista = document.getElementById('listaMediciones');
        if (!mediciones.length) {
            lista.innerHTML = '<p class="text-muted">No hay mediciones</p>';
            return;
        }
        lista.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm table-striped">
                    <thead><tr><th>Fecha</th><th>Estación</th><th>Tipo</th><th>Valor</th><th>%Res.</th><th>Obs.</th><th>Acciones</th></tr></thead>
                    <tbody>
                        ${mediciones.map(m => `
                            <tr>
                                <td>${new Date(m.fecha_hora).toLocaleString()}</td>
                                <td>${m.nombre_estacion || 'N/A'}</td>
                                <td>${m.tipo_medicion === 'nivel_rio' ? 'Río' : 'Lluvia'}</td>
                                <td>${m.valor}</td>
                                <td>${m.porcentaje_reservorio || '-'}</td>
                                <td>${m.observaciones || ''}</td>
                                <td>
                                    <button class="btn btn-sm btn-outline-primary" onclick="abrirModalEditar(${m.id})"><i class="fas fa-edit"></i></button>
                                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarMedicion(${m.id})"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error cargando mediciones:', error);
    }
}

async function abrirModalEditar(id) {
    try {
        const medicion = await api.getMedicion(id);
        document.getElementById('editMedicionId').value = medicion.id;
        document.getElementById('editValor').value = medicion.valor;
        document.getElementById('editTipo').value = medicion.tipo_medicion;
        document.getElementById('editReservorio').value = medicion.porcentaje_reservorio || '';
        document.getElementById('editFechaHora').value = medicion.fecha_hora.slice(0, 16);
        document.getElementById('editObservaciones').value = medicion.observaciones || '';
        new bootstrap.Modal(document.getElementById('modalEditarMedicion')).show();
    } catch (error) {
        alert('Error al cargar medición: ' + error.message);
    }
}

async function guardarEdicionMedicion() {
    const id = document.getElementById('editMedicionId').value;
    const data = {
        valor: parseFloat(document.getElementById('editValor').value),
        tipo_medicion: document.getElementById('editTipo').value,
        porcentaje_reservorio: parseFloat(document.getElementById('editReservorio').value) || null,
        fecha_hora: document.getElementById('editFechaHora').value || null,
        observaciones: document.getElementById('editObservaciones').value
    };
    try {
        await api.actualizarMedicion(id, data);
        bootstrap.Modal.getInstance(document.getElementById('modalEditarMedicion')).hide();
        await cargarMediciones();
        await cargarEstaciones();
        actualizarGraficoRio();
        actualizarGraficoLluvia();
    } catch (error) {
        alert('Error al actualizar: ' + error.message);
    }
}

async function eliminarMedicion(id) {
    if (!confirm('¿Eliminar esta medición?')) return;
    try {
        await api.eliminarMedicion(id);
        await cargarMediciones();
        await cargarEstaciones();
        actualizarGraficoRio();
        actualizarGraficoLluvia();
    } catch (error) {
        alert('Error al eliminar: ' + error.message);
    }
}

// ==================== ESTACIONES ====================
function nuevaEstacion() {
    document.getElementById('formEstacion').reset();
    document.getElementById('estId').value = '';
    document.getElementById('formEstacion').style.display = 'block';
}

function cancelarEdicionEstacion() {
    document.getElementById('formEstacion').style.display = 'none';
}

async function guardarEstacion(e) {
    e.preventDefault();
    const id = document.getElementById('estId').value;
    const data = {
        nombre: document.getElementById('estNombre').value,
        latitud: parseFloat(document.getElementById('estLatitud').value),
        longitud: parseFloat(document.getElementById('estLongitud').value),
        tipo: document.getElementById('estTipo').value,
        nivel_alerta: parseFloat(document.getElementById('estNivelAlerta').value) || null,
        nivel_critico: parseFloat(document.getElementById('estNivelCritico').value) || null,
        altura_colapso_defensa: parseFloat(document.getElementById('estAlturaColapso').value) || null,
        descripcion: document.getElementById('estDescripcion').value
    };
    try {
        if (id) await api.actualizarEstacion(id, data);
        else await api.crearEstacion(data);
        cancelarEdicionEstacion();
        await cargarEstaciones();
    } catch (error) {
        alert('Error al guardar estación: ' + error.message);
    }
}

async function cargarEstacionesAdmin() {
    try {
        const estaciones = await api.getEstaciones();
        const lista = document.getElementById('listaEstaciones');
        if (!lista) return;
        if (!estaciones.length) {
            lista.innerHTML = '<p class="text-muted">No hay estaciones</p>';
            return;
        }
        lista.innerHTML = estaciones.map(est => `
            <div class="item-listado d-flex justify-content-between align-items-center">
                <div><strong>${est.nombre}</strong> (${est.tipo})<br>
                    <small>Alerta: ${est.nivel_alerta || 'N/A'} | Crítico: ${est.nivel_critico || 'N/A'} | Colapso defensa: ${est.altura_colapso_defensa || 'N/A'} m</small>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-primary" onclick="editarEstacion(${est.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarEstacion(${est.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error cargando estaciones admin:', error);
    }
}

async function editarEstacion(id) {
    const estaciones = await api.getEstaciones();
    const est = estaciones.find(e => e.id == id);
    if (!est) return;
    document.getElementById('estId').value = est.id;
    document.getElementById('estNombre').value = est.nombre;
    document.getElementById('estLatitud').value = est.latitud;
    document.getElementById('estLongitud').value = est.longitud;
    document.getElementById('estTipo').value = est.tipo;
    document.getElementById('estNivelAlerta').value = est.nivel_alerta || '';
    document.getElementById('estNivelCritico').value = est.nivel_critico || '';
    document.getElementById('estAlturaColapso').value = est.altura_colapso_defensa || '';
    document.getElementById('estDescripcion').value = est.descripcion || '';
    document.getElementById('formEstacion').style.display = 'block';
}

async function eliminarEstacion(id) {
    if (!confirm('¿Eliminar esta estación?')) return;
    try {
        await api.eliminarEstacion(id);
        await cargarEstaciones();
        await cargarEstacionesAdmin();
    } catch (error) {
        alert('Error al eliminar: ' + error.message);
    }
}

// ==================== FAMILIAS ====================
async function cargarFamilias() {
    try {
        const estado = document.getElementById('filtroEstadoFamilia')?.value;
        const prioridad = document.getElementById('filtroPrioridadFamilia')?.value;
        const filtros = {};
        if (estado) filtros.estado = estado;

        familiasData = await api.getFamilias(filtros);
        if (prioridad) familiasData = familiasData.filter(f => f.prioridad === prioridad);

        const selAsi = document.getElementById('selectFamiliaAsistencia');
        if (selAsi) {
            const current = selAsi.value;
            selAsi.innerHTML = '<option value="">Todas las familias</option>';
            familiasData.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = `${f.numero_familia || ''} ${f.responsable || ''}`;
                selAsi.appendChild(opt);
            });
            if ([...selAsi.options].some(o => o.value === current)) selAsi.value = current;
        }

        const lista = document.getElementById('listaFamilias');
        if (lista) {
            if (!familiasData.length) {
                lista.innerHTML = '<p class="text-muted">No hay familias registradas</p>';
            } else {
                lista.innerHTML = `
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead>
                                <tr>
                                    <th>N.º / Resp.</th>
                                    <th>Ubicación</th>
                                    <th>Pers.</th>
                                    <th>Prioridad</th>
                                    <th>Transporte</th>
                                    <th>Animales</th>
                                    <th>Destino</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${familiasData.map(f => `
                                    <tr>
                                        <td><strong>${f.numero_familia || '-'}</strong><br><small>${f.responsable || ''}</small></td>
                                        <td>${f.ubicacion || '-'}</td>
                                        <td>${f.cantidad_integrantes || 0}</td>
                                        <td>
                                            <span class="badge ${f.prioridad === 'ALTA' ? 'bg-danger' : (f.prioridad === 'MEDIA' ? 'bg-warning' : 'bg-secondary')}">${f.prioridad || '-'}</span><br>
                                            <small>${f.necesidad || ''}</small>
                                        </td>
                                        <td>${f.transporte ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-muted"></i>'}${f.tipo_transporte ? `<br><small>${f.tipo_transporte}</small>` : ''}</td>
                                        <td>${f.animales ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-muted"></i>'}${f.detalle_animales ? `<br><small>${f.detalle_animales}</small>` : ''}</td>
                                        <td>${f.destino || '-'}</td>
                                        <td><span class="badge ${f.estado === 'CERRADO' ? 'bg-success' : (f.estado === 'EVACUADO' ? 'bg-info' : (f.estado === 'ASISTIDO' ? 'bg-primary' : 'bg-secondary'))}">${f.estado || 'PENDIENTE'}</span></td>
                                        <td>
                                            <button class="btn btn-sm btn-outline-info" onclick="verFamilia(${f.id})" title="Ver integrantes"><i class="fas fa-users"></i></button>
                                            <button class="btn btn-sm btn-outline-primary" onclick="editarFamilia(${f.id})"><i class="fas fa-edit"></i></button>
                                            <button class="btn btn-sm btn-outline-danger" onclick="eliminarFamilia(${f.id})"><i class="fas fa-trash"></i></button>
                                        </td>
                                        <td>
                                            <strong>${f.numero_familia || '-'}</strong><br>
                                            <small>${f.responsable || ''}</small><br>
                                            ${f.telefono ? `
                                                <a href="https://web.whatsapp.com/send/?phone=54${(f.telefono || '').toString().replace(/\D/g, '')}&text&type=phone_number&app_absent=0" 
                                                    target="_blank" 
                                                    class="btn btn-sm btn-outline-success mt-1" 
                                                    title="Enviar WhatsApp a ${f.responsable}">
                                                        <i class="fab fa-whatsapp"></i> ${f.telefono}
                                            </a>
                                            ` : '<small class="text-muted">Sin teléfono</small>'}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
        }

        await cargarFamiliasEnMapa();
    } catch (error) {
        console.error('Error cargando familias:', error);
    }
}

function nuevaFamilia() {
    document.getElementById('formFamilia').reset();
    document.getElementById('famId').value = '';
    document.getElementById('formFamilia').style.display = 'block';
    cargarSelectRefugios('famRefugio');
    actualizarSelectEstaciones();
}

function cancelarEdicionFamilia() {
    document.getElementById('formFamilia').style.display = 'none';
}

async function guardarFamilia(e) {
    e.preventDefault();
    const id = document.getElementById('famId').value;
    const data = {
        numero_familia: document.getElementById('famNumero').value,
        responsable: document.getElementById('famResponsable').value,
        telefono: document.getElementById('famTelefono').value,
        ubicacion: document.getElementById('famUbicacion').value,
        latitud: parseFloat(document.getElementById('famLatitud').value) || null,
        longitud: parseFloat(document.getElementById('famLongitud').value) || null,
        cantidad_personas: parseInt(document.getElementById('famCantidad').value) || 0,
        prioridad: document.getElementById('famPrioridad').value || null,
        necesidad: document.getElementById('famNecesidad').value,
        transporte: document.getElementById('famTransporte').checked,
        tipo_transporte: document.getElementById('famTipoTransporte').value,
        animales: document.getElementById('famAnimales').checked,
        detalle_animales: document.getElementById('famDetalleAnimales').value,
        destino: document.getElementById('famDestino').value,
        estado: document.getElementById('famEstado').value,
        refugio_id: document.getElementById('famRefugio').value || null,
        estacion_id: document.getElementById('famEstacion').value || null,
        observaciones: document.getElementById('famObservaciones').value
    };
    try {
        if (id) await api.actualizarFamilia(id, data);
        else await api.crearFamilia(data);
        cancelarEdicionFamilia();
        await cargarFamilias();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function editarFamilia(id) {
    await cargarSelectRefugios('famRefugio');
    const f = familiasData.find(x => x.id == id);
    if (!f) return;
    document.getElementById('famId').value = f.id;
    document.getElementById('famNumero').value = f.numero_familia || '';
    document.getElementById('famResponsable').value = f.responsable || '';
    document.getElementById('famTelefono').value = f.telefono || '';
    document.getElementById('famUbicacion').value = f.ubicacion || '';
    document.getElementById('famLatitud').value = f.latitud || '';
    document.getElementById('famLongitud').value = f.longitud || '';
    document.getElementById('famCantidad').value = f.cantidad_personas || '';
    document.getElementById('famPrioridad').value = f.prioridad || '';
    document.getElementById('famNecesidad').value = f.necesidad || '';
    document.getElementById('famTransporte').checked = f.transporte || false;
    document.getElementById('famTipoTransporte').value = f.tipo_transporte || '';
    document.getElementById('famAnimales').checked = f.animales || false;
    document.getElementById('famDetalleAnimales').value = f.detalle_animales || '';
    document.getElementById('famDestino').value = f.destino || '';
    document.getElementById('famEstado').value = f.estado || 'PENDIENTE';
    document.getElementById('famRefugio').value = f.refugio_id || '';
    document.getElementById('famEstacion').value = f.estacion_id || '';
    document.getElementById('famObservaciones').value = f.observaciones || '';
    document.getElementById('formFamilia').style.display = 'block';
}

async function eliminarFamilia(id) {
    if (!confirm('¿Desactivar esta familia?')) return;
    try {
        await api.eliminarFamilia(id);
        await cargarFamilias();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function verFamilia(id) {
    try {
        const data = await api.getFamilia(id);
        familiaActual = data;

        const modalEl = document.getElementById('modalFamilia');
        if (modalEl) {
            document.getElementById('modalFamTitulo').textContent = `Familia ${data.responsable || ''}`;
            document.getElementById('modalFamInfo').innerHTML = `
                <p><strong>Ubicación:</strong> ${data.ubicacion || '-'}</p>
                <p><strong>Estado:</strong> ${data.estado}</p>
                <p><strong>Prioridad:</strong> ${data.prioridad || '-'}</p>
                <p><strong>Necesidad:</strong> ${data.necesidad || '-'}</p>
            `;
            const lista = document.getElementById('modalFamIntegrantes');
            if (!data.personas || !data.personas.length) {
                lista.innerHTML = '<p class="text-muted">Sin integrantes cargados</p>';
            } else {
                lista.innerHTML = data.personas.map(p => `
                    <div class="item-listado mb-2">
                        <strong>${p.nombre} ${p.apellido}</strong> (${p.parentesco || 'sin parentesco'})<br>
                        <small>Edad: ${p.edad || 'N/A'} | DNI: ${p.dni || 'N/A'}</small><br>
                        <small>Trabajo: ${p.trabajo || 'N/A'}</small><br>
                        <small>Salud: ${p.problemas_salud || 'Sin datos'}</small>
                        <button class="btn btn-sm btn-outline-danger mt-1" onclick="eliminarPersona(${p.id}, ${id})"><i class="fas fa-trash"></i></button>
                    </div>
                `).join('');
            }
            const formPer = document.getElementById('formPersonaFamilia');
            if (formPer) {
                formPer.reset();
                document.getElementById('perFamiliaId').value = id;
            }
            new bootstrap.Modal(modalEl).show();
        } else {
            let html = `Familia ${data.responsable || ''}\nUbicación: ${data.ubicacion || '-'}\n\nIntegrantes:\n`;
            if (!data.personas || !data.personas.length) {
                html += 'Sin integrantes cargados\n';
            } else {
                data.personas.forEach(p => {
                    html += `- ${p.nombre} ${p.apellido} (${p.parentesco || ''}) | Edad: ${p.edad || 'N/A'} | Trabajo: ${p.trabajo || 'N/A'} | Salud: ${p.problemas_salud || 'Sin datos'}\n`;
                });
            }
            alert(html);
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function guardarPersonaFamilia(e) {
    e.preventDefault();
    const familiaId = document.getElementById('perFamiliaId').value;
    const data = {
        familia_id: familiaId,
        nombre: document.getElementById('perNombre').value,
        apellido: document.getElementById('perApellido').value,
        dni: document.getElementById('perDni').value,
        edad: parseInt(document.getElementById('perEdad').value) || null,
        parentesco: document.getElementById('perParentesco').value,
        trabajo: document.getElementById('perTrabajo').value,
        problemas_salud: document.getElementById('perSalud').value,
        discapacidad: document.getElementById('perDiscapacidad').checked
    };
    try {
        await api.crearPersona(data);
        await verFamilia(familiaId);
        await cargarFamilias();
    } catch (error) {
        alert('Error al guardar integrante: ' + error.message);
    }
}

async function eliminarPersona(id, familiaId) {
    if (!confirm('¿Eliminar este integrante?')) return;
    try {
        await api.eliminarPersona(id);
        await verFamilia(familiaId);
        await cargarFamilias();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// ==================== REFUGIOS ====================
async function cargarRefugios() {
    try {
        refugiosData = await api.getRefugios();
        const lista = document.getElementById('listaRefugios');
        if (lista) {
            if (!refugiosData.length) {
                lista.innerHTML = '<p class="text-muted">No hay refugios</p>';
            } else {
                lista.innerHTML = refugiosData.map(r => `
                    <div class="item-listado">
                        <div class="d-flex justify-content-between">
                            <div>
                                <strong>${r.nombre}</strong><br>
                                <small>Capacidad: ${r.capacidad_maxima} | Ocupación: ${r.ocupacion_actual} (${r.porcentaje_ocupacion}%)</small><br>
                                <div class="progress" style="height:8px; margin-top:5px;">
                                    <div class="progress-bar ${r.porcentaje_ocupacion >= 90 ? 'bg-danger' : (r.porcentaje_ocupacion >= 70 ? 'bg-warning' : 'bg-success')}"
                                         style="width: ${r.porcentaje_ocupacion}%"></div>
                                </div>
                                <small>
                                    Encargado: ${r.encargado || '-'} | 
                                    ${r.telefono ? `
                                        <a href="https://web.whatsapp.com/send/?phone=54${(r.telefono || '').toString().replace(/\D/g, '')}&text&type=phone_number&app_absent=0" 
                                           target="_blank" 
                                           class="btn btn-sm btn-outline-success py-0 px-1 mt-1" 
                                           title="Enviar WhatsApp al encargado">
                                            <i class="fab fa-whatsapp"></i> ${r.telefono}
                                        </a>
                                    ` : 'Sin teléfono'}
                                </small>
                            </div>
                            <div>
                                <button class="btn btn-sm btn-outline-info" onclick="verFamiliasRefugio(${r.id})" title="Ver familias alojadas">
                                    <i class="fas fa-users"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-primary" onclick="editarRefugio(${r.id})" title="Editar">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="eliminarRefugio(${r.id})" title="Eliminar">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        }
        const selects = ['selectRefugioNucleo', 'famRefugio'];
        selects.forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const current = sel.value;
            sel.innerHTML = id === 'selectRefugioNucleo' ? '<option value="">Todos los refugios</option>' : '<option value="">Sin refugio</option>';
            refugiosData.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id;
                opt.textContent = r.nombre;
                sel.appendChild(opt);
            });
            if ([...sel.options].some(o => o.value === current)) sel.value = current;
        });

        // Refrescar capa del mapa
        await cargarRefugiosEnMapa();
    } catch (error) {
        console.error('Error cargando refugios:', error);
    }
}
async function cargarSelectRefugios(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    if (!refugiosData.length) refugiosData = await api.getRefugios();
    sel.innerHTML = '<option value="">Sin refugio</option>';
    refugiosData.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.nombre;
        sel.appendChild(opt);
    });
}

function nuevoRefugio() {
    document.getElementById('formRefugio').reset();
    document.getElementById('refId').value = '';
    document.getElementById('formRefugio').style.display = 'block';
}

function cancelarEdicionRefugio() {
    document.getElementById('formRefugio').style.display = 'none';
}

async function guardarRefugio(e) {
    e.preventDefault();
    const id = document.getElementById('refId').value;
    const data = {
        nombre: document.getElementById('refNombre').value,
        direccion: document.getElementById('refDireccion').value,
        latitud: parseFloat(document.getElementById('refLatitud').value) || null,
        longitud: parseFloat(document.getElementById('refLongitud').value) || null,
        capacidad_maxima: parseInt(document.getElementById('refCapacidad').value) || 0,
        ocupacion_actual: parseInt(document.getElementById('refOcupacion').value) || 0,
        encargado: document.getElementById('refEncargado').value,
        telefono: document.getElementById('refTelefono').value,
        observaciones: document.getElementById('refObservaciones').value
    };
    try {
        if (id) await api.actualizarRefugio(id, data);
        else await api.crearRefugio(data);
        cancelarEdicionRefugio();
        await cargarRefugios();
    } catch (error) {
        alert('Error al guardar refugio: ' + error.message);
    }
}

async function editarRefugio(id) {
    const r = refugiosData.find(x => x.id == id);
    if (!r) return;
    document.getElementById('refId').value = r.id;
    document.getElementById('refNombre').value = r.nombre;
    document.getElementById('refDireccion').value = r.direccion || '';
    document.getElementById('refLatitud').value = r.latitud || '';
    document.getElementById('refLongitud').value = r.longitud || '';
    document.getElementById('refCapacidad').value = r.capacidad_maxima || '';
    document.getElementById('refOcupacion').value = r.ocupacion_actual || '';
    document.getElementById('refEncargado').value = r.encargado || '';
    document.getElementById('refTelefono').value = r.telefono || '';
    document.getElementById('refObservaciones').value = r.observaciones || '';
    document.getElementById('formRefugio').style.display = 'block';
}

async function eliminarRefugio(id) {
    if (!confirm('¿Desactivar este refugio?')) return;
    try {
        await api.eliminarRefugio(id);
        await cargarRefugios();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}
async function verFamiliasRefugio(refugioId) {
    try {
        const familias = await api.getFamiliasPorRefugio(refugioId);
        const refugio = refugiosData.find(r => r.id == refugioId);
        const lista = document.getElementById('refugioDetalle');

        if (!familias.length) {
            lista.innerHTML = '<p class="text-muted">No hay familias alojadas en este refugio</p>';
        } else {
            lista.innerHTML = `
                <h6>Familias en ${refugio?.nombre || 'Refugio'}</h6>
                <div class="table-responsive">
                    <table class="table table-sm table-striped">
                        <thead>
                            <tr>
                                <th>N.º</th>
                                <th>Responsable</th>
                                <th>Teléfono</th>
                                <th>Personas</th>
                                <th>Prioridad</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${familias.map(f => `
                                <tr>
                                    <td>${f.numero_familia || '-'}</td>
                                    <td>${f.responsable || '-'}</td>
                                    <td>${f.telefono || '-'}</td>
                                    <td>${f.cantidad_integrantes || 0}</td>
                                    <td><span class="badge ${f.prioridad === 'ALTA' ? 'bg-danger' : (f.prioridad === 'MEDIA' ? 'bg-warning' : 'bg-secondary')}">${f.prioridad || '-'}</span></td>
                                    <td><span class="badge ${f.estado === 'CERRADO' ? 'bg-success' : (f.estado === 'EVACUADO' ? 'bg-info' : 'bg-secondary')}">${f.estado}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        // Mostrar el modal
        const modal = new bootstrap.Modal(document.getElementById('modalFamiliasRefugio'));
        modal.show();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function verFamiliasRefugio(refugioId) {
    try {
        const familias = await api.getFamiliasPorRefugio(refugioId);
        const refugio = refugiosData.find(r => r.id == refugioId);
        const lista = document.getElementById('refugioDetalle');

        if (!familias.length) {
            lista.innerHTML = '<p class="text-muted">No hay familias alojadas en este refugio</p>';
        } else {
            lista.innerHTML = `
                <h6 class="mb-3">Familias en ${refugio?.nombre || 'Refugio'}</h6>
                <div class="table-responsive">
                    <table class="table table-sm table-striped">
                        <thead>
                            <tr>
                                <th>N.º</th>
                                <th>Responsable</th>
                                <th>Teléfono</th>
                                <th>Personas</th>
                                <th>Prioridad</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${familias.map(f => `
                                <tr>
                                    <td>${f.numero_familia || '-'}</td>
                                    <td>${f.responsable || '-'}</td>
                                    <td>${f.telefono || '-'}</td>
                                    <td>${f.cantidad_integrantes || 0}</td>
                                    <td>
                                        <span class="badge ${f.prioridad === 'ALTA' ? 'bg-danger' : (f.prioridad === 'MEDIA' ? 'bg-warning' : 'bg-secondary')}">
                                            ${f.prioridad || '-'}
                                        </span>
                                    </td>
                                    <td>
                                        <span class="badge ${f.estado === 'CERRADO' ? 'bg-success' : (f.estado === 'EVACUADO' ? 'bg-info' : (f.estado === 'ASISTIDO' ? 'bg-primary' : 'bg-secondary'))}">
                                            ${f.estado || 'PENDIENTE'}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <p class="mt-2"><strong>Total de personas alojadas:</strong> ${familias.reduce((sum, f) => sum + (f.cantidad_integrantes || 0), 0)}</p>
            `;
        }
        const modal = new bootstrap.Modal(document.getElementById('modalFamiliasRefugio'));
        modal.show();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

window.verFamiliasRefugio = verFamiliasRefugio;

// ==================== ASISTENCIAS ====================
async function cargarAsistencias() {
    try {
        const filtros = {};
        const selFam = document.getElementById('selectFamiliaAsistencia');
        if (selFam && selFam.value) filtros.nucleo_id = selFam.value;

        const asistencias = await api.getAsistencias(filtros);
        const lista = document.getElementById('listaAsistencias');
        if (!lista) return;
        if (!asistencias.length) {
            lista.innerHTML = '<p class="text-muted">No hay asistencias</p>';
            return;
        }
        lista.innerHTML = asistencias.map(a => `
            <div class="item-listado">
                <div class="d-flex justify-content-between">
                    <div>
                        <strong>${a.nucleo_apellido || 'N/A'}</strong> - <span class="badge bg-info">${a.tipo}</span><br>
                        <small>${new Date(a.fecha).toLocaleString()}</small><br>
                        <small>${a.descripcion || ''}</small>
                    </div>
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarAsistencia(${a.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error cargando asistencias:', error);
    }
}

function nuevaAsistencia() {
    document.getElementById('formAsistencia').reset();
    document.getElementById('formAsistencia').style.display = 'block';
    const sel = document.getElementById('asiFamilia');
    sel.innerHTML = '<option value="">Seleccionar familia...</option>';
    familiasData.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = `${f.numero_familia || ''} ${f.responsable || ''}`;
        sel.appendChild(opt);
    });
}

function cancelarEdicionAsistencia() {
    document.getElementById('formAsistencia').style.display = 'none';
}

async function guardarAsistencia(e) {
    e.preventDefault();
    const data = {
        nucleo_id: document.getElementById('asiFamilia').value,
        tipo: document.getElementById('asiTipo').value,
        descripcion: document.getElementById('asiDescripcion').value
    };
    try {
        await api.crearAsistencia(data);
        cancelarEdicionAsistencia();
        await cargarAsistencias();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function eliminarAsistencia(id) {
    if (!confirm('¿Eliminar esta asistencia?')) return;
    try {
        await api.eliminarAsistencia(id);
        await cargarAsistencias();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// ==================== VEHÍCULOS ====================
async function cargarVehiculos() {
    try {
        const desde = document.getElementById('vehFiltroDesde')?.value;
        const hasta = document.getElementById('vehFiltroHasta')?.value;
        const filtros = {};
        if (desde) filtros.desde = desde;
        if (hasta) filtros.hasta = hasta;

        const resumen = await api.getResumenVehiculos(filtros);
        const divResumen = document.getElementById('resumenVehiculos');
        if (divResumen) {
            if (!resumen.length) {
                divResumen.innerHTML = '<p class="text-muted">Sin datos</p>';
            } else {
                divResumen.innerHTML = `
                    <table class="table table-sm table-striped">
                        <thead><tr><th>Fecha</th><th>Entidad</th><th>Total vehículos</th></tr></thead>
                        <tbody>
                            ${resumen.map(r => `
                                <tr>
                                    <td>${new Date(r.fecha).toLocaleDateString()}</td>
                                    <td>${r.entidad}</td>
                                    <td>${r.total_vehiculos}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            }
        }

        const vehiculos = await api.getVehiculos(filtros);
        const lista = document.getElementById('listaVehiculos');
        if (lista) {
            if (!vehiculos.length) {
                lista.innerHTML = '<p class="text-muted">Sin registros</p>';
            } else {
                lista.innerHTML = vehiculos.map(v => `
                    <div class="item-listado">
                        <div class="d-flex justify-content-between">
                            <div>
                                <strong>${v.entidad}</strong> - ${v.tipo_vehiculo || 'N/A'} (${v.cantidad})<br>
                                <small>${new Date(v.fecha).toLocaleDateString()} | ${v.descripcion || ''}</small>
                            </div>
                            <button class="btn btn-sm btn-outline-danger" onclick="eliminarVehiculo(${v.id})"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Error cargando vehículos:', error);
    }
}

function nuevoVehiculo() {
    document.getElementById('formVehiculo').reset();
    document.getElementById('vehFecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('formVehiculo').style.display = 'block';
}

function cancelarEdicionVehiculo() {
    document.getElementById('formVehiculo').style.display = 'none';
}

async function guardarVehiculo(e) {
    e.preventDefault();
    const data = {
        entidad: document.getElementById('vehEntidad').value,
        tipo_vehiculo: document.getElementById('vehTipo').value,
        cantidad: parseInt(document.getElementById('vehCantidad').value) || 1,
        fecha: document.getElementById('vehFecha').value || null,
        descripcion: document.getElementById('vehDescripcion').value
    };
    try {
        await api.crearVehiculo(data);
        cancelarEdicionVehiculo();
        await cargarVehiculos();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function eliminarVehiculo(id) {
    if (!confirm('¿Eliminar registro?')) return;
    try {
        await api.eliminarVehiculo(id);
        await cargarVehiculos();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// ==================== ALERTAS ====================
async function cargarAlertas() {
    try {
        const alertas = await api.getAlertas({ limite: 10 });
        const lista = document.getElementById('listaAlertas');
        if (!alertas.length) {
            lista.innerHTML = '<p class="text-muted">No hay alertas registradas</p>';
        } else {
            lista.innerHTML = alertas.map(alerta => `
                <div class="list-group-item alerta-item ${alerta.tipo_alerta === 'CRÍTICO' ? 'alerta-critica' : ''}">
                    <div class="d-flex justify-content-between">
                        <strong>${alerta.nombre_estacion || 'Estación ' + alerta.estacion_id}</strong>
                        <span class="badge ${alerta.tipo_alerta === 'CRÍTICO' ? 'bg-danger' : 'bg-warning'}">${alerta.tipo_alerta}</span>
                    </div>
                    <small>${new Date(alerta.fecha_generacion || alerta.fecha_envio).toLocaleString()}</small>
                    <p class="mb-0">${alerta.mensaje || ''}</p>
                    ${usuarioActual && usuarioActual.rol === 'admin' ? `<button class="btn btn-sm btn-outline-danger mt-1" onclick="eliminarAlerta(${alerta.id})"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            `).join('');
        }

        await cargarAlertasEnMapa();
    } catch (error) {
        console.error('Error cargando alertas:', error);
    }
}

async function generarAlertaManual() {
    const estacion_id = document.getElementById('selectEstacionAlerta').value;
    const tipo_alerta = document.getElementById('selectTipoAlertaManual').value;
    const mensaje = document.getElementById('mensajeAlertaManual').value;
    if (!estacion_id) { alert('Seleccione una estación'); return; }

    try {
        const { blob, filename } = await api.generarAlertaManual({ estacion_id, tipo_alerta, mensaje });
        const enlace = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = enlace;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(enlace);

        alert('✅ Alerta generada y Excel descargado');
        await cargarAlertas();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function eliminarAlerta(id) {
    if (!confirm('¿Eliminar esta alerta?')) return;
    try {
        await api.eliminarAlerta(id);
        await cargarAlertas();
    } catch (error) {
        alert('Error al eliminar alerta: ' + error.message);
    }
}

// ==================== UTILIDADES ====================
function mostrarMensaje(mensaje, tipo) {
    const div = document.getElementById('mensajeRegistro');
    div.innerHTML = `<div class="alert alert-${tipo} alert-dismissible fade show" role="alert">
        ${mensaje}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>`;
    setTimeout(() => div.innerHTML = '', 5000);
}

function base64ToBlob(base64, contentType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
}

document.addEventListener('shown.bs.tab', (e) => {
    const target = e.target.getAttribute('data-bs-target');
    if (target === '#gestionMediciones') cargarMediciones();
    if (target === '#estaciones') cargarEstacionesAdmin();
    if (target === '#familias') cargarFamilias();
    if (target === '#refugios') cargarRefugios();
    if (target === '#asistencias') cargarAsistencias();
    if (target === '#vehiculos') cargarVehiculos();
});

// Exponer funciones globalmente
window.cargarFamilias = cargarFamilias;
window.nuevaFamilia = nuevaFamilia;
window.cancelarEdicionFamilia = cancelarEdicionFamilia;
window.guardarFamilia = guardarFamilia;
window.editarFamilia = editarFamilia;
window.eliminarFamilia = eliminarFamilia;
window.verFamilia = verFamilia;
window.guardarPersonaFamilia = guardarPersonaFamilia;
window.eliminarPersona = eliminarPersona;
window.nuevaAsistencia = nuevaAsistencia;
window.cancelarEdicionAsistencia = cancelarEdicionAsistencia;
window.guardarAsistencia = guardarAsistencia;
window.eliminarAsistencia = eliminarAsistencia;
window.nuevoVehiculo = nuevoVehiculo;
window.cancelarEdicionVehiculo = cancelarEdicionVehiculo;
window.guardarVehiculo = guardarVehiculo;
window.eliminarVehiculo = eliminarVehiculo;
window.eliminarAlerta = eliminarAlerta;
window.generarAlertaManual = generarAlertaManual;
window.nuevaEstacion = nuevaEstacion;
window.cancelarEdicionEstacion = cancelarEdicionEstacion;
window.guardarEstacion = guardarEstacion;
window.editarEstacion = editarEstacion;
window.eliminarEstacion = eliminarEstacion;
window.abrirModalEditar = abrirModalEditar;
window.guardarEdicionMedicion = guardarEdicionMedicion;
window.eliminarMedicion = eliminarMedicion;
window.nuevoRefugio = nuevoRefugio;
window.cancelarEdicionRefugio = cancelarEdicionRefugio;
window.guardarRefugio = guardarRefugio;
window.editarRefugio = editarRefugio;
window.eliminarRefugio = eliminarRefugio;

class API {
    constructor() {
        this.baseURL = CONFIG.API_URL;
        this.token = localStorage.getItem('token');
    }

    setToken(token) { this.token = token; localStorage.setItem('token', token); }
    getToken() { return this.token || localStorage.getItem('token'); }
    clearToken() { this.token = null; localStorage.removeItem('token'); }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };
        try {
            const response = await fetch(url, { ...options, headers });
            if (response.status === 401 && !endpoint.includes('/auth/login')) {
                this.clearToken();
                window.location.href = 'login.html';
                throw new Error('Sesión expirada');
            }
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Error en la solicitud');
            }
            return await response.json();
        } catch (error) {
            console.error(`Error en ${endpoint}:`, error);
            throw error;
        }
    }

    // Autenticación
    async login(username, password) {
        const response = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        if (response.token) this.setToken(response.token);
        return response;
    }
    async logout() { this.clearToken(); }
    async getUsuarioActual() { return await this.request('/auth/me'); }

    // Estaciones
    async getEstaciones() { return await this.request('/estaciones'); }
    async crearEstacion(data) { return await this.request('/estaciones', { method: 'POST', body: JSON.stringify(data) }); }
    async actualizarEstacion(id, data) { return await this.request(`/estaciones/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    async eliminarEstacion(id) { return await this.request(`/estaciones/${id}`, { method: 'DELETE' }); }

    // Familias
    async getFamilias(filtros = {}) {
        const params = new URLSearchParams(filtros).toString();
        return await this.request(`/familias?${params}`);
    }
    async getFamilia(id) { return await this.request(`/familias/${id}`); }
    async crearFamilia(data) { return await this.request('/familias', { method: 'POST', body: JSON.stringify(data) }); }
    async actualizarFamilia(id, data) { return await this.request(`/familias/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    async eliminarFamilia(id) { return await this.request(`/familias/${id}`, { method: 'DELETE' }); }
    async getFamiliasPorRefugio(refugioId) {
    return await this.request(`/refugios/${refugioId}/familias`);
    }
    
    // Personas
    async getPersonas(familiaId = null) {
        const endpoint = familiaId ? `/personas?familia_id=${familiaId}` : '/personas';
        return await this.request(endpoint);
    }
    async crearPersona(data) { return await this.request('/personas', { method: 'POST', body: JSON.stringify(data) }); }
    async actualizarPersona(id, data) { return await this.request(`/personas/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    async eliminarPersona(id) { return await this.request(`/personas/${id}`, { method: 'DELETE' }); }

    // Mediciones
    async getMediciones(filtros = {}) {
        const params = new URLSearchParams(filtros).toString();
        return await this.request(`/mediciones?${params}`);
    }
    async getMedicion(id) { return await this.request(`/mediciones/${id}`); }
    async registrarMedicion(data) { return await this.request('/mediciones', { method: 'POST', body: JSON.stringify(data) }); }
    async actualizarMedicion(id, data) { return await this.request(`/mediciones/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    async eliminarMedicion(id) { return await this.request(`/mediciones/${id}`, { method: 'DELETE' }); }

    // Alertas
    async getAlertas(filtros = {}) {
        const params = new URLSearchParams(filtros).toString();
        return await this.request(`/alertas?${params}`);
    }

    // Alerta manual: recibe blob (Excel)
    async generarAlertaManual(data) {
        const url = `${this.baseURL}/alertas/generar`;
        const token = this.getToken();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Error al generar alerta');
        }

        const blob = await response.blob();
        const contentDisposition = response.headers.get('Content-Disposition') || '';
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        const filename = filenameMatch ? filenameMatch[1] : 'alerta.xlsx';
        return { blob, filename };
    }

    async eliminarAlerta(id) { return await this.request(`/alertas/${id}`, { method: 'DELETE' }); }

    // Refugios
    async getRefugios() { return await this.request('/refugios'); }
    async crearRefugio(data) { return await this.request('/refugios', { method: 'POST', body: JSON.stringify(data) }); }
    async actualizarRefugio(id, data) { return await this.request(`/refugios/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    async eliminarRefugio(id) { return await this.request(`/refugios/${id}`, { method: 'DELETE' }); }

    // Asistencias
    async getAsistencias(filtros = {}) {
        const params = new URLSearchParams(filtros).toString();
        return await this.request(`/asistencias?${params}`);
    }
    async crearAsistencia(data) { return await this.request('/asistencias', { method: 'POST', body: JSON.stringify(data) }); }
    async eliminarAsistencia(id) { return await this.request(`/asistencias/${id}`, { method: 'DELETE' }); }

    // Vehículos
    async getVehiculos(filtros = {}) {
        const params = new URLSearchParams(filtros).toString();
        return await this.request(`/vehiculos?${params}`);
    }
    async getResumenVehiculos(filtros = {}) {
        const params = new URLSearchParams(filtros).toString();
        return await this.request(`/vehiculos/resumen?${params}`);
    }
    async crearVehiculo(data) { return await this.request('/vehiculos', { method: 'POST', body: JSON.stringify(data) }); }
    async eliminarVehiculo(id) { return await this.request(`/vehiculos/${id}`, { method: 'DELETE' }); }
}

const api = new API();

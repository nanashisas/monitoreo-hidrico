const CONFIG = {
    API_URL: 'https://monitoreo-hidrico-backend-iyoo.onrender.com/api',
    MAPA: {
        centroInicial: [-27.05, -58.68], // Las Palmas, Chaco
        zoomInicial: 13,
        tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        atribucion: '© OpenStreetMap contributors'
    },
    UMBRALES: {
        nivel_rio: { alerta: 3.5, critico: 5.0 },
        precipitacion: { alerta: 100, critico: 150 }
    }
};

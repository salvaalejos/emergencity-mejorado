const express = require('express');
const app = express();
const cors = require('cors');
const { swaggerUi, swaggerDocs } = require('./config/swagger');
const cookieParser = require('cookie-parser');
const WebSocket = require('ws');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dotenv = require('dotenv');

dotenv.config();

// Puerto para la API REST (Login, BD, etc.)
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. MIDDLEWARE Y CORS (Vital para la integración)
// ==========================================
app.use(cors({
    origin: 'http://localhost:5173', // Permitir al Frontend
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(cookieParser());

// ==========================================
// 2. RUTAS DE LA API (Conserva todo lo de tu compañero)
// ==========================================
const seed = require('./routes/seed.js');
const auth = require('./routes/auth.js');
const ambulancia = require('./routes/ambulancias.js');
const paramedico = require('./routes/paramedico.js');
const hospital = require('./routes/hospital.js');
const operador = require('./routes/operador.js');
const doctor = require('./routes/doctor.js');
const reportePrehospitalario = require('./routes/reportePrehospitalario.js');

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
app.use('/api/seed', seed);
app.use('/api/auth', auth);
app.use('/api/ambulancias', ambulancia);
app.use('/api/paramedico', paramedico);
app.use('/api/hospital', hospital);
app.use('/api/operador', operador);
app.use('/api/doctor', doctor);
app.use('/api/reporte-prehospitalario', reportePrehospitalario);


// ==========================================
// 3. ENDPOINTS EXTRA (Lógica de tu compañero)
// ==========================================

// Obtener lista de doctores (Para asignaciones)
app.get('/api/doctores', async (req, res) => {
    try {
        // Ajusta esto si tu tabla de doctores tiene otros campos
        const doctores = await prisma.doctor.findMany({
            select: { id: true, nombre: true, especialidad: true }
        });
        res.json(doctores);
    } catch (error) {
        console.error("Error obteniendo doctores:", error);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Estado de ambulancias para el mapa del Operador
app.get('/api/ambulances/active', (req, res) => {
    const ambulancesList = Array.from(activeAmbulances.entries()).map(([id, ambulance]) => ({
        id: ambulance.id,
        placa: ambulance.placa,
        tipo: ambulance.tipo,
        status: ambulance.status,
        location: ambulance.location,
        speed: ambulance.speed,
        lastUpdate: ambulance.lastUpdate
    }));

    res.json({
        success: true,
        data: ambulancesList,
        total: ambulancesList.length
    });
});

// Health check para monitoreo
app.get('/api/ambulances/health', (req, res) => {
    res.json({
        status: 'ok',
        activeAmbulances: activeAmbulances.size,
        activeHospitals: hospitals.size,
        timestamp: new Date().toISOString()
    });
});

// Integración con Python (Sensores/GPS externos)
app.post('/api/pacientes', async (req, res) => {
    try {
        const { seccion, datos } = req.body;
        console.log('📡 Datos recibidos desde Python:', { seccion, datos });

        // Reenvía los datos a TODOS los clientes WebSocket (Frontend)
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'python_data', seccion, datos }));
            }
        });

        res.status(200).json({ success: true, message: 'Datos procesados y emitidos' });
    } catch (error) {
        console.error('❌ Error en endpoint Python:', error);
        res.status(500).json({ success: false });
    }
});

app.get('/', (req, res) => {
    res.json({ message: '🚑 EmergenCity API v2.0 - Fusionada' });
});


// ==========================================
// 4. INICIAR SERVIDOR HTTP (Puerto 3000)
// ==========================================
app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 API REST lista en: http://localhost:${PORT}`);
    console.log(`📡 WebSocket Server en: ws://localhost:8081\n`);
});


// ==========================================
// 5. SERVIDOR WEBSOCKET (Puerto 8081)
// ==========================================
const wss = new WebSocket.Server({ port: 8081 });

// Estado en memoria del sistema
const activeAmbulances = new Map();
const hospitals = new Set();
const connectedUsers = new Map(); // Para identificar usuarios específicos si hace falta

wss.on('connection', (ws) => {
    console.log('🔌 Nuevo cliente WebSocket conectado');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // Identificación opcional (Lógica compañero)
            if (data.type === 'identify') {
                connectedUsers.set(data.userId, ws);
            }

            handleAmbulanceMessage(ws, data);
        } catch (error) {
            console.error('❌ Error WS:', error);

            // Compatibilidad con mensajes de texto plano
            if (typeof message === 'string') {
                console.log('📨 Texto plano recibido:', message);
            }
        }
    });

    ws.on('close', () => {
        hospitals.delete(ws);
        // Limpiar ambulancias
        for (let [id, data] of activeAmbulances.entries()) {
            if (data.ws === ws) {
                activeAmbulances.delete(id);
                console.log(`🚑 Ambulancia ${id} desconectada`);
                broadcastActiveAmbulances();
                break;
            }
        }
    });
});


// ==========================================
// 6. ENRUTAMIENTO DE MENSAJES (LA FUSIÓN)
// ==========================================
function handleAmbulanceMessage(ws, data) {
    // console.log('📨 Acción WS:', data.type); // Debug

    switch (data.type) {
        // ----------------------------------------------------
        // [SECCIÓN A] TU LÓGICA DE VIDEO Y ALERTAS GLOBALES
        // ----------------------------------------------------
        case 'patient_transfer_notification':
            console.log(`🚨 ALERTA DE EMERGENCIA: Traslado iniciado. Sala: ${data.callId}`);

            // Actualizar estado de ambulancia a "Ocupada"
            if (data.ambulanceId && activeAmbulances.has(data.ambulanceId)) {
                const amb = activeAmbulances.get(data.ambulanceId);
                amb.status = 'ocupada';
                broadcastActiveAmbulances();
            }

            // 📢 GRITAR A TODOS (Médicos, Hospitales, Admins)
            const alertMsg = JSON.stringify({
                type: 'patient_transfer_notification',
                ambulanceId: data.ambulanceId,
                callId: data.callId,
                patientInfo: data.patientInfo,
                eta: data.eta,
                timestamp: new Date().toISOString()
            });

            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(alertMsg);
                }
            });
            break;

        case 'hospital_accept_patient':
            console.log(`✅ Hospital aceptó. Avisando a ambulancia ${data.ambulanceId}`);
            // Buscar la ambulancia específica para confirmar
            // Nota: Buscamos en activeAmbulances por ID
            const targetAmbAccept = activeAmbulances.get(data.ambulanceId);

            if (targetAmbAccept && targetAmbAccept.ws.readyState === WebSocket.OPEN) {
                targetAmbAccept.ws.send(JSON.stringify({
                    type: 'patient_accepted',
                    hospitalId: data.hospitalId,
                    hospitalInfo: data.hospitalInfo,
                    message: '¡El hospital te espera!'
                }));
            } else {
                // Si no está en el mapa, intentamos un broadcast de emergencia
                console.warn("⚠️ Ambulancia no encontrada en mapa activo, intentando broadcast...");
            }
            break;

        case 'hospital_reject_patient':
            console.log(`❌ Hospital rechazó. Avisando a ambulancia ${data.ambulanceId}`);
            const targetAmbReject = activeAmbulances.get(data.ambulanceId);
            if (targetAmbReject && targetAmbReject.ws.readyState === WebSocket.OPEN) {
                targetAmbReject.ws.send(JSON.stringify({
                    type: 'patient_rejected',
                    hospitalId: data.hospitalId,
                    reason: data.reason
                }));
            }
            break;

        // ----------------------------------------------------
        // [SECCIÓN B] LÓGICA DE TU COMPAÑERO (Mantenimiento)
        // ----------------------------------------------------
        case 'register_ambulance':
            if (data.ambulance && data.ambulance.id) {
                activeAmbulances.set(data.ambulance.id, {
                    ...data.ambulance,
                    ws: ws,
                    location: null,
                    status: 'disponible',
                    lastUpdate: new Date()
                });
                console.log(`🚑 Ambulancia registrada en sistema: ${data.ambulance.id}`);
                broadcastActiveAmbulances();
            }
            break;

        case 'register_hospital':
            hospitals.add(ws);
            console.log('🏥 Hospital conectado al mapa');
            sendActiveAmbulancesTo(ws);
            break;

        case 'location_update':
            const ambData = activeAmbulances.get(data.ambulanceId);
            if (ambData) {
                ambData.location = data.location;
                ambData.speed = data.speed;
                ambData.lastUpdate = new Date();

                // Rebotar a hospitales (Tracking en tiempo real)
                broadcastToHospitals({
                    type: 'location_update',
                    ambulanceId: data.ambulanceId,
                    location: data.location,
                    speed: data.speed,
                    status: ambData.status
                });
            }
            break;

        case 'hospital_note':
            const targetNoteAmb = activeAmbulances.get(data.ambulanceId);
            if (targetNoteAmb && targetNoteAmb.ws.readyState === WebSocket.OPEN) {
                targetNoteAmb.ws.send(JSON.stringify({
                    type: 'hospital_note',
                    note: data.note
                }));
                console.log(`📋 Nota enviada a ${data.ambulanceId}`);
            }
            break;

        case 'emergency_assignment':
            const emergencyAmb = activeAmbulances.get(data.ambulanceId);
            if (emergencyAmb && emergencyAmb.ws.readyState === WebSocket.OPEN) {
                emergencyAmb.ws.send(JSON.stringify({
                    type: 'emergency_assignment',
                    emergency: data.emergency
                }));
                emergencyAmb.status = 'en_ruta';
                console.log(`🚨 Misión asignada a ${data.ambulanceId}`);
                broadcastActiveAmbulances();
            }
            break;

        case 'navigation_started':
            const startedAmb = activeAmbulances.get(data.ambulanceId);
            if (startedAmb) {
                startedAmb.status = 'en_ruta';
                broadcastActiveAmbulances();
            }
            break;

        case 'navigation_finished':
            const finishedAmb = activeAmbulances.get(data.ambulanceId);
            if (finishedAmb) {
                finishedAmb.status = 'disponible';
                broadcastActiveAmbulances();
            }
            break;

        case 'note_accepted':
            console.log(`✅ Nota aceptada por ${data.ambulanceId}`);
            break;

        default:
            // Silencioso para no llenar logs con tipos desconocidos
            break;
    }
}

// ==========================================
// 7. FUNCIONES AUXILIARES
// ==========================================
function broadcastToHospitals(message) {
    const messageStr = JSON.stringify(message);
    hospitals.forEach(hospitalWs => {
        if (hospitalWs.readyState === WebSocket.OPEN) {
            hospitalWs.send(messageStr);
        }
    });
}

function broadcastActiveAmbulances() {
    const ambulancesList = Array.from(activeAmbulances.entries()).map(([id, ambulance]) => ({
        id: ambulance.id,
        placa: ambulance.placa,
        tipo: ambulance.tipo,
        status: ambulance.status,
        location: ambulance.location,
        speed: ambulance.speed,
        lastUpdate: ambulance.lastUpdate
    }));

    broadcastToHospitals({
        type: 'active_ambulances_update',
        ambulances: ambulancesList
    });
}

function sendActiveAmbulancesTo(ws) {
    const list = Array.from(activeAmbulances.entries()).map(([id, val]) => ({
        id,
        placa: val.placa,
        status: val.status,
        location: val.location
    }));
    ws.send(JSON.stringify({ type: 'active_ambulances_update', ambulances: list }));
}
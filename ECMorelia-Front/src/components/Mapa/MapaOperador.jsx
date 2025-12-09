// MapaOperadorOptimizado.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  ChakraProvider,
  Box,
  Button,
  VStack,
  Text,
  HStack,
  Badge,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Input,
  Select,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useToast,
  Card,
  CardBody,
  Progress,
  InputGroup,
  InputRightElement,
  IconButton,
  List,
  ListItem,
  Spinner
} from '@chakra-ui/react';
import { SearchIcon, CloseIcon } from '@chakra-ui/icons';

mapboxgl.accessToken = 'pk.eyJ1IjoiZWR1YXJkbzI1MGplbW0iLCJhIjoiY2xwYzVvdzc3MDNlYjJoazUzbzZsYjRwNiJ9.KsDXLdjWn2R4fMX-YIIU8g';

export default function MapaOperadorOptimizado() {
  // Refs
  const mapContainer = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const watchId = useRef(null);
  const ws = useRef(null);
  const hospitalMarkers = useRef([]);
  const emergencyMarker = useRef(null);
  const routeLayerIds = useRef([]);
  const reconnectTimeout = useRef(null);
  const connectionAttempts = useRef(0);
  const maxConnectionAttempts = 5;

  // Estado principal
  const [pos, setPos] = useState(null);
  const [speed, setSpeed] = useState(0);
  const [heading, setHeading] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [destination, setDestination] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [hospitalNotification, setHospitalNotification] = useState(null);
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  // Estado de búsqueda y emergencia
  const { isOpen: isFormOpen, onOpen: onFormOpen, onClose: onFormClose } = useDisclosure();
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [emergencyType, setEmergencyType] = useState('');
  const [selectedHospital, setSelectedHospital] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);

  const toast = useToast();

  // ---------- WEBSOCKET CONNECTION MEJORADA ----------
  const connectWebSocket = useCallback(() => {
    if (isConnecting || connectionAttempts.current >= maxConnectionAttempts) {
      return;
    }

    try {
      if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      console.log('🔗 Conectando operador al WebSocket...');
      setIsConnecting(true);
      connectionAttempts.current += 1;

      ws.current = new WebSocket('wss://emergencity.ddnsking.com/socket');

      ws.current.onopen = () => {
        console.log('✅ Operador conectado al servidor WebSocket');
        setWsConnected(true);
        setIsConnecting(false);
        connectionAttempts.current = 0;
        
        // Registrar ambulancia
        safeSend({
          type: 'register_ambulance',
          ambulance: {
            id: 'UVI-01',
            placa: 'ABC123',
            tipo: 'UVI Móvil',
            status: 'disponible'
          }
        });

        showToast('success', 'Sistema Conectado', 'GPS operativo y conectado al servidor');
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Mensaje recibido:', data.type);

          switch (data.type) {
            case 'connection_established':
              console.log('✅ Conexión WebSocket confirmada');
              break;

            case 'active_hospitals_update':
              console.log('🏥 Hospitales actualizados:', data.hospitals.length);
              setHospitals(data.hospitals || []);
              updateHospitalMarkers(data.hospitals || []);
              break;

            case 'hospital_note':
              showToast('info', 'Mensaje del Hospital', data.note?.message || 'Nueva comunicación');
              break;

            case 'patient_accepted':
              setHospitalNotification({
                type: 'accepted',
                message: `✅ ${data.hospitalInfo?.nombre || 'Hospital'} ha aceptado al paciente - Proceda al traslado`,
                hospitalInfo: data.hospitalInfo
              });
              setIsNavigating(true);
              setTimeout(() => setHospitalNotification(null), 6000);
              break;

            case 'patient_rejected':
              setHospitalNotification({
                type: 'rejected', 
                message: `❌ ${data.hospitalInfo?.nombre || 'Hospital'} no puede aceptar al paciente. Razón: ${data.reason}`,
                hospitalInfo: data.hospitalInfo
              });
              setIsNavigating(false);
              clearRoute();
              setTimeout(() => setHospitalNotification(null), 6000);
              break;

            case 'navigation_cancelled':
              setIsNavigating(false);
              clearRoute();
              showToast('info', 'Navegación Cancelada', data.message || 'Ruta cancelada por el hospital');
              break;

            case 'notification_sent':
              showToast('success', 'Notificación Enviada', 'Hospital notificado correctamente');
              break;

            case 'error':
              showToast('error', 'Error del Sistema', data.message);
              break;

            default:
              console.log('📨 Mensaje no procesado:', data.type);
          }
        } catch (error) {
          console.error('❌ Error procesando mensaje:', error);
        }
      };

      ws.current.onclose = (event) => {
        console.log('🔌 WebSocket cerrado:', event.code, event.reason);
        setWsConnected(false);
        setIsConnecting(false);

        if (event.code !== 1000 && connectionAttempts.current < maxConnectionAttempts) {
          showToast('warning', 'Conexión Perdida', 'Reconectando automáticamente...');
          reconnectTimeout.current = setTimeout(() => {
            connectWebSocket();
          }, 5000); // Aumentado a 5 segundos
        } else if (connectionAttempts.current >= maxConnectionAttempts) {
          showToast('error', 'Error de Conexión', 'No se pudo conectar después de varios intentos');
        }
      };

      ws.current.onerror = (error) => {
        console.error('❌ Error WebSocket:', error);
        setWsConnected(false);
        setIsConnecting(false);
        showToast('error', 'Error de Conexión', 'Verifique su conexión a internet');
      };

    } catch (error) {
      console.error('❌ Error al conectar WebSocket:', error);
      setIsConnecting(false);
    }
  }, [isConnecting]);

  // ---------- MAP INITIALIZATION ----------
  useEffect(() => {
    if (!mapContainer.current) return;

    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/navigation-day-v1',
      center: [-101.1969, 19.7024],
      zoom: 13,
      pitch: 45,
      bearing: 0
    });

    mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');

    mapInstance.on('load', () => {
      console.log('🗺️ Mapa GPS cargado correctamente');
      map.current = mapInstance;
      
      // Agregar capa de tráfico
      if (trafficEnabled) {
        addTrafficLayer();
      }
      
      // Agregar capa de edificios 3D
      add3DBuildings();
    });

    return () => {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      cleanupMarkers();
      try { mapInstance.remove(); } catch (e) {}
    };
  }, []);

  // ---------- WEBSOCKET LIFECYCLE ----------
  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (ws.current) {
        try {
          ws.current.close(1000, 'Componente desmontado');
        } catch (e) {}
      }
    };
  }, [connectWebSocket]);

  // ---------- GEOLOCATION TRACKING ----------
  useEffect(() => {
    if (!navigator.geolocation) {
      showToast('error', 'GPS No Disponible', 'Su dispositivo no soporta geolocalización');
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed: spd, heading: hdg } = position.coords;
        const currentSpeed = spd ? Math.round(spd * 3.6) : 0;
        const currentHeading = hdg || 0;

        setPos({ lat: latitude, lng: longitude });
        setSpeed(currentSpeed);
        setHeading(currentHeading);

        updatePositionOnMap({ lat: latitude, lng: longitude }, currentHeading);
        
        // Enviar ubicación al servidor
        sendLocationUpdate({ lat: latitude, lng: longitude }, currentSpeed, currentHeading);
      },
      (error) => {
        console.error('❌ Error GPS:', error);
        showToast('error', 'Error de GPS', 'No se puede obtener la ubicación actual');
      },
      { 
        enableHighAccuracy: true, 
        maximumAge: 2000, 
        timeout: 10000 
      }
    );

    return () => {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [isNavigating]);

  // ---------- MAP LAYERS ----------
  const addTrafficLayer = () => {
    if (!map.current) return;

    try {
      if (!map.current.getSource('mapbox-traffic')) {
        map.current.addSource('mapbox-traffic', {
          type: 'vector',
          url: 'mapbox://mapbox.mapbox-traffic-v1'
        });
      }

      if (!map.current.getLayer('traffic-layer')) {
        map.current.addLayer({
          id: 'traffic-layer',
          type: 'line',
          source: 'mapbox-traffic',
          'source-layer': 'traffic',
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'congestion'], 'low'], '#00E676',
              ['==', ['get', 'congestion'], 'moderate'], '#FF9100', 
              ['==', ['get', 'congestion'], 'heavy'], '#FF5252',
              '#00E676'
            ],
            'line-width': 5,
            'line-opacity': 0.8
          }
        }, 'waterway-label');
      }
    } catch (error) {
      console.warn('No se pudo agregar capa de tráfico:', error);
    }
  };

  const add3DBuildings = () => {
    if (!map.current) return;

    try {
      const layers = map.current.getStyle().layers;
      const labelLayerId = layers.find(layer => layer.type === 'symbol' && layer.layout['text-field'])?.id;

      if (map.current.getSource('composite')) {
        map.current.addLayer({
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 15,
          paint: {
            'fill-extrusion-color': '#C0C0C0',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.7
          }
        }, labelLayerId);
      }
    } catch (error) {
      console.warn('No se pudo agregar edificios 3D:', error);
    }
  };

  const toggleTraffic = () => {
    if (!map.current) return;

    if (trafficEnabled) {
      if (map.current.getLayer('traffic-layer')) {
        map.current.removeLayer('traffic-layer');
      }
      setTrafficEnabled(false);
      showToast('info', 'Tráfico', 'Capa de tráfico desactivada');
    } else {
      addTrafficLayer();
      setTrafficEnabled(true);
      showToast('info', 'Tráfico', 'Capa de tráfico activada');
    }
  };

  // ---------- MARKER MANAGEMENT ----------
  const updatePositionOnMap = (position, heading) => {
    if (!map.current) return;

    if (!marker.current) {
      const el = document.createElement('div');
      el.className = 'ambulance-marker';
      el.innerHTML = `
        <div style="
          width: 65px; height: 65px; background: linear-gradient(135deg, #FF4444, #CC0000);
          border: 4px solid white; border-radius: 50%; display: flex; align-items: center; 
          justify-content: center; color: white; font-weight: bold; font-size: 28px; 
          box-shadow: 0 6px 20px rgba(255,0,0,0.4); cursor: pointer;
        ">🚑</div>
      `;
      
      marker.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([position.lng, position.lat])
        .addTo(map.current);
    } else {
      marker.current.setLngLat([position.lng, position.lat]);
    }

    // Rotar marcador según heading
    const markerElement = marker.current.getElement();
    if (markerElement) {
      markerElement.style.transform = `rotate(${heading}deg)`;
      markerElement.style.transition = 'transform 0.5s ease';
    }

    // Centrar mapa si no está en navegación
    if (!isNavigating) {
      map.current.easeTo({
        center: [position.lng, position.lat],
        bearing: heading,
        pitch: speed > 40 ? 50 : 60,
        zoom: speed > 60 ? 14 : 16,
        duration: 1000
      });
    }
  };

  const updateHospitalMarkers = (hospitalsList) => {
    if (!map.current) return;

    // Limpiar marcadores anteriores
    hospitalMarkers.current.forEach(marker => marker.remove());
    hospitalMarkers.current = [];

    hospitalsList.forEach(hospital => {
      if (!hospital.lat || !hospital.lng) return;

      const el = document.createElement('div');
      el.innerHTML = `
        <div style="
          width: 48px; height: 48px; background: ${hospital.connected ? '#4CAF50' : '#757575'};
          border: 3px solid white; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; color: white; font-weight: bold; font-size: 20px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3); cursor: pointer;
          opacity: ${hospital.connected ? '1' : '0.6'};
        ">🏥</div>
      `;

      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="padding: 12px; max-width: 280px; font-family: Arial, sans-serif;">
            <strong style="font-size: 16px; color: #333;">${hospital.nombre}</strong>
            <div style="margin: 8px 0; font-size: 14px; color: #666;">
              <div>📍 ${hospital.direccion || 'Dirección no disponible'}</div>
              ${hospital.especialidades?.length > 0 ? 
                `<div style="margin-top: 4px;">🏥 ${hospital.especialidades.join(', ')}</div>` : ''}
              ${hospital.camasDisponibles ? 
                `<div style="margin-top: 4px;">🛏️ ${hospital.camasDisponibles} camas disponibles</div>` : ''}
              ${hospital.telefono ? 
                `<div style="margin-top: 4px;">📞 ${hospital.telefono}</div>` : ''}
            </div>
            ${hospital.connected ? `
              <button onclick="window.selectHospitalFromMap('${hospital.id}')" 
                style="width: 100%; padding: 10px 16px; background: #2196F3; color: white; 
                border: none; border-radius: 8px; cursor: pointer; margin-top: 8px; font-weight: bold;
                box-shadow: 0 2px 8px rgba(33,150,243,0.3); transition: all 0.2s;"
                onmouseover="this.style.background='#1976D2'" 
                onmouseout="this.style.background='#2196F3'">
                🚑 Seleccionar Destino
              </button>` : 
              '<div style="padding: 10px; background: #9E9E9E; color: white; text-align: center; border-radius: 8px; margin-top: 8px; font-size: 14px;">Hospital no disponible</div>'}
          </div>
        `);

      const hospitalMarker = new mapboxgl.Marker({ element: el })
        .setLngLat([hospital.lng, hospital.lat])
        .setPopup(popup)
        .addTo(map.current);

      hospitalMarkers.current.push(hospitalMarker);

      if (hospital.connected) {
        el.addEventListener('click', () => {
          setSelectedHospital(hospital.id);
          showToast('info', 'Destino Seleccionado', hospital.nombre);
        });
      }
    });

    // Función global para selección desde popup
    window.selectHospitalFromMap = (hospitalId) => {
      const hospital = hospitalsList.find(h => h.id === hospitalId);
      if (hospital) {
        setSelectedHospital(hospitalId);
        showToast('info', 'Destino Seleccionado', hospital.nombre);
        
        // Centrar en el hospital
        map.current.flyTo({
          center: [hospital.lng, hospital.lat],
          zoom: 15,
          duration: 1000
        });
      }
    };
  };

  const placeEmergencyMarker = (location, address = 'Punto de Emergencia') => {
    if (!map.current) return;

    // Remover marcador anterior
    if (emergencyMarker.current) {
      emergencyMarker.current.remove();
    }

    const el = document.createElement('div');
    el.innerHTML = `
      <div style="
        width: 55px; height: 55px; background: linear-gradient(135deg, #FF9800, #F57C00);
        border: 4px solid white; border-radius: 12px; display: flex; align-items: center;
        justify-content: center; color: white; font-weight: bold; font-size: 24px;
        box-shadow: 0 6px 20px rgba(255,152,0,0.5); cursor: pointer;
        transform: rotate(45deg);
      ">⚠️</div>
    `;

    const popup = new mapboxgl.Popup({ offset: 25 })
      .setHTML(`
        <div style="padding: 12px; max-width: 250px;">
          <strong style="font-size: 16px; color: #FF9800;">📍 Punto de Emergencia</strong>
          <div style="margin: 8px 0; font-size: 14px; color: #666;">
            ${address}
          </div>
          <div style="font-size: 12px; color: #999;">
            Haga clic en "Reportar Emergencia" para continuar
          </div>
        </div>
      `);

    emergencyMarker.current = new mapboxgl.Marker({ element: el })
      .setLngLat([location.lng, location.lat])
      .setPopup(popup)
      .addTo(map.current);

    // Centrar en el punto de emergencia
    map.current.flyTo({
      center: [location.lng, location.lat],
      zoom: 16,
      duration: 1500
    });

    setSelectedLocation(location);
    showToast('info', 'Ubicación Seleccionada', 'Punto de emergencia marcado en el mapa');
  };

  const cleanupMarkers = () => {
    hospitalMarkers.current.forEach(marker => marker.remove());
    hospitalMarkers.current = [];
    
    if (marker.current) {
      marker.current.remove();
      marker.current = null;
    }
    
    if (emergencyMarker.current) {
      emergencyMarker.current.remove();
      emergencyMarker.current = null;
    }
  };

  // ---------- ROUTE MANAGEMENT ----------
  const calculateRoute = async (start, end) => {
    if (!start || !end) {
      showToast('error', 'Error de Ruta', 'Ubicaciones no válidas para calcular ruta');
      return null;
    }

    try {
      const response = await fetch('http://localhost:3002/directions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startLng: start.lng,
          startLat: start.lat,
          endLng: end.lng,
          endLat: end.lat
        })
      });

      if (!response.ok) {
        throw new Error('Error calculando ruta');
      }

      const routeData = await response.json();
      return routeData;
    } catch (error) {
      console.error('❌ Error calculando ruta:', error);
      showToast('error', 'Error de Ruta', 'No se pudo calcular la ruta al destino');
      return null;
    }
  };

  const drawRoute = (routeGeometry, routeId = 'active-route') => {
    if (!map.current || !routeGeometry) return;

    // Limpiar ruta anterior
    clearRoute();

    try {
      map.current.addSource(routeId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: routeGeometry
          },
          properties: {}
        }
      });

      // Capa principal de ruta
      map.current.addLayer({
        id: routeId,
        type: 'line',
        source: routeId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#2196F3',
          'line-width': 6,
          'line-opacity': 0.9
        }
      });

      // Efecto glow
      map.current.addLayer({
        id: routeId + '-glow',
        type: 'line',
        source: routeId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#2196F3',
          'line-width': 14,
          'line-opacity': 0.3,
          'line-blur': 2
        }
      }, routeId);

      routeLayerIds.current = [routeId, routeId + '-glow'];

      // Ajustar vista a la ruta
      const bounds = new mapboxgl.LngLatBounds();
      routeGeometry.forEach(coord => {
        bounds.extend([coord[0], coord[1]]);
      });
      if (pos) bounds.extend([pos.lng, pos.lat]);

      map.current.fitBounds(bounds, {
        padding: 120,
        duration: 2000,
        pitch: 50
      });

    } catch (error) {
      console.error('❌ Error dibujando ruta:', error);
    }
  };

  const clearRoute = () => {
    if (!map.current) return;

    routeLayerIds.current.forEach(layerId => {
      if (map.current.getLayer(layerId)) {
        map.current.removeLayer(layerId);
      }
      if (map.current.getSource(layerId)) {
        map.current.removeSource(layerId);
      }
    });
    routeLayerIds.current = [];
    setRouteInfo(null);
  };

  // ---------- ADDRESS SEARCH ----------
  const searchAddresses = async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);

    try {
      const response = await fetch('http://localhost:3002/search-addresses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery
        })
      });

      if (!response.ok) {
        throw new Error('Error en búsqueda');
      }

      const results = await response.json();
      setSearchResults(results);

    } catch (error) {
      console.error('❌ Error buscando direcciones:', error);
      showToast('error', 'Error de Búsqueda', 'No se pudieron cargar los resultados');
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (result) => {
    setSearchQuery(result.place_name);
    setSearchResults([]);
    
    placeEmergencyMarker(
      { lat: result.lat, lng: result.lng },
      result.place_name
    );
  };

  // ---------- EMERGENCY MANAGEMENT ----------
  const startEmergency = async () => {
    // Validaciones
    if (!age || !sex || !emergencyType) {
      showToast('warning', 'Datos Incompletos', 'Complete la información del paciente');
      return;
    }

    if (!selectedHospital) {
      showToast('warning', 'Hospital No Seleccionado', 'Seleccione un hospital destino');
      return;
    }

    const hospital = hospitals.find(h => h.id === selectedHospital && h.connected);
    if (!hospital) {
      showToast('error', 'Hospital No Disponible', 'El hospital seleccionado no está conectado');
      return;
    }

    if (!pos) {
      showToast('error', 'Ubicación No Disponible', 'Esperando señal GPS...');
      return;
    }

    // Usar ubicación de emergencia si está seleccionada, sino usar posición actual
    const emergencyLocation = selectedLocation || pos;

    try {
      // Calcular ruta
      const routeData = await calculateRoute(emergencyLocation, hospital);
      if (!routeData) return;

      // Dibujar ruta en el mapa
      drawRoute(routeData.geometry);
      
      // Actualizar información de ruta
      setRouteInfo({
        distance: (routeData.distance / 1000).toFixed(1),
        duration: Math.round(routeData.duration / 60),
        hospital: hospital.nombre,
        address: hospital.direccion
      });

      // Enviar notificación al hospital
      const patientInfo = {
        age: age,
        sex: sex,
        emergencyType: emergencyType,
        timestamp: new Date().toLocaleString(),
        emergencyLocation: selectedLocation ? searchQuery : 'Ubicación actual'
      };

      safeSend({
        type: 'patient_transfer_notification',
        ambulanceId: 'UVI-01',
        hospitalId: hospital.id,
        patientInfo: patientInfo,
        ambulanceLocation: emergencyLocation,
        eta: Math.round(routeData.duration / 60),
        distance: (routeData.distance / 1000).toFixed(1),
        routeGeometry: routeData.geometry
      });

      // Configurar navegación
      setIsNavigating(true);
      setDestination(hospital);
      setHospitalNotification({
        type: 'pending',
        message: `⏳ Esperando confirmación de ${hospital.nombre}...`
      });

      // Cerrar formulario
      onFormClose();
      showToast('success', 'Emergencia Reportada', 'Hospital notificado y ruta calculada');

      // Limpiar formulario
      setAge('');
      setSex('');
      setEmergencyType('');
      setSelectedHospital('');
      setSearchQuery('');
      setSelectedLocation(null);
      
      // Remover marcador de emergencia
      if (emergencyMarker.current) {
        emergencyMarker.current.remove();
        emergencyMarker.current = null;
      }

    } catch (error) {
      console.error('❌ Error iniciando emergencia:', error);
      showToast('error', 'Error del Sistema', 'No se pudo procesar la emergencia');
    }
  };

  const cancelNavigation = () => {
    if (destination) {
      safeSend({
        type: 'cancel_navigation',
        ambulanceId: 'UVI-01',
        hospitalId: destination.id
      });
    }
    
    setIsNavigating(false);
    setDestination(null);
    clearRoute();
    setHospitalNotification(null);
    showToast('info', 'Navegación Cancelada', 'Ruta eliminada del sistema');
  };

  // ---------- UTILITY FUNCTIONS ----------
  const safeSend = (message) => {
    try {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error('❌ Error enviando mensaje:', error);
    }
  };

  const sendLocationUpdate = (location, speed, heading) => {
    safeSend({
      type: 'location_update',
      ambulanceId: 'UVI-01',
      location: location,
      speed: speed,
      heading: heading,
      status: isNavigating ? 'en_ruta' : 'disponible'
    });
  };

  const showToast = (status, title, description) => {
    toast({
      title,
      description,
      status,
      duration: 4000,
      isClosable: true,
      position: 'top-right'
    });
  };

  const refreshHospitals = () => {
    safeSend({
      type: 'request_hospitals_list'
    });
    showToast('info', 'Actualizando', 'Buscando hospitales disponibles...');
  };

  const reconnect = () => {
    if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    connectionAttempts.current = 0;
    connectWebSocket();
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedLocation(null);
    if (emergencyMarker.current) {
      emergencyMarker.current.remove();
      emergencyMarker.current = null;
    }
  };

  // ---------- RENDER ----------
  return (
    <ChakraProvider>
      <Box height="100vh" display="flex" flexDirection="column" bg="gray.50">
        {/* Header */}
        <Box bg="white" p={3} boxShadow="sm" borderBottom="1px" borderColor="gray.200">
          <HStack justifyContent="space-between">
            <VStack align="start" spacing={0}>
              <Text fontSize="xl" fontWeight="bold" color="gray.800">🚑 Ambulancia UVI-01</Text>
              <Text fontSize="sm" color="gray.600">
                {isNavigating ? `En ruta a ${destination?.nombre || 'hospital'}` : 'Modo disponible'}
                <Badge ml={2} colorScheme={wsConnected ? "green" : isConnecting ? "yellow" : "red"} fontSize="xs">
                  {wsConnected ? "SISTEMA CONECTADO" : isConnecting ? "CONECTANDO..." : "SIN CONEXIÓN"}
                </Badge>
              </Text>
            </VStack>

            <HStack spacing={4}>
              <Box bg="blue.50" p={2} borderRadius="md" border="1px" borderColor="blue.200">
                <Text fontSize="sm" fontWeight="bold" color="blue.800">{speed} km/h</Text>
              </Box>
              <Badge colorScheme="blue" fontSize="md" p={2} borderRadius="md">
                {hospitals.filter(h => h.connected).length} HOSPITALES
              </Badge>
              {routeInfo && (
                <Badge colorScheme="purple" fontSize="md" p={2} borderRadius="md">
                  🕐 {routeInfo.duration} min • 📏 {routeInfo.distance} km
                </Badge>
              )}
            </HStack>
          </HStack>
        </Box>

        {/* Main Content */}
        <Box flex={1} display="flex">
          {/* Side Panel */}
          <Box width="420px" bg="white" p={4} overflowY="auto" boxShadow="md" borderRight="1px" borderColor="gray.200">
            <VStack spacing={4} align="stretch">
              {/* Emergency Button */}
              <Button 
                colorScheme="red" 
                size="lg" 
                onClick={onFormOpen}
                leftIcon={<Text>⚠️</Text>}
                isDisabled={!wsConnected}
                height="60px"
                fontSize="lg"
                fontWeight="bold"
                boxShadow="md"
                _hover={{ transform: 'translateY(-2px)', boxShadow: 'lg' }}
                transition="all 0.2s"
              >
                REPORTAR EMERGENCIA
              </Button>

              {/* Connection Status */}
              <Card bg={wsConnected ? "green.50" : isConnecting ? "yellow.50" : "red.50"} border="1px" borderColor={wsConnected ? "green.200" : isConnecting ? "yellow.200" : "red.200"}>
                <CardBody p={3}>
                  <HStack>
                    <Box w="3" h="3" borderRadius="full" bg={wsConnected ? "green.400" : isConnecting ? "yellow.400" : "red.400"} />
                    <Text fontSize="sm" fontWeight="medium" color={wsConnected ? "green.800" : isConnecting ? "yellow.800" : "red.800"}>
                      {wsConnected ? 'Sistema conectado y operativo' : isConnecting ? 'Conectando al servidor...' : 'Sistema desconectado - Modo local'}
                    </Text>
                  </HStack>
                  {!wsConnected && (
                    <Button size="sm" mt={2} onClick={reconnect} colorScheme="orange" width="100%" isDisabled={isConnecting}>
                      {isConnecting ? <Spinner size="sm" /> : '🔄 Reconectar Sistema'}
                    </Button>
                  )}
                </CardBody>
              </Card>

              {/* Route Information */}
              {routeInfo && (
                <Card bg="blue.50" border="1px" borderColor="blue.200">
                  <CardBody>
                    <Text fontWeight="bold" mb={2} color="blue.800">📊 RUTA ACTIVA</Text>
                    <VStack align="start" spacing={1}>
                      <Text fontSize="sm" color="blue.700"><strong>🏥 Destino:</strong> {routeInfo.hospital}</Text>
                      <Text fontSize="sm" color="blue.700"><strong>📍 Dirección:</strong> {routeInfo.address}</Text>
                      <Text fontSize="sm" color="blue.700"><strong>📏 Distancia:</strong> {routeInfo.distance} km</Text>
                      <Text fontSize="sm" color="blue.700"><strong>🕐 Tiempo estimado:</strong> {routeInfo.duration} minutos</Text>
                    </VStack>
                    <Progress value={75} size="sm" colorScheme="blue" mt={3} borderRadius="full" />
                    <Button 
                      size="sm" 
                      mt={3} 
                      colorScheme="red" 
                      onClick={cancelNavigation}
                      width="100%"
                    >
                      🛑 Cancelar Navegación
                    </Button>
                  </CardBody>
                </Card>
              )}

              {/* Hospital List */}
              <Box>
                <HStack justify="space-between" mb={3}>
                  <Text fontWeight="bold" color="gray.800">🏥 Hospitales Disponibles</Text>
                  <Button size="sm" onClick={refreshHospitals} isDisabled={!wsConnected} variant="outline">
                    🔄
                  </Button>
                </HStack>
                
                <VStack spacing={2} align="stretch" maxH="300px" overflowY="auto">
                  {hospitals.filter(h => h.connected).map(hospital => (
                    <Card 
                      key={hospital.id} 
                      bg={selectedHospital === hospital.id ? "blue.50" : "white"}
                      border="1px"
                      borderColor={selectedHospital === hospital.id ? "blue.200" : "gray.200"}
                      cursor="pointer"
                      onClick={() => setSelectedHospital(hospital.id)}
                      _hover={{ borderColor: "blue.300", transform: 'translateY(-1px)' }}
                      transition="all 0.2s"
                    >
                      <CardBody p={3}>
                        <HStack justify="space-between">
                          <VStack align="start" spacing={0} flex={1}>
                            <Text fontWeight="bold" fontSize="sm" color="gray.800">{hospital.nombre}</Text>
                            <Text fontSize="xs" color="gray.600" noOfLines={1}>
                              {hospital.direccion}
                            </Text>
                          </VStack>
                          <Badge colorScheme="green" fontSize="2xs">
                            {hospital.camasDisponibles || 0} camas
                          </Badge>
                        </HStack>
                        {hospital.especialidades?.length > 0 && (
                          <Text fontSize="2xs" color="gray.500" mt={1}>
                            {hospital.especialidades.slice(0, 2).join(', ')}
                          </Text>
                        )}
                      </CardBody>
                    </Card>
                  ))}
                  
                  {hospitals.filter(h => h.connected).length === 0 && (
                    <Text textAlign="center" color="gray.500" py={4} fontSize="sm">
                      {wsConnected ? 'No hay hospitales disponibles' : 'Conecte el sistema para ver hospitales'}
                    </Text>
                  )}
                </VStack>
              </Box>

              {/* Quick Actions */}
              <VStack spacing={2}>
                <Button 
                  width="100%" 
                  colorScheme="blue" 
                  onClick={toggleTraffic}
                  leftIcon={<Text>🚦</Text>}
                  variant={trafficEnabled ? "solid" : "outline"}
                >
                  {trafficEnabled ? 'Ocultar Tráfico' : 'Mostrar Tráfico'}
                </Button>
                <Button 
                  width="100%" 
                  colorScheme="teal" 
                  onClick={() => {
                    if (pos) {
                      map.current.flyTo({
                        center: [pos.lng, pos.lat],
                        zoom: 16,
                        bearing: heading,
                        pitch: 45,
                        duration: 1000
                      });
                    }
                  }}
                  leftIcon={<Text>🎯</Text>}
                  variant="outline"
                >
                  Centrar en Mi Posición
                </Button>
              </VStack>
            </VStack>
          </Box>

          {/* Map */}
          <Box flex={1} position="relative">
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
            
            {/* Hospital Notification */}
            {hospitalNotification && (
              <Box
                position="absolute"
                top="20px"
                right="20px"
                bg={hospitalNotification.type === 'accepted' ? "green.500" : 
                    hospitalNotification.type === 'rejected' ? "red.500" : "orange.500"}
                color="white"
                p={4}
                borderRadius="md"
                boxShadow="xl"
                maxWidth="400px"
                zIndex="1000"
              >
                <Alert status={hospitalNotification.type === 'accepted' ? 'success' : 
                              hospitalNotification.type === 'rejected' ? 'error' : 'warning'}>
                  <AlertIcon />
                  <Box>
                    <AlertTitle fontSize="md">
                      {hospitalNotification.type === 'accepted' ? 'Paciente Aceptado' :
                       hospitalNotification.type === 'rejected' ? 'Paciente Rechazado' : 'Esperando Confirmación'}
                    </AlertTitle>
                    <AlertDescription fontSize="sm">
                      {hospitalNotification.message}
                    </AlertDescription>
                  </Box>
                </Alert>
              </Box>
            )}

            {/* Route Info Overlay */}
            {routeInfo && (
              <Box
                position="absolute"
                top="20px"
                left="20px"
                bg="white"
                color="gray.800"
                p={4}
                borderRadius="md"
                boxShadow="xl"
                border="1px"
                borderColor="gray.200"
                zIndex="1000"
                minWidth="300px"
              >
                <Text fontWeight="bold" mb={2} color="blue.600">🚑 Navegación Activa</Text>
                <VStack align="start" spacing={1}>
                  <Text fontSize="sm"><strong>🏥 Destino:</strong> {routeInfo.hospital}</Text>
                  <Text fontSize="sm"><strong>📏 Distancia:</strong> {routeInfo.distance} km</Text>
                  <Text fontSize="sm"><strong>🕐 Tiempo:</strong> {routeInfo.duration} min</Text>
                  <Progress 
                    value={65} 
                    size="sm" 
                    width="100%" 
                    colorScheme="blue" 
                    mt={2}
                    borderRadius="full"
                  />
                </VStack>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* Emergency Form Modal */}
      <Modal isOpen={isFormOpen} onClose={onFormClose} size="2xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader bg="red.600" color="white" borderBottomRadius="0">
            🚨 Reporte de Emergencia - Sistema de Ambulancias
          </ModalHeader>
          <ModalBody py={6}>
            <VStack spacing={6} align="stretch">
              {/* Patient Information */}
              <Box>
                <Text fontWeight="bold" mb={3} color="gray.800" fontSize="lg">Información del Paciente</Text>
                <HStack spacing={4}>
                  <Input
                    placeholder="Edad del paciente"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    type="number"
                    size="lg"
                  />
                  <Select
                    placeholder="Sexo"
                    value={sex}
                    onChange={(e) => setSex(e.target.value)}
                    size="lg"
                  >
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="O">Otro</option>
                  </Select>
                  <Input
                    placeholder="Tipo de emergencia"
                    value={emergencyType}
                    onChange={(e) => setEmergencyType(e.target.value)}
                    size="lg"
                  />
                </HStack>
              </Box>

              {/* Address Search */}
              <Box>
                <Text fontWeight="bold" mb={3} color="gray.800" fontSize="lg">Ubicación de la Emergencia</Text>
                <VStack spacing={3}>
                  <InputGroup size="lg">
                    <Input
                      placeholder="Buscar dirección en Morelia..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (e.target.value.length >= 3) {
                          searchAddresses();
                        } else {
                          setSearchResults([]);
                        }
                      }}
                    />
                    <InputRightElement>
                      {isSearching ? (
                        <Spinner size="sm" />
                      ) : searchQuery ? (
                        <IconButton
                          aria-label="Clear search"
                          icon={<CloseIcon />}
                          size="sm"
                          variant="ghost"
                          onClick={clearSearch}
                        />
                      ) : (
                        <SearchIcon color="gray.400" />
                      )}
                    </InputRightElement>
                  </InputGroup>
                  
                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <Card width="100%" maxH="200px" overflowY="auto">
                      <CardBody p={0}>
                        <List spacing={0}>
                          {searchResults.map((result, index) => (
                            <ListItem 
                              key={result.id}
                              p={3}
                              borderBottom="1px"
                              borderColor="gray.100"
                              cursor="pointer"
                              _hover={{ bg: "blue.50" }}
                              onClick={() => selectSearchResult(result)}
                            >
                              <VStack align="start" spacing={0}>
                                <Text fontSize="sm" fontWeight="medium">{result.place_name}</Text>
                                <Text fontSize="xs" color="gray.500">
                                  {result.type === 'address' ? 'Dirección exacta' : 'Lugar de interés'}
                                </Text>
                              </VStack>
                            </ListItem>
                          ))}
                        </List>
                      </CardBody>
                    </Card>
                  )}
                  
                  {selectedLocation && (
                    <Alert status="info" borderRadius="md">
                      <AlertIcon />
                      <Box>
                        <AlertTitle fontSize="sm">Ubicación seleccionada</AlertTitle>
                        <AlertDescription fontSize="xs">
                          {searchQuery}
                        </AlertDescription>
                      </Box>
                    </Alert>
                  )}
                </VStack>
              </Box>

              {/* Hospital Selection */}
              <Box>
                <Text fontWeight="bold" mb={3} color="gray.800" fontSize="lg">Seleccionar Hospital Destino</Text>
                {hospitals.filter(h => h.connected).length === 0 ? (
                  <Alert status="warning" borderRadius="md">
                    <AlertIcon />
                    No hay hospitales disponibles
                  </Alert>
                ) : (
                  <VStack spacing={2} maxH="200px" overflowY="auto">
                    {hospitals.filter(h => h.connected).map(hospital => (
                      <Card
                        key={hospital.id}
                        bg={selectedHospital === hospital.id ? "blue.50" : "white"}
                        border="1px"
                        borderColor={selectedHospital === hospital.id ? "blue.200" : "gray.200"}
                        cursor="pointer"
                        onClick={() => setSelectedHospital(hospital.id)}
                        width="100%"
                        _hover={{ borderColor: "blue.300" }}
                      >
                        <CardBody p={3}>
                          <HStack justify="space-between">
                            <VStack align="start" spacing={0}>
                              <Text fontWeight="bold" fontSize="sm">{hospital.nombre}</Text>
                              <Text fontSize="xs" color="gray.600" noOfLines={1}>
                                {hospital.direccion}
                              </Text>
                            </VStack>
                            <Badge colorScheme="green" fontSize="2xs">
                              {hospital.camasDisponibles || 0} camas
                            </Badge>
                          </HStack>
                        </CardBody>
                      </Card>
                    ))}
                  </VStack>
                )}
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onFormClose} size="lg">
              Cancelar
            </Button>
            <Button 
              colorScheme="red" 
              onClick={startEmergency}
              isDisabled={!selectedHospital || !age || !sex || !emergencyType}
              size="lg"
              fontSize="md"
              fontWeight="bold"
            >
              🚑 Confirmar y Trazar Ruta
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </ChakraProvider>
  );
}

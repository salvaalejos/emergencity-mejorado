import React, { useEffect, useState, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas'; // Asegúrate de tenerlo instalado: npm install html2canvas

// IMPORTS DE CHAKRA UI PARA EL MODAL VISUAL
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
  Card,
  CardBody,
  SimpleGrid,
  Divider,
  Tag,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  useToast
} from "@chakra-ui/react";

const ReportesPage = () => {
  // --- ESTADOS Y REFS ---
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Estado para el modal visual
  const { 
    isOpen: isReportModalOpen, 
    onOpen: onReportModalOpen, 
    onClose: onReportModalClose 
  } = useDisclosure();
  
  const [selectedReport, setSelectedReport] = useState(null);
  const reportRef = useRef(null); // Referencia para imprimir el modal
  const toast = useToast();

  // ID del Doctor (Simulado o traído de Login)
  const doctorId = "doc_1"; 

  // 1. CARGAR REPORTES HISTÓRICOS (API)
  useEffect(() => {
    const fetchReports = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/reporte-prehospitalario/'); // Ajusta tu endpoint si es necesario
        if (!response.ok) throw new Error('Error al cargar historial');
        const data = await response.json();
        setReports(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  // 2. CONEXIÓN WEBSOCKET (TIEMPO REAL)
  useEffect(() => {
    // Asegúrate que el puerto sea el correcto (3002)
    const ws = new WebSocket('ws://localhost:3002/ws');

    ws.onopen = () => {
        console.log(`✅ [DOCTOR] Conectado al socket. Soy el ID: "${doctorId}"`);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // LOG PARA VER TODO LO QUE LLEGA (Borrar luego de arreglar)
        console.log("📩 [DOCTOR] Mensaje recibido:", data.type, data);

        if (data.type === 'asignar_paciente_doctor') {
            
            // LOG DE COMPARACIÓN DE IDS
            console.log(`🕵️ Comparando IDs: Recibido "${data.targetDoctorId}" vs Mío "${doctorId}"`);

            // COMPARACIÓN FLEXIBLE (String vs Number)
            // Usamos String() en ambos lados para asegurar que "5" sea igual a 5
            if (String(data.targetDoctorId) === String(doctorId)) {
                
                console.log("🚨 ¡MATCH! ES PARA MÍ.");
                
                // A. Actualizar tabla
                setReports(prev => [data.reporte, ...prev]);
                
                // B. Modal y Alerta
                setSelectedReport(data.reporte);
                toast({
                    title: "🚨 ¡NUEVO PACIENTE ASIGNADO!",
                    description: `Paciente: ${data.reporte.paciente.nombre}`,
                    status: "warning",
                    duration: 9000,
                    isClosable: true,
                    position: "top-right"
                });
                onReportModalOpen();
            } else {
                console.log("⛔ Ignorando mensaje: No es para mi ID.");
            }
        }
      } catch (err) {
        console.error("Error socket:", err);
      }
    };

    return () => ws.close();
  }, [doctorId]);

  // 3. FUNCIÓN PARA GENERAR PDF VISUAL (Igual que en el Hospital)
  const generarPDFVisual = async () => {
    const input = reportRef.current;
    if (!input) return;

    try {
      // 1. Captura
      const canvas = await html2canvas(input, { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#ffffff',
        windowWidth: input.scrollWidth,
        windowHeight: input.scrollHeight
      });

      // 2. PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width; 
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
      }
      
      pdf.save(`Expediente_${selectedReport?.paciente?.nombre || 'Paciente'}.pdf`);
      
      toast({ title: "Expediente descargado", status: "success", duration: 2000 });

    } catch (error) {
      console.error("Error PDF:", error);
    }
  };

  // Función auxiliar para abrir modal desde la tabla
  const verDetalles = (reporte) => {
      setSelectedReport(reporte);
      onReportModalOpen();
  };

  // --- RENDER ---
  return (
    <ChakraProvider>
      <div className="p-6 bg-white dark:bg-gray-800 rounded shadow overflow-x-auto min-h-screen">
        <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Panel Médico - Pacientes Asignados</h1>
            <Badge colorScheme="green" p={2} borderRadius="md">Doctor ID: {doctorId}</Badge>
        </div>

        {/* TABLA DE REPORTES */}
        {loading ? <Text>Cargando pacientes...</Text> : (
            <table className="min-w-full bg-white dark:bg-gray-700 border border-gray-200">
            <thead className="bg-gray-100 dark:bg-gray-600">
                <tr>
                <th className="py-3 px-4 border-b text-left">Hora</th>
                <th className="py-3 px-4 border-b text-left">Paciente</th>
                <th className="py-3 px-4 border-b text-left">Edad/Sexo</th>
                <th className="py-3 px-4 border-b text-left">Motivo</th>
                <th className="py-3 px-4 border-b text-left">Prioridad</th>
                <th className="py-3 px-4 border-b text-center">Acciones</th>
                </tr>
            </thead>
            <tbody>
                {reports.length === 0 ? (
                    <tr><td colSpan="6" className="p-4 text-center">Sin asignaciones pendientes.</td></tr>
                ) : reports.map((report, idx) => (
                <tr key={idx} className="hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors">
                    <td className="py-2 px-4 border-b text-sm">
                        {report.hora_estimada_llegada ? new Date(report.hora_estimada_llegada).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A'}
                    </td>
                    <td className="py-2 px-4 border-b font-medium">{report.paciente?.nombre || 'Desconocido'}</td>
                    <td className="py-2 px-4 border-b text-sm">{report.paciente?.edad} / {report.paciente?.sexo}</td>
                    <td className="py-2 px-4 border-b text-sm truncate max-w-[150px]">{report.paciente?.motivo_urgencia}</td>
                    <td className="py-2 px-4 border-b">
                        <Badge bg={report.codigo_prioridad_color || 'gray.400'} color="white">
                            {report.codigo_prioridad || 'TRIAGE'}
                        </Badge>
                    </td>
                    <td className="py-2 px-4 border-b text-center">
                    <Button 
                        size="sm" 
                        colorScheme="blue" 
                        variant="outline"
                        onClick={() => verDetalles(report)}
                    >
                        Ver Expediente
                    </Button>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        )}

        {/* ================================================================= */}
        {/* MODAL DE REPORTE MÉDICO (Copia Exacta del Hospital)               */}
        {/* ================================================================= */}
        <Modal isOpen={isReportModalOpen} onClose={onReportModalClose} size="xl" scrollBehavior="inside">
            <ModalOverlay backdropFilter="blur(5px)" />
            <ModalContent borderTop="5px solid #3182ce" maxW="800px"> {/* Un poco más ancho para el doctor */}
            <ModalHeader display="flex" justifyContent="space-between" alignItems="center" bg="gray.50">
                <HStack>
                <Text>📋 Expediente Clínico de Ingreso</Text>
                {selectedReport?.codigo_prioridad_color && (
                    <Badge bg={selectedReport.codigo_prioridad_color} color="white" px={3} py={1} borderRadius="full">
                    {selectedReport.codigo_prioridad || 'TRIAGE'}
                    </Badge>
                )}
                </HStack>
                <Badge fontSize="0.8em" colorScheme="purple">
                🚑 {selectedReport?.id_ambulancia || 'S/N'}
                </Badge>
            </ModalHeader>
            
            <ModalBody py={4} bg="gray.50">
                {/* DIV REF PARA IMPRESIÓN */}
                <div ref={reportRef} style={{ padding: '30px', background: 'white', minHeight: '100%' }}> 
                
                {selectedReport && (
                    <VStack spacing={5} align="stretch">
                    
                    {/* ENCABEZADO DE DOCUMENTO (Solo visible al imprimir o en modal) */}
                    <Box borderBottom="2px solid #3182ce" pb={2} mb={2}>
                        <Text fontSize="2xl" fontWeight="bold" color="#2c5282">EMERGENCITY MORELIA</Text>
                        <Text fontSize="sm" color="gray.500">Reporte de Atención Prehospitalaria • Fecha: {new Date().toLocaleDateString()}</Text>
                    </Box>

                    {/* SECCIÓN 1: DATOS DEL PACIENTE */}
                    <Card variant="outline" bg="white" borderColor="gray.200">
                        <CardBody>
                        <Text fontWeight="bold" mb={3} color="blue.600" borderBottom="1px solid #eee" pb={2}>
                            👤 Identificación del Paciente
                        </Text>
                        <SimpleGrid columns={2} spacing={4}>
                            <Box>
                            <Text fontSize="xs" color="gray.500">Nombre Completo</Text>
                            <Text fontWeight="semibold" fontSize="lg">{selectedReport.paciente?.nombre || 'Desconocido'}</Text>
                            </Box>
                            <HStack spacing={8}>
                            <Box>
                                <Text fontSize="xs" color="gray.500">Edad</Text>
                                <Text fontWeight="semibold">{selectedReport.paciente?.edad} años</Text>
                            </Box>
                            <Box>
                                <Text fontSize="xs" color="gray.500">Sexo</Text>
                                <Text fontWeight="semibold">{selectedReport.paciente?.sexo}</Text>
                            </Box>
                            </HStack>
                        </SimpleGrid>
                        </CardBody>
                    </Card>

                    {/* SECCIÓN 2: SIGNOS VITALES */}
                    <Box>
                        <Text fontWeight="bold" mb={2} color="red.600">❤️ Signos Vitales (Iniciales)</Text>
                        <SimpleGrid columns={[2, 4]} spacing={3}>
                            <Box bg="red.50" p={2} borderRadius="md" border="1px solid" borderColor="red.100" textAlign="center">
                                <Text fontSize="xs" color="gray.600">F. Cardíaca</Text>
                                <Text fontWeight="bold" fontSize="xl" color="red.700">
                                {selectedReport.signos_vitales?.frecuencia_cardiaca || '--'}
                                </Text>
                                <Text fontSize="xs">bpm</Text>
                            </Box>
                            <Box bg="blue.50" p={2} borderRadius="md" border="1px solid" borderColor="blue.100" textAlign="center">
                                <Text fontSize="xs" color="gray.600">SpO2</Text>
                                <Text fontWeight="bold" fontSize="xl" color="blue.700">
                                {selectedReport.signos_vitales?.saturacion_oxigeno || '--'}
                                </Text>
                                <Text fontSize="xs">%</Text>
                            </Box>
                            <Box bg="purple.50" p={2} borderRadius="md" border="1px solid" borderColor="purple.100" textAlign="center">
                                <Text fontSize="xs" color="gray.600">T/A</Text>
                                <Text fontWeight="bold" fontSize="lg" color="purple.700">
                                {selectedReport.signos_vitales?.tension_arterial || '--'}
                                </Text>
                                <Text fontSize="xs">mmHg</Text>
                            </Box>
                            <Box bg="orange.50" p={2} borderRadius="md" border="1px solid" borderColor="orange.100" textAlign="center">
                                <Text fontSize="xs" color="gray.600">Glucosa</Text>
                                <Text fontWeight="bold" fontSize="lg" color="orange.700">
                                {selectedReport.signos_vitales?.nivel_glucosa || '--'}
                                </Text>
                                <Text fontSize="xs">mg/dL</Text>
                            </Box>
                        </SimpleGrid>
                    </Box>

                    {/* SECCIÓN 3: DETALLES CLÍNICOS */}
                    <Card variant="outline" bg="white">
                        <CardBody>
                        <Text fontWeight="bold" mb={3} color="blue.600" borderBottom="1px solid #eee" pb={2}>
                            🚑 Evaluación Clínica y de Escena
                        </Text>
                        <VStack align="start" spacing={4}>
                            <Box width="100%">
                                <Text fontSize="xs" color="gray.500" fontWeight="bold">MOTIVO DE URGENCIA</Text>
                                <Text fontSize="md">{selectedReport.paciente?.motivo_urgencia}</Text>
                            </Box>
                            
                            <SimpleGrid columns={2} spacing={4} width="100%">
                                <Box>
                                <Text fontSize="xs" color="gray.500">Mecanismo de Lesión / Tipo</Text>
                                <Tag size="md" colorScheme="orange" mt={1}>{selectedReport.paciente?.tipo_accidente || 'No especificado'}</Tag>
                                </Box>
                                <Box>
                                    <Text fontSize="xs" color="gray.500">Ubicación del Incidente</Text>
                                    <Text fontSize="sm">{selectedReport.ubicacion_actual || selectedReport.paciente?.lugar}</Text>
                                </Box>
                            </SimpleGrid>

                            <Box width="100%" bg="gray.50" p={3} borderRadius="md" borderLeft="4px solid #ecc94b">
                                <Text fontSize="xs" color="gray.500" fontWeight="bold">DESCRIPCIÓN DE LESIONES / HALLAZGOS</Text>
                                <Text fontSize="sm" mt={1}>
                                {selectedReport.paciente?.descripcion_lesion || 'Sin descripción detallada.'}
                                </Text>
                            </Box>
                        </VStack>
                        </CardBody>
                    </Card>

                    {/* SECCIÓN 4: INTERVENCIONES */}
                    <Box>
                        <Text fontWeight="bold" mb={2} color="teal.600">💉 Intervenciones Realizadas</Text>
                        {selectedReport.intervenciones?.length > 0 ? (
                            <VStack align="start" spacing={2}>
                                {selectedReport.intervenciones.map((iv, idx) => (
                                <Box key={idx} p={2} border="1px solid #e2e8f0" borderRadius="md" width="100%" bg="teal.50">
                                    <HStack justify="space-between">
                                        <Text fontWeight="bold" fontSize="sm" color="teal.800">{iv.tipo_intervencion}</Text>
                                        <Badge variant="outline" colorScheme="teal">{iv.hora_intervencion || 'S/H'}</Badge>
                                    </HStack>
                                    <Text fontSize="xs" color="gray.600" mt={1}>{iv.descripcion}</Text>
                                </Box>
                                ))}
                            </VStack>
                        ) : <Text fontSize="sm" color="gray.500" fontStyle="italic">No se registraron intervenciones prehospitalarias.</Text>}
                    </Box>

                    {/* OBSERVACIONES FINALES */}
                    <Box>
                        <Text fontSize="sm" fontWeight="bold">Observaciones Adicionales:</Text>
                        <Text fontSize="sm" mt={1} p={2} border="1px dashed gray" borderRadius="md">
                            {selectedReport.paciente?.observaciones || 'Ninguna.'}
                        </Text>
                    </Box>

                    </VStack>
                )}
                </div>
            </ModalBody>

            <ModalFooter bg="gray.100">
                <Button variant="ghost" mr={3} onClick={onReportModalClose}>
                Cerrar Vista
                </Button>
                <Button colorScheme="blue" onClick={generarPDFVisual} leftIcon={<Text>🖨️</Text>}>
                Descargar Expediente PDF
                </Button>
            </ModalFooter>
            </ModalContent>
        </Modal>

      </div>
    </ChakraProvider>
  );
};

export default ReportesPage;
import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, Clock, 
  GraduationCap, Trash2, X, CheckCircle, Bell, Edit2, LayoutList, 
  LayoutGrid, Columns, CalendarDays, Menu, Sparkles, NotebookText
} from 'lucide-react';

// --- IMPORTS DE FIREBASE ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, doc, addDoc, updateDoc, deleteDoc, onSnapshot, 
  collection, query, where, orderBy 
} from 'firebase/firestore';

// --- MAPA ESTÁTICO DE COLORES ---
const COLOR_MAP = {
    exam: { bg: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100', solid: 'bg-red-500' },
    assignment: { bg: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100', solid: 'bg-amber-500' },
    study: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100', solid: 'bg-emerald-500' },
    lecture: { bg: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100', solid: 'bg-blue-500' }
};

// --- CONFIGURACIÓN E INICIALIZACIÓN DE FIREBASE ---
let db = null;
let auth = null;
let appId = null;
let firebaseConfig = null;

// Asegurar que las variables globales existan
if (typeof __firebase_config !== 'undefined' && typeof __app_id !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
    // Sanitize __app_id to remove slashes, which break Firestore document paths.
    appId = __app_id.replace(/[^a-zA-Z0-9_-]/g, '_'); 
    
    // Inicializar app y servicios (se hace fuera del componente)
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
}


// --- Componente Principal ---
export default function App() {
  // --- Estados ---
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); 
  const [events, setEvents] = useState([]); // Ahora cargado desde Firestore
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notifiedEvents, setNotifiedEvents] = useState(new Set());
  const [draggedEvent, setDraggedEvent] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userId, setUserId] = useState(null); // ID del usuario autenticado
  const [isLoading, setIsLoading] = useState(true); // Control de carga inicial

  // Estados para Gemini API
  const [geminiResult, setGeminiResult] = useState(null);
  const [isGeminiLoading, setIsGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState(null);
  const [showInAppAlert, setShowInAppAlert] = useState(null); // Nueva alerta en pantalla
  
  const [newEvent, setNewEvent] = useState({
    title: '', type: 'lecture', time: '08:00', description: ''
  });

  // --- Gemini API Call Function ---
  const callGeminiApi = async (prompt, systemPrompt, tool = false) => {
    setIsGeminiLoading(true);
    setGeminiResult(null);
    setGeminiError(null);
    const apiKey = ""; // Canvas will provide this

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools: tool ? [{ "google_search": {} }] : undefined,
    };
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    let result = null;
    let success = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts && !success) {
      attempts++;
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        
        result = data.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo generar una respuesta clara.";
        success = true;

      } catch (error) {
        console.error(`Attempt ${attempts} failed:`, error);
        if (attempts < maxAttempts) {
          const delay = Math.pow(2, attempts) * 1000; // Exponential backoff
          await new Promise(res => setTimeout(res, delay));
        } else {
          setGeminiError("Error al conectar con la IA. Inténtalo de nuevo.");
        }
      }
    }

    setIsGeminiLoading(false);
    if (success) {
      setGeminiResult(result);
    }
  };

  // --- Funciones Gemini ---

  const handleGenerateStudyPlan = async () => {
    const title = newEvent.title;
    const description = newEvent.description || "Sin descripción adicional.";
    const dueDate = selectedDate;
    const type = newEvent.type;

    if (!title || type === 'lecture') {
        setGeminiError("Introduce el título y asegúrate que sea Examen o Entrega.");
        return;
    }
    
    const prompt = `Actúa como un tutor universitario. Genera un plan de estudio conciso para un estudiante de análisis y desarrollo de software o ingeniería industrial.
    Tarea: ${title} (${type})
    Fecha de Vencimiento: ${dueDate}
    Notas Adicionales: ${description}
    
    El plan debe incluir: 1. Tres (3) temas clave o conceptos a repasar. 2. Una sugerencia de formato de estudio (ej. crear flashcards, resolver problemas). 3. Un consejo de gestión del tiempo. Usa emojis. Responde en español.`;

    const systemPrompt = "Eres un asistente de planificación de estudios (Planificador de Tiempo). Debes ser útil, motivador y preciso. Responde siempre en formato Markdown y no uses encabezados (##).";

    await callGeminiApi(prompt, systemPrompt, false);
  };

  const handleAnalyzeNotes = async () => {
    const notes = newEvent.description;
    const title = newEvent.title;

    if (!notes) {
      setGeminiError("Ingresa notas o una descripción antes de analizar.");
      return;
    }

    const prompt = `Analiza el siguiente texto de notas para una actividad universitaria: "${notes}".
    Genera un resumen de 3 puntos clave y sugiere un término académico relacionado que el estudiante debería investigar más.
    La actividad se llama: ${title}`;

    const systemPrompt = "Eres un asistente de análisis académico. Tu objetivo es clarificar conceptos. Responde en español en formato Markdown conciso, con listas y emojis. Usa Google Search para mejorar la respuesta.";

    await callGeminiApi(prompt, systemPrompt, true); // Usamos Google Search para contextualizar
  }


  // --- 1. EFECTO DE AUTENTICACIÓN Y CONEXIÓN INICIAL ---
  useEffect(() => {
    if (!db || !auth) {
        console.error("Firebase no está inicializado. ¿Faltan __firebase_config o __app_id?");
        return;
    }

    const signInAndListen = async () => {
        try {
            // 1. AUTENTICACIÓN
            if (typeof __initial_auth_token !== 'undefined') {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }

            // 2. OBTENER USER ID Y ESTABLECER ESTADO
            const currentUser = auth.currentUser;
            if (currentUser) {
                setUserId(currentUser.uid);
            } else {
                // Generar un ID temporal si falla la autenticación (no ideal, pero funcional)
                setUserId(crypto.randomUUID());
            }

        } catch (error) {
            console.error("Error al autenticar o inicializar Firebase:", error);
            setUserId(crypto.randomUUID()); // Fallback
        } finally {
            setIsLoading(false);
        }
    };

    signInAndListen();
  }, []);

  // --- 2. EFECTO DE LECTURA DE DATOS (onSnapshot) ---
  useEffect(() => {
    if (!db || !userId) return; // Esperar a que la DB esté lista y el usuario autenticado

    // RUTA DE LA COLECCIÓN: /artifacts/{appId}/users/{userId}/events
    const eventsCollectionRef = collection(db, 'artifacts', appId, 'users', userId, 'events');
    
    // Consulta simple (sin ordenar, se ordenará en memoria para evitar problemas de índice)
    const eventsQuery = query(eventsCollectionRef); 

    // Escuchar cambios en tiempo real
    const unsubscribe = onSnapshot(eventsQuery, (snapshot) => {
      const fetchedEvents = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id, // Firestore ID
        // Asegurar que el id de notificacion sea el de Firestore
        notificationId: doc.id 
      }));
      setEvents(fetchedEvents);
    }, (error) => {
      console.error("Error al escuchar eventos de Firestore:", error);
    });

    // Limpiar el listener al desmontar el componente
    return () => unsubscribe();
  }, [userId]); // Depende del userId para iniciar después de la autenticación

  // --- 3. SISTEMA DE RECORDATORIOS (FIABILIDAD MEJORADA) ---
  useEffect(() => {
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }

    const checkReminders = () => {
      const now = new Date();
      const twoHours = 7200000; 
      
      // Ampliamos la ventana de chequeo: desde 1h 50min hasta 2h 10min
      const lowerBound = twoHours - 10 * 60 * 1000; 
      const upperBound = twoHours + 10 * 60 * 1000; 

      let upcomingAlert = null;

      events.forEach(event => {
        // Asegurar que estamos comparando fechas válidas
        const eventDate = new Date(event.date + 'T' + event.time);
        
        // Corregir posible evento inválido o pasado
        if (isNaN(eventDate) || eventDate < now) return; 

        const timeDiff = eventDate - now; 

        if (timeDiff > 0 && timeDiff >= lowerBound && timeDiff <= upperBound && !notifiedEvents.has(event.id)) {
            
            const message = `🚨 ${event.title} - ¡Faltan 2 horas o menos! (${event.time} de hoy)`;
            
            // 1. Notificación NATIVA del sistema (falla si la PWA está en segundo plano)
            if (Notification.permission === 'granted') {
                new Notification('UniPlanner: Próxima Actividad', {
                    body: message,
                    icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iaW5kaWdvIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTggNlY0TDIgMTAuNUgxNkwxMiAxNiI+PC9wYXRoPjwvc3ZnPg=='
                });
            }
            
            // 2. Notificación IN-APP (Toast)
            addNotification(message);
            
            // 3. Alerta Persistente en pantalla (Garantiza que el usuario la vea al abrir la app)
            upcomingAlert = { title: event.title, date: event.date, time: event.time };

            setNotifiedEvents(prev => new Set(prev).add(event.id));
        }
      });
      
      // Mostrar la alerta persistente si se encontró un evento próximo
      if (upcomingAlert) {
        setShowInAppAlert(upcomingAlert);
      }
    };
    
    // Chequeo más frecuente para mayor fiabilidad
    const interval = setInterval(checkReminders, 10000); 
    
    // Ejecutar el chequeo inmediatamente al cargar el componente o al volver a abrir la PWA
    checkReminders(); 
    
    return () => clearInterval(interval);
  }, [events, notifiedEvents]);

  // --- LÓGICA DE FIREBASE (CRUD) ---

  const getEventsCollectionRef = () => {
    if (!db || !userId || !appId) return null;
    return collection(db, 'artifacts', appId, 'users', userId, 'events');
  };

  // Guardar (Crear o Actualizar)
  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (!newEvent.title || !selectedDate || !userId) return;

    const eventsRef = getEventsCollectionRef();
    if (!eventsRef) return;
    
    const eventData = { ...newEvent, date: selectedDate };

    try {
        if (editingId) {
            // --- ACTUALIZAR existente ---
            const eventDocRef = doc(eventsRef, editingId);
            await updateDoc(eventDocRef, eventData);
            addNotification('Actividad actualizada correctamente');
        } else {
            // --- CREAR nuevo ---
            await addDoc(eventsRef, eventData);
            addNotification('Actividad creada exitosamente');
        }
    } catch (error) {
        console.error("Error al guardar en Firestore:", error);
        addNotification('ERROR al guardar en la nube.');
    } finally {
        closeModal();
    }
  };

  // Eliminar
  const handleDeleteEvent = async (e, id) => {
    // IMPORTANTE: Detener propagación inmediatamente para no abrir el modal de edición
    if (e && e.stopPropagation) e.stopPropagation();
    if (e && e.preventDefault) e.preventDefault();
    
    if (!userId) return;

    const isConfirmed = window.confirm('¿Estás seguro de eliminar esta actividad?');
    if (isConfirmed) {
        const eventsRef = getEventsCollectionRef();
        if (!eventsRef) return;

        try {
            const eventDocRef = doc(eventsRef, id);
            await deleteDoc(eventDocRef);
            if (editingId === id) closeModal();
            addNotification('Eliminado de la nube.');
        } catch (error) {
            console.error("Error al eliminar de Firestore:", error);
            addNotification('ERROR al eliminar de la nube.');
        }
    }
  };
  
  // Drag & Drop (solo cambia la fecha)
  const handleDrop = async (e, targetDate) => {
    e.preventDefault();
    if (!draggedEvent || !userId) return;

    const eventsRef = getEventsCollectionRef();
    if (!eventsRef) return;

    try {
        const eventDocRef = doc(eventsRef, draggedEvent.id);
        await updateDoc(eventDocRef, { date: targetDate });
        addNotification(`Movido al ${targetDate}`);
        setDraggedEvent(null);
    } catch (error) {
        console.error("Error al mover en Firestore:", error);
        addNotification('ERROR al mover en la nube.');
    }
  };

  // --- UI Helpers y Funciones Secundarias ---

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    return { days, firstDay };
  };

  const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  };

  const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  const formatDateStr = (date) => {
    return date.toISOString().split('T')[0];
  };
  
  const createDateFromDay = (year, monthIndex, day) => {
      const d = new Date(year, monthIndex, day);
      return formatDateStr(d);
  };

  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') newDate.setMonth(newDate.getMonth() - 1);
    else if (viewMode === 'week') newDate.setDate(newDate.getDate() - 7);
    else if (viewMode === 'day') newDate.setDate(newDate.getDate() - 1);
    else newDate.setMonth(newDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') newDate.setMonth(newDate.getMonth() + 1);
    else if (viewMode === 'week') newDate.setDate(newDate.getDate() + 7);
    else if (viewMode === 'day') newDate.setDate(newDate.getDate() + 1);
    else newDate.setMonth(newDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  const handleDateClick = (dateStr) => {
    resetForm(); 
    setSelectedDate(dateStr);
    setIsModalOpen(true);
  };

  const handleDayViewClick = (year, monthIndex, day) => {
      const date = new Date(year, monthIndex, day);
      setCurrentDate(date);
      setViewMode('day');
  };

  const handleEventDoubleClick = (e, event) => {
    e.stopPropagation(); 
    setEditingId(event.id);
    setSelectedDate(event.date);
    setNewEvent({
      title: event.title,
      type: event.type,
      time: event.time,
      description: event.description || ''
    });
    setIsModalOpen(true);
  };

  const handleDragStart = (e, event) => {
    setDraggedEvent(event);
    e.dataTransfer.effectAllowed = "move";
  };

  // *** FUNCIÓN CORREGIDA: handleDragOver ***
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  // *****************************************


  const addNotification = (message) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  };

  const resetForm = () => {
    setNewEvent({ title: '', type: 'lecture', time: '08:00', description: '' });
    setEditingId(null);
    setGeminiResult(null); // Limpiar resultados de IA al resetear
    setGeminiError(null);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const getTypeColor = (type, isSolid = false) => {
    const colorEntry = COLOR_MAP[type] || { bg: 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-100', solid: 'bg-gray-500' };
    return isSolid ? colorEntry.solid : colorEntry.bg;
  };

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  
  const getDayName = (dayIndex) => {
      const date = new Date(2025, 10, 23 + dayIndex); 
      return date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', ''); 
  };
  const dayNamesShort = [0, 1, 2, 3, 4, 5, 6].map(getDayName); 

  // --- Render Views ---

  // Componente interno para la tarjetita del evento (reutilizable)
  // MEJORA: Botón de eliminar más grande y siempre visible en móvil
  const EventCard = ({ event, showTime = false }) => (
    <div 
      draggable
      onDragStart={(e) => handleDragStart(e, event)}
      onClick={(e) => e.stopPropagation()} 
      onDoubleClick={(e) => handleEventDoubleClick(e, event)}
      className={`
        text-[10px] sm:text-xs px-2 py-1.5 mb-1 rounded cursor-grab active:cursor-grabbing shadow-md border
        flex items-start justify-between group/item transition-all
        ${getTypeColor(event.type)}
      `}
      title="Doble clic para editar"
    >
      <div className="flex flex-col min-w-0 flex-1">
         {showTime && <span className="text-[9px] opacity-70 mb-0.5">{event.time}</span>}
         <span className="line-clamp-2 leading-tight font-medium break-words">
          {event.title}
        </span>
      </div>
      
      {/* CAMBIO CLAVE: 
          - opacity-100 por defecto (siempre visible en móvil) 
          - lg:opacity-0 (oculto por defecto solo en pantallas grandes)
          - lg:group-hover (visible al pasar el mouse en pantallas grandes)
          - p-1.5 (más espacio para el dedo)
          - z-10 (asegura que está por encima)
      */}
      <button 
        onClick={(e) => handleDeleteEvent(e, event.id)}
        className="opacity-100 lg:opacity-0 lg:group-hover/item:opacity-100 ml-1 p-1.5 hover:bg-white/50 rounded text-red-600 transition-opacity shrink-0 self-start z-10"
      >
        <X size={14} strokeWidth={3} />
      </button>
    </div>
  );

  // 1. VISTA MENSUAL
  const renderMonthView = () => {
    const { days, firstDay } = getDaysInMonth(currentDate);
    const daysArray = [...Array(days).keys()].map(i => i + 1);
    const emptySlots = [...Array(firstDay).keys()];

    return (
      <div className="p-4">
        <div className="grid grid-cols-7 mb-2 text-center">
          {dayNamesShort.map(day => (
            <div key={day} className="text-xs font-medium text-gray-500 uppercase tracking-wider py-2">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {emptySlots.map(i => <div key={`empty-${i}`} />)}
          {daysArray.map(day => {
            const monthIndex = currentDate.getMonth();
            const year = currentDate.getFullYear();
            const dateStr = createDateFromDay(year, monthIndex, day);
            const dayEvents = events.filter(e => e.date === dateStr);
            const isToday = formatDateStr(new Date()) === dateStr;
            const hasEvents = dayEvents.length > 0;

            return (
              <div 
                key={day}
                onDragOver={handleDragOver} 
                onDrop={(e) => handleDrop(e, dateStr)}
                onClick={() => hasEvents ? handleDayViewClick(year, monthIndex, day) : handleDateClick(dateStr)}
                className={`
                  min-h-[100px] p-2 rounded-xl border transition-all relative group shadow-sm
                  ${isToday ? 'bg-indigo-100 border-indigo-300' : 'bg-white border-gray-100 hover:border-indigo-200'}
                  ${hasEvents ? 'cursor-pointer hover:bg-indigo-50/70' : 'cursor-pointer hover:bg-gray-50'}
                `}
              >
                <span className={`text-sm font-bold block mb-1 w-6 h-6 flex items-center justify-center rounded-full transition-all 
                  ${isToday ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'}
                `}>
                  {day}
                </span>
                <div className="space-y-1">
                  {dayEvents.map(ev => (
                    <EventCard key={ev.id} event={ev} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 2. VISTA SEMANAL
  const renderWeekView = () => {
    const startOfWeek = getStartOfWeek(currentDate);
    const weekDays = [...Array(7).keys()].map(i => addDays(startOfWeek, i));

    return (
      <div className="p-4 overflow-x-auto">
        <div className="min-w-[800px] grid grid-cols-7 gap-4">
          {weekDays.map((dayDate, i) => {
            const dateStr = formatDateStr(dayDate);
            const dayEvents = events.filter(e => e.date === dateStr).sort((a,b) => a.time.localeCompare(b.time));
            const isToday = formatDateStr(new Date()) === dateStr;
            const dayNameFull = getDayName(dayDate.getDay()); 

            return (
              <div 
                key={i} 
                onDragOver={handleDragOver} 
                onDrop={(e) => handleDrop(e, dateStr)}
                onClick={() => handleDayViewClick(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate())}
                className={`flex flex-col h-[500px] rounded-xl border shadow-lg ${isToday ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-100'} transition-all hover:border-indigo-300 cursor-pointer`}
              >
                <div className={`p-3 text-center border-b ${isToday ? 'border-indigo-200 bg-indigo-100/50' : 'border-gray-100 bg-gray-50'} rounded-t-xl`}>
                  <p className="text-xs text-gray-500 uppercase font-bold">{dayNameFull}</p>
                  <p className={`text-xl font-extrabold ${isToday ? 'text-indigo-700' : 'text-gray-800'}`}>{dayDate.getDate()}</p>
                </div>
                <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                  {dayEvents.map(ev => <EventCard key={ev.id} event={ev} showTime />)}
                  {dayEvents.length === 0 && <p className="text-center text-xs text-gray-300 mt-10">Sin eventos</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 3. VISTA DIARIA
  const renderDayView = () => {
    const dateStr = formatDateStr(currentDate);
    const dayEvents = events.filter(e => e.date === dateStr).sort((a,b) => a.time.localeCompare(b.time));
    const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][currentDate.getDay()];

    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-gray-800">{dayName} {currentDate.getDate()}</h2>
          <p className="text-gray-500">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</p>
        </div>
        
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 min-h-[400px]">
          {dayEvents.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-gray-400 py-20">
               <Clock size={48} className="mb-4 opacity-20"/>
               <p>No tienes actividades para este día.</p>
               <button onClick={() => handleDateClick(dateStr)} className="mt-4 text-indigo-600 font-medium hover:underline">Agregar una actividad</button>
             </div>
          ) : (
            <div className="space-y-4">
               {dayEvents.map(ev => (
                 <div key={ev.id} className="flex gap-4 group hover:shadow-md rounded-xl transition-shadow border border-gray-100" onDoubleClick={(e) => handleEventDoubleClick(e, ev)}>
                    <div className="w-16 text-right pt-2 text-sm text-gray-500 font-bold px-2">{ev.time}</div>
                    <div className={`flex-1 p-4 rounded-r-xl ${getTypeColor(ev.type)} relative`}>
                       <h4 className="font-bold text-gray-800">{ev.title}</h4>
                       <p className="text-sm opacity-90 mt-1">{ev.description || 'Sin descripción'}</p>
                       <button onClick={(e) => handleDeleteEvent(e, ev.id)} className="absolute top-2 right-2 text-red-400 hover:text-red-700 opacity-100 p-2 transition-opacity z-10">
                         <Trash2 size={20} />
                       </button>
                    </div>
                 </div>
               ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // 4. VISTA LISTA
  const renderListView = () => {
    // Ordenar los eventos por fecha/hora
    const sortedEvents = [...events].sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));
    // Mostrar eventos desde la última semana hasta el futuro
    const futureEvents = sortedEvents.filter(e => new Date(e.date) >= new Date(new Date().setDate(new Date().getDate() - 7))); 

    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h3 className="font-bold text-xl text-gray-800 mb-6">Agenda Completa</h3>
        <div className="space-y-3">
          {futureEvents.length === 0 ? (
            <p className="text-center text-gray-400 py-10">No hay eventos próximos.</p>
          ) : futureEvents.map(ev => {
             const dateObj = new Date(ev.date + 'T' + ev.time);
             const isPast = dateObj < new Date();
             
             return (
               <div key={ev.id} className={`flex items-center gap-4 p-4 bg-white rounded-xl border ${isPast ? 'border-gray-100 opacity-60' : 'border-gray-200 shadow-lg'} hover:shadow-xl transition-all group`} onDoubleClick={(e) => handleEventDoubleClick(e, ev)}>
                  <div className={`w-2 h-12 rounded-full ${getTypeColor(ev.type, true)}`}></div> {/* Usar color sólido */}
                  <div className="flex-1">
                    <div className="flex justify-between">
                       <h4 className={`font-extrabold text-lg ${isPast ? 'text-gray-500 line-through' : 'text-gray-800'}`}>{ev.title}</h4>
                       <span className={`text-xs font-bold uppercase p-1 rounded ${getTypeColor(ev.type).split(' ')[0]}`} /* <<-- CORREGIDO */ >{ev.type}</span>
                    </div>
                    <p className="text-sm text-gray-500 flex gap-2">
                       <span>{new Date(ev.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                       <span>•</span>
                       <span>{ev.time}</span>
                    </p>
                  </div>
                  <button onClick={(e) => handleEventDoubleClick(e, ev)} className="p-2 text-gray-400 hover:text-indigo-600 opacity-100"><Edit2 size={20}/></button>
                  <button onClick={(e) => handleDeleteEvent(e, ev.id)} className="p-2 text-gray-400 hover:text-red-600 opacity-100"><Trash2 size={20}/></button>
               </div>
             );
          })}
        </div>
      </div>
    );
  };


  // --- Render Principal ---

  const upcomingEvents = events
    .filter(e => new Date(e.date + 'T' + e.time) >= new Date())
    .sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time))
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 text-slate-800 font-sans pb-8">
      
      {/* Indicador de Carga */}
      {isLoading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-50">
            <svg className="animate-spin h-10 w-10 text-indigo-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-indigo-600 font-bold">Conectando a la nube (Firestore)...</p>
            <p className="text-sm text-gray-500 mt-1">ID de Usuario: {userId ? userId.substring(0, 8) + '...' : 'Cargando'}</p>
        </div>
      )}
      
      {/* Alerta de evento próximo (In-App) */}
      {showInAppAlert && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 p-4 w-full max-w-sm">
            <div className="bg-red-500 text-white rounded-xl shadow-2xl p-4 flex items-center justify-between animate-bounce-in">
                <div className="flex items-center gap-3">
                    <Bell size={24} className="animate-pulse"/>
                    <div>
                        <p className="font-bold text-sm">¡Alarma de Estudio!</p>
                        <p className="text-xs">'{showInAppAlert.title}' es a las {showInAppAlert.time}.</p>
                    </div>
                </div>
                <button onClick={() => setShowInAppAlert(null)} className="p-1 rounded-full hover:bg-white/20">
                    <X size={18} />
                </button>
            </div>
        </div>
      )}


      {/* Toast */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className="bg-gray-800 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-bounce-in pointer-events-auto">
            <Bell size={18} className="text-yellow-400" />
            <span className="text-sm">{n.message}</span>
          </div>
        ))}
      </div>
      
      {/* Sidebar Overlay para Móviles - CORREGIDO */}
      {isSidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setIsSidebarOpen(false)}></div>}

      {/* Header */}
      <header className="bg-white shadow-lg sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            
            {/* Logo y Menu Toggle (Móvil) */}
            <div className="flex items-center gap-4 self-start sm:self-center w-full sm:w-auto">
              <button 
                className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              >
                <Menu size={24} />
              </button>
              <div className="flex items-center gap-2">
                <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-md">
                  <GraduationCap size={24} />
                </div>
                <h1 className="text-xl font-extrabold text-gray-900">UniPlanner</h1>
              </div>
            </div>

            {/* Controles de Vista */}
            <div className="hidden lg:flex bg-gray-100 p-1 rounded-xl shadow-inner">
              <button onClick={() => setViewMode('month')} className={`p-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium ${viewMode === 'month' ? 'bg-white shadow-md text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
                <LayoutGrid size={16} /> <span className="hidden sm:inline">Mes</span>
              </button>
              <button onClick={() => setViewMode('week')} className={`p-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium ${viewMode === 'week' ? 'bg-white shadow-md text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
                <Columns size={16} /> <span className="hidden sm:inline">Semana</span>
              </button>
              <button onClick={() => setViewMode('day')} className={`p-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium ${viewMode === 'day' ? 'bg-white shadow-md text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
                <CalendarDays size={16} /> <span className="hidden sm:inline">Día</span>
              </button>
              <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium ${viewMode === 'list' ? 'bg-white shadow-md text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
                <LayoutList size={16} /> <span className="hidden sm:inline">Agenda</span>
              </button>
            </div>

            {/* Botón Nueva */}
            <button 
              onClick={() => {
                  const today = formatDateStr(new Date());
                  handleDateClick(today);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors text-sm font-bold shadow-lg w-full sm:w-auto justify-center"
            >
              <Plus size={18} />
              <span>Nueva</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Área Principal (Calendario) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden min-h-[600px]">
            {/* Barra de Navegación de Fecha */}
            {viewMode !== 'list' && (
              <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-indigo-50/10">
                <h2 className="text-lg font-bold text-gray-800 capitalize flex items-center gap-2">
                  <CalendarIcon size={20} className="text-indigo-500"/>
                  {viewMode === 'day' 
                    ? `${currentDate.getDate()} de ${monthNames[currentDate.getMonth()]}` 
                    : `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
                </h2>
                <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-0.5 shadow-md">
                  <button onClick={handlePrev} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"><ChevronLeft size={20} /></button>
                  <button onClick={() => setCurrentDate(new Date())} className="px-3 text-xs font-bold text-gray-500 hover:text-indigo-600 hover:bg-gray-50 rounded-lg">Hoy</button>
                  <button onClick={handleNext} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"><ChevronRight size={20} /></button>
                </div>
              </div>
            )}

            {/* Renderizado Condicional de Vistas */}
            {!isLoading && viewMode === 'month' && renderMonthView()}
            {!isLoading && viewMode === 'week' && renderWeekView()}
            {!isLoading && viewMode === 'day' && renderDayView()}
            {!isLoading && viewMode === 'list' && renderListView()}
            
          </div>
        </div>

        {/* Panel Lateral (Sidebar - Visible en desktop, toggle en mobile) */}
        <div className={`fixed inset-y-0 right-0 z-40 w-80 lg:relative lg:w-auto lg:col-span-1 transform transition-transform duration-300 bg-gray-50 border-l border-gray-200 lg:border-none p-4 lg:p-0 space-y-6 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}> 
          
          <div className="flex justify-between items-center lg:hidden pb-3 border-b border-gray-200">
             <h3 className="font-bold text-lg text-gray-800">Menú</h3>
             <button onClick={() => setIsSidebarOpen(false)} className="p-2 rounded-full hover:bg-gray-200 text-gray-600">
                <X size={24} />
             </button>
          </div>
          
          {/* Controles de Vista - Duplicados para el sidebar en móvil */}
          <div className="lg:hidden flex flex-col bg-white p-4 rounded-xl shadow-lg border border-gray-100 space-y-2">
              <h4 className="text-xs font-bold text-gray-500 uppercase">Vistas Rápidas</h4>
              <button onClick={() => {setViewMode('month'); setIsSidebarOpen(false);}} className={`p-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium ${viewMode === 'month' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-700 hover:bg-gray-100'}`}>
                <LayoutGrid size={16} /> Mes
              </button>
              <button onClick={() => {setViewMode('week'); setIsSidebarOpen(false);}} className={`p-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium ${viewMode === 'week' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-700 hover:bg-gray-100'}`}>
                <Columns size={16} /> Semana
              </button>
              <button onClick={() => {setViewMode('day'); setIsSidebarOpen(false);}} className={`p-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium ${viewMode === 'day' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-700 hover:bg-gray-100'}`}>
                <CalendarDays size={16} /> Día
              </button>
              <button onClick={() => {setViewMode('list'); setIsSidebarOpen(false);}} className={`p-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium ${viewMode === 'list' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-700 hover:bg-gray-100'}`}>
                <LayoutList size={16} /> Agenda
              </button>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-5">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <Bell className="text-indigo-600" size={18} />
                <h3 className="font-bold text-gray-800 text-sm">Próximas Entregas</h3>
              </div>
              <p className="text-[10px] text-gray-400">ID: {userId ? userId.substring(0, 8) : 'N/A'}</p>
            </div>
            
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <CheckCircle className="mx-auto mb-2 opacity-30" size={24} />
                <p className="text-xs">¡Libre por ahora!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map(ev => (
                  <div key={ev.id} className="flex gap-3 items-start p-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:bg-white hover:shadow-md transition-all cursor-pointer group" onDoubleClick={(e) => handleEventDoubleClick(e, ev)}>
                    <div className={`mt-1 min-w-[3px] h-8 rounded-full ${getTypeColor(ev.type, true)}`}></div> {/* Usar color sólido */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h4 className="font-semibold text-gray-800 text-xs truncate leading-tight">{ev.title}</h4>
                        <button onClick={(e) => handleDeleteEvent(e, ev.id)} className="text-gray-300 hover:text-red-500 opacity-100 group-hover:opacity-100"><X size={12}/></button>
                      </div>
                      <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                        <Clock size={10} />
                        {new Date(ev.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - {ev.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-5">
            <h3 className="font-bold text-gray-800 mb-3 text-xs uppercase tracking-wider">Leyenda</h3>
            <div className="space-y-2">
              <div className="flex items-center text-xs text-gray-600 gap-2 p-1.5 rounded-lg hover:bg-gray-50">
                <span className="w-3 h-3 rounded-full bg-red-500 shadow-md"></span> Examen
              </div>
              <div className="flex items-center text-xs text-gray-600 gap-2 p-1.5 rounded-lg hover:bg-gray-50">
                <span className="w-3 h-3 rounded-full bg-amber-500 shadow-md"></span> Entrega / Tarea
              </div>
              <div className="flex items-center text-xs text-gray-600 gap-2 p-1.5 rounded-lg hover:bg-gray-50">
                <span className="w-3 h-3 rounded-full bg-blue-500 shadow-md"></span> Clase
              </div>
              <div className="flex items-center text-xs text-gray-600 gap-2 p-1.5 rounded-lg hover:bg-gray-50">
                <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-md"></span> Estudio
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-4 italic text-center">
              Tip: Arrastra para mover. Doble clic para editar.
            </p>
          </div>
        </div>
      </main>

      {/* FOOTER DE VERSIÓN (Nuevo) */}
      <footer className="text-center py-4 text-xs text-gray-300">
        UniPlanner Colombia v1.1
      </footer>

      {/* Modal CRUD */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-fade-in-up scale-100 transition-all"> {/* Aumentado el ancho max-w-lg */}
            <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50/50 rounded-t-2xl">
              <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                {editingId ? <Edit2 size={18} className="text-indigo-600"/> : <Plus size={18} className="text-indigo-600"/>}
                {editingId ? 'Editar Actividad' : 'Nueva Actividad'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 max-h-[80vh] overflow-y-auto">
              {/* Formulario */}
              <form onSubmit={handleSaveEvent} className="space-y-5 border p-4 rounded-xl shadow-inner bg-white">
                <h4 className="text-sm font-bold text-gray-700">Detalles de la Actividad</h4>
                
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Título</label>
                  <input 
                    type="text" 
                    required
                    autoFocus
                    placeholder="Ej. Parcial de Cálculo Diferencial"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none text-sm bg-gray-50 focus:bg-white transition-all"
                    value={newEvent.title}
                    onChange={e => setNewEvent({...newEvent, title: e.target.value})}
                  />
                </div>

                {/* --- NUEVO: SELECTOR DE FECHA --- */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Fecha</label>
                  <input
                    type="date"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none text-sm bg-gray-50 focus:bg-white"
                    value={selectedDate || ''}
                    onChange={e => setSelectedDate(e.target.value)}
                  />
                </div>
                {/* --------------------------------- */}

                <div className="grid grid-cols-2 gap-4">
                   <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Hora</label>
                    <input 
                      type="time" 
                      required
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none text-sm bg-gray-50 focus:bg-white"
                      value={newEvent.time}
                      onChange={e => setNewEvent({...newEvent, time: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Categoría</label>
                    <div className="relative">
                      <select 
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none text-sm bg-gray-50 focus:bg-white appearance-none"
                        value={newEvent.type}
                        onChange={e => setNewEvent({...newEvent, type: e.target.value})}
                      >
                        <option value="lecture">📘 Clase</option>
                        <option value="exam">📕 Examen</option>
                        <option value="assignment">📙 Entrega</option>
                        <option value="study">📗 Estudio</option>
                      </select>
                      <div className="absolute right-3 top-3 pointer-events-none text-gray-400"><ChevronRight size={14} className="rotate-90"/></div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Notas</label>
                  <textarea 
                    placeholder="Aula 203, Profesor Rodríguez..."
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none text-sm resize-none h-24 bg-gray-50 focus:bg-white"
                    value={newEvent.description}
                    onChange={e => setNewEvent({...newEvent, description: e.target.value})}
                  />
                </div>

                {/* BOTONES DE IA */}
                <div className="flex gap-2 justify-end pt-2">
                    {/* Botón 1: Generador de Plan de Estudio (solo para exam o assignment) */}
                    {(newEvent.type === 'exam' || newEvent.type === 'assignment') && (
                        <button
                            type="button"
                            onClick={handleGenerateStudyPlan}
                            disabled={isGeminiLoading}
                            className="flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-lg text-indigo-600 bg-indigo-100 hover:bg-indigo-200 transition-colors disabled:opacity-50"
                        >
                            <Sparkles size={14} /> 
                            {isGeminiLoading ? 'Generando...' : 'Plan de Estudio'}
                        </button>
                    )}
                    
                    {/* Botón 2: Asistente de Notas (para cualquier tipo con notas) */}
                    {newEvent.description.length > 5 && (
                        <button
                            type="button"
                            onClick={handleAnalyzeNotes}
                            disabled={isGeminiLoading}
                            className="flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-lg text-emerald-600 bg-emerald-100 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                        >
                            <NotebookText size={14} /> 
                            {isGeminiLoading ? 'Analizando...' : 'Analizar Notas'}
                        </button>
                    )}
                </div>


                <div className="flex gap-3 pt-2 border-t border-gray-100 mt-4">
                  {editingId && (
                    <button 
                      type="button" 
                      onClick={resetForm}
                      className="px-4 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                  <button 
                    type="submit" 
                    className={`flex-1 font-bold py-3 rounded-xl transition-all shadow-lg text-white text-sm transform hover:-translate-y-0.5
                      ${editingId ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}
                    `}
                  >
                    {editingId ? 'Guardar Cambios' : 'Crear Actividad'}
                  </button>
                </div>
              </form>
              
              {/* Resultado de Gemini */}
              {(geminiResult || geminiError) && (
                <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl shadow-lg">
                  <h4 className="font-bold text-sm text-gray-800 mb-2 flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-500"/>
                    Asistente de Productividad AI
                  </h4>
                  {geminiError ? (
                    <p className="text-red-500 text-sm">{geminiError}</p>
                  ) : (
                    <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: geminiResult.replace(/\n/g, '<br/>') }} />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, Clock, 
  GraduationCap, Trash2, X, CheckCircle, Bell, Edit2, LayoutList, 
  LayoutGrid, Columns, CalendarDays, Menu, Sparkles, NotebookText, AlertTriangle
} from 'lucide-react';

// --- IMPORTS DE FIREBASE ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
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

// ==============================================================================
// --- 1. PEGA AQUÍ TU CONFIGURACIÓN DE FIREBASE (Obtenida de la consola) ---
// ==============================================================================
const firebaseConfig = {
   apiKey: "AIzaSyB7HxzNKaNbspSm2bzFj9i-H8iGEsdSecw",
  authDomain: "uniplanner-ed7cb.firebaseapp.com",
  projectId: "uniplanner-ed7cb",
  storageBucket: "uniplanner-ed7cb.firebasestorage.app",
  messagingSenderId: "860709494132",
  appId: "1:860709494132:web:a253d67570e10b57b2a021",
  measurementId: "G-RW3MP49L1J"
};
// ==============================================================================

// Validar si el usuario ha configurado las llaves
const isConfigured = firebaseConfig.apiKey !== "AIzaVy..." && firebaseConfig.projectId !== "tu-proyecto";

// Inicializar Firebase solo si hay configuración válida
let app, db, auth;
if (isConfigured) {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
    } catch (error) {
        console.error("Error inicializando Firebase:", error);
    }
}

export default function App() {
  // --- Si no está configurado, mostrar pantalla de ayuda ---
  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white max-w-2xl w-full rounded-2xl shadow-2xl border border-yellow-200 overflow-hidden">
          <div className="bg-yellow-400 p-6 flex items-center gap-4">
             <div className="bg-white p-3 rounded-full shadow-sm">
                <AlertTriangle size={32} className="text-yellow-600" />
             </div>
             <div>
                <h1 className="text-2xl font-extrabold text-yellow-900">¡Casi listo! Falta Configuración</h1>
                <p className="text-yellow-800 font-medium">Necesitas conectar tu base de datos Firebase.</p>
             </div>
          </div>
          
          <div className="p-8 space-y-6">
             <div className="space-y-4 text-gray-600">
                <p>El error <code>auth/api-key-not-valid</code> ocurre porque el código aún tiene las credenciales de ejemplo.</p>
                
                <div className="bg-gray-100 p-4 rounded-xl border border-gray-200">
                   <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">Pasos para solucionar:</h3>
                   <ol className="list-decimal list-inside space-y-2 text-sm">
                      <li>Ve a <a href="https://console.firebase.google.com/" target="_blank" className="text-indigo-600 font-bold hover:underline">console.firebase.google.com</a></li>
                      <li>Entra a tu proyecto (o crea uno nuevo).</li>
                      <li>Clic en el engranaje ⚙️ (Configuración del proyecto).</li>
                      <li>Baja hasta "Tus apps" y copia el bloque <code>const firebaseConfig = ...</code>.</li>
                      <li>Vuelve a este archivo (<code>App.jsx</code>) y reemplaza las líneas 27-34.</li>
                   </ol>
                </div>
             </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Estados ---
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); 
  const [events, setEvents] = useState([]); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notifiedEvents, setNotifiedEvents] = useState(new Set());
  const [draggedEvent, setDraggedEvent] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [userId, setUserId] = useState(null); 
  const [isLoading, setIsLoading] = useState(true); 

  // Estados para Gemini API
  const [geminiResult, setGeminiResult] = useState(null);
  const [isGeminiLoading, setIsGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState(null);
  const [showInAppAlert, setShowInAppAlert] = useState(null);
  
  const [newEvent, setNewEvent] = useState({
    title: '', type: 'lecture', time: '08:00', description: ''
  });

  // --- Gemini API Call Function ---
  const callGeminiApi = async (prompt, systemPrompt, tool = false) => {
    setIsGeminiLoading(true);
    setGeminiResult(null);
    setGeminiError(null);
    const apiKey = ""; 

    if (!apiKey) {
       setGeminiError("Para usar IA, configura la API Key en el código.");
       setIsGeminiLoading(false);
       return;
    }

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools: tool ? [{ "google_search": {} }] : undefined,
    };
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        const result = data.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo generar una respuesta.";
        setGeminiResult(result);
    } catch (error) {
        console.error("Gemini Error:", error);
        setGeminiError("Error al conectar con la IA.");
    } finally {
        setIsGeminiLoading(false);
    }
  };

  const handleGenerateStudyPlan = async () => {
    const prompt = `Plan de estudio para: ${newEvent.title} (${newEvent.type}). Fecha: ${selectedDate}. Notas: ${newEvent.description || 'Ninguna'}. Responde en español, markdown, breve.`;
    const systemPrompt = "Eres un tutor académico experto.";
    await callGeminiApi(prompt, systemPrompt, false);
  };

  const handleAnalyzeNotes = async () => {
    const prompt = `Analiza: "${newEvent.description}". Resumen breve y conceptos clave.`;
    const systemPrompt = "Eres un asistente de análisis. Responde en español.";
    await callGeminiApi(prompt, systemPrompt, true);
  }


  // --- 1. EFECTO DE AUTENTICACIÓN Y CONEXIÓN INICIAL ---
  useEffect(() => {
    if (!auth) return;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user) {
            setUserId(user.uid);
            setIsLoading(false); 
        } else {
            signInAnonymously(auth).catch((error) => {
                console.error("Error login anónimo:", error);
                setIsLoading(false); 
            });
        }
    });

    return () => unsubscribeAuth();
  }, []);

  // --- 2. EFECTO DE LECTURA DE DATOS (onSnapshot) ---
  useEffect(() => {
    if (!db || !userId) return; 

    const eventsCollectionRef = collection(db, 'users', userId, 'events');
    const eventsQuery = query(eventsCollectionRef); 

    const unsubscribeSnapshot = onSnapshot(eventsQuery, (snapshot) => {
      const fetchedEvents = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        notificationId: doc.id 
      }));
      setEvents(fetchedEvents);
    }, (error) => {
      console.error("Error Firestore:", error);
      addNotification("Error de conexión a base de datos");
    });

    return () => unsubscribeSnapshot();
  }, [userId]); 

  // --- 3. SISTEMA DE RECORDATORIOS ---
  useEffect(() => {
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
    const checkReminders = () => {
      const now = new Date();
      events.forEach(event => {
        const eventDate = new Date(event.date + 'T' + event.time);
        if (isNaN(eventDate) || eventDate < now) return; 
        const timeDiff = eventDate - now; 
        if (timeDiff > 0 && timeDiff <= 7200000 && !notifiedEvents.has(event.id)) {
            const message = `🚨 ${event.title} - ¡Pronto! (${event.time})`;
            if (Notification.permission === 'granted') new Notification('UniPlanner', { body: message });
            addNotification(message);
            setShowInAppAlert({ title: event.title, date: event.date, time: event.time });
            setNotifiedEvents(prev => new Set(prev).add(event.id));
        }
      });
    };
    const interval = setInterval(checkReminders, 30000); 
    checkReminders(); 
    return () => clearInterval(interval);
  }, [events, notifiedEvents]);

  // --- LÓGICA CRUD ---
  const getEventsCollectionRef = () => {
    if (!db || !userId) return null;
    return collection(db, 'users', userId, 'events');
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    const eventsRef = getEventsCollectionRef();
    if (!eventsRef) return;
    const eventData = { ...newEvent, date: selectedDate };
    try {
        if (editingId) {
            await updateDoc(doc(eventsRef, editingId), eventData);
            addNotification('Actualizado');
        } else {
            await addDoc(eventsRef, eventData);
            addNotification('Creado');
        }
    } catch (error) {
        console.error("Error guardar:", error);
        addNotification('Error al guardar');
    } finally {
        closeModal();
    }
  };

  const handleDeleteEvent = async (e, id) => {
    if (e) e.stopPropagation();
    if (!window.confirm('¿Eliminar?')) return;
    const eventsRef = getEventsCollectionRef();
    if (!eventsRef) return;
    try {
        await deleteDoc(doc(eventsRef, id));
        addNotification('Eliminado');
        if (editingId === id) closeModal();
    } catch (error) {
        console.error("Error eliminar:", error);
    }
  };
  
  const handleDrop = async (e, targetDate) => {
    e.preventDefault();
    if (!draggedEvent) return;
    const eventsRef = getEventsCollectionRef();
    if (!eventsRef) return;
    try {
        await updateDoc(doc(eventsRef, draggedEvent.id), { date: targetDate });
        addNotification(`Movido al ${targetDate}`);
        setDraggedEvent(null);
    } catch (error) { console.error(error); }
  };

  // --- UI Helpers ---
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    return { days, firstDay };
  };
  const formatDateStr = (date) => date.toISOString().split('T')[0];
  const createDateFromDay = (year, monthIndex, day) => formatDateStr(new Date(year, monthIndex, day));
  const getTypeColor = (type, isSolid = false) => {
    const c = COLOR_MAP[type] || COLOR_MAP.lecture;
    return isSolid ? c.solid : c.bg;
  };

  // --- Render Views ---
  const EventCard = ({ event, showTime = false }) => (
    <div 
      draggable
      onDragStart={(e) => { setDraggedEvent(event); e.dataTransfer.effectAllowed = "move"; }}
      onDoubleClick={(e) => { e.stopPropagation(); setEditingId(event.id); setSelectedDate(event.date); setNewEvent({...event}); setIsModalOpen(true); }}
      className={`text-[10px] sm:text-xs px-2 py-1.5 mb-1 rounded cursor-grab shadow-sm border flex justify-between group/item ${getTypeColor(event.type)}`}
    >
      <div className="flex flex-col min-w-0 flex-1">
         {showTime && <span className="opacity-70 mb-0.5">{event.time}</span>}
         <span className="truncate font-medium">{event.title}</span>
      </div>
      <button onClick={(e) => handleDeleteEvent(e, event.id)} className="lg:opacity-0 lg:group-hover/item:opacity-100 ml-1 text-red-600"><X size={14}/></button>
    </div>
  );

  const renderMonthView = () => {
    const { days, firstDay } = getDaysInMonth(currentDate);
    return (
      <div className="p-4 grid grid-cols-7 gap-2">
        {["D","L","M","X","J","V","S"].map(d => <div key={d} className="text-center text-xs text-gray-400 font-bold py-2">{d}</div>)}
        {[...Array(firstDay).keys()].map(i => <div key={`empty-${i}`} />)}
        {[...Array(days).keys()].map(i => {
            const day = i + 1;
            const dateStr = createDateFromDay(currentDate.getFullYear(), currentDate.getMonth(), day);
            const dayEvents = events.filter(e => e.date === dateStr);
            const isToday = formatDateStr(new Date()) === dateStr;
            return (
              <div key={day} 
                onDragOver={(e) => {e.preventDefault(); e.dataTransfer.dropEffect = "move";}}
                onDrop={(e) => handleDrop(e, dateStr)}
                onClick={() => { setSelectedDate(dateStr); setNewEvent({...newEvent, title: '', description: ''}); setIsModalOpen(true); }}
                className={`min-h-[80px] p-2 rounded-xl border transition-all hover:bg-gray-50 cursor-pointer ${isToday ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-100'}`}
              >
                <span className={`text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-700'}`}>{day}</span>
                <div className="mt-1 space-y-1">{dayEvents.slice(0,3).map(ev => <EventCard key={ev.id} event={ev} />)}</div>
              </div>
            );
        })}
      </div>
    );
  };

  const addNotification = (msg) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message: msg }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingId(null); setGeminiResult(null); };

  return (
    <div className="min-h-screen bg-gray-50 text-slate-800 font-sans pb-8">
      {isLoading && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center z-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-indigo-600 font-bold text-lg">Conectando a tu UniPlanner...</p>
            <p className="text-xs text-gray-400 mt-2">Configurando base de datos personal</p>
        </div>
      )}

      {/* Alerta In-App */}
      {showInAppAlert && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 p-4 w-full max-w-sm animate-bounce-in">
            <div className="bg-red-500 text-white rounded-xl shadow-2xl p-4 flex justify-between">
                <div><p className="font-bold">¡Recordatorio!</p><p className="text-xs">{showInAppAlert.title} a las {showInAppAlert.time}</p></div>
                <button onClick={() => setShowInAppAlert(null)}><X/></button>
            </div>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className="bg-gray-800 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-fade-in pointer-events-auto">
            <Bell size={16} className="text-yellow-400" /> <span className="text-xs font-medium">{n.message}</span>
          </div>
        ))}
      </div>

      <header className="bg-white shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2 rounded-lg text-white"><GraduationCap size={20} /></div>
                <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">UniPlanner <span className="text-indigo-600">.</span></h1>
            </div>
            <button onClick={() => { setSelectedDate(formatDateStr(new Date())); setIsModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2">
                <Plus size={18}/> <span>Nueva</span>
            </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden min-h-[600px]">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
                <h2 className="text-2xl font-bold text-gray-800 capitalize flex gap-2 items-center">
                    <span className="text-gray-400 font-light">{currentDate.getFullYear()}</span>
                    {currentDate.toLocaleDateString('es-ES', { month: 'long' })}
                </h2>
                <div className="flex gap-1">
                    <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft/></button>
                    <button onClick={() => setCurrentDate(new Date())} className="px-3 text-sm font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg">Hoy</button>
                    <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight/></button>
                </div>
            </div>
            {renderMonthView()}
        </div>
      </main>

      {/* Modal CRUD */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-fade-in-up">
            <div className="flex justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-800">{editingId ? 'Editar' : 'Nueva'} Actividad</h3>
              <button onClick={closeModal}><X className="text-gray-400 hover:text-gray-600"/></button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[80vh]">
              <form onSubmit={handleSaveEvent} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Título</label>
                  <input autoFocus required type="text" className="w-full px-4 py-2 rounded-xl border bg-gray-50 focus:bg-white focus:ring-2 ring-indigo-100 outline-none transition-all" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} placeholder="Ej. Parcial Cálculo" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Fecha</label>
                    <input required type="date" className="w-full px-4 py-2 rounded-xl border bg-gray-50 outline-none" value={selectedDate || ''} onChange={e => setSelectedDate(e.target.value)} />
                   </div>
                   <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Hora</label>
                    <input required type="time" className="w-full px-4 py-2 rounded-xl border bg-gray-50 outline-none" value={newEvent.time} onChange={e => setNewEvent({...newEvent, time: e.target.value})} />
                   </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Tipo</label>
                    <div className="flex gap-2 mt-1">
                        {['lecture','exam','assignment','study'].map(type => (
                            <button key={type} type="button" onClick={() => setNewEvent({...newEvent, type})} className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${newEvent.type === type ? getTypeColor(type, true) + ' text-white border-transparent' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                {type === 'lecture' ? 'Clase' : type === 'exam' ? 'Examen' : type === 'assignment' ? 'Tarea' : 'Estudio'}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Notas</label>
                  <textarea className="w-full px-4 py-2 rounded-xl border bg-gray-50 focus:bg-white outline-none h-20 resize-none" value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} placeholder="Detalles..."></textarea>
                </div>
                
                {/* Botones IA (Opcional) */}
                {(newEvent.type === 'exam' || newEvent.type === 'assignment') && (
                    <button type="button" onClick={handleGenerateStudyPlan} disabled={isGeminiLoading} className="w-full py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 flex justify-center items-center gap-2">
                        <Sparkles size={14}/> {isGeminiLoading ? 'Pensando...' : 'Generar Plan de Estudio con IA'}
                    </button>
                )}

                {geminiResult && <div className="p-3 bg-indigo-50 rounded-xl text-sm text-gray-700 border border-indigo-100 mt-2">{geminiResult}</div>}
                {geminiError && <div className="p-2 text-red-500 text-xs text-center">{geminiError}</div>}

                <button type="submit" className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5">
                    {editingId ? 'Guardar Cambios' : 'Crear Actividad'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, Clock, 
  GraduationCap, Trash2, X, CheckCircle, Bell, Edit2, Sparkles, 
  NotebookText, AlertTriangle, Key, WifiOff, LogOut, User
} from 'lucide-react';

// --- IMPORTS DE FIREBASE ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, doc, addDoc, updateDoc, deleteDoc, onSnapshot, 
  collection, query, orderBy 
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

// Validar configuración
const isConfigured = firebaseConfig.apiKey !== "AIzaVy..." && firebaseConfig.projectId !== "tu-proyecto";

// Inicializar Firebase
let app, db, auth, provider;
if (isConfigured) {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        provider = new GoogleAuthProvider();
    } catch (error) {
        console.error("Error inicializando Firebase:", error);
    }
}

// Estado inicial del formulario
const initialEventState = { title: '', type: 'lecture', time: '08:00', description: '' };

export default function App() {
  // --- PANTALLA DE CONFIGURACIÓN FALTANTE ---
  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans text-white">
        <div className="bg-white text-slate-900 max-w-xl w-full rounded-2xl shadow-2xl p-8 text-center">
            <div className="bg-yellow-100 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
                <Key size={40} className="text-yellow-600" />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-800 mb-2">Falta Configuración</h1>
            <p className="text-slate-600 mb-6">Pega tus llaves de Firebase en <code>src/App.jsx</code> para continuar.</p>
        </div>
      </div>
    );
  }

  // --- Estados ---
  const [user, setUser] = useState(null); // Usuario logueado
  const [authLoading, setAuthLoading] = useState(true); // Cargando auth
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notifiedEvents, setNotifiedEvents] = useState(new Set());
  const [draggedEvent, setDraggedEvent] = useState(null);
  const [editingId, setEditingId] = useState(null);
  
  // Gemini States
  const [geminiResult, setGeminiResult] = useState(null);
  const [isGeminiLoading, setIsGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState(null);
  const [showInAppAlert, setShowInAppAlert] = useState(null);
  
  const [newEvent, setNewEvent] = useState(initialEventState);

  // --- Gemini Stub ---
  const handleGenerateStudyPlan = async () => {
     alert("Configura la API Key de Gemini para usar IA.");
  };
  const handleAnalyzeNotes = async () => {
     alert("Configura la API Key de Gemini para usar IA.");
  };

  // --- 1. EFECTO DE AUTENTICACIÓN (Google) ---
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- 2. EFECTO DE LECTURA DE DATOS (Solo si hay usuario) ---
  useEffect(() => {
    if (!db || !user) return; 

    // Ruta personalizada por usuario: users/{uid}/events
    const eventsRef = collection(db, 'users', user.uid, 'events');
    const q = query(eventsRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedEvents = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      }));
      setEvents(fetchedEvents);
    }, (error) => {
      console.error("Error leyendo datos:", error);
      addNotification("Error de sincronización");
    });

    return () => unsubscribe();
  }, [user]); 

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

  // --- FUNCIONES DE AUTH ---
  const handleGoogleLogin = async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Error login:", error);
        alert("Error al iniciar sesión: " + error.message);
    }
  };

  const handleLogout = async () => {
    try {
        await signOut(auth);
        setEvents([]); // Limpiar eventos locales al salir
    } catch (error) {
        console.error("Error logout:", error);
    }
  };

  // --- UI Helpers ---
  const resetForm = () => {
      setNewEvent(initialEventState);
      setEditingId(null);
      setGeminiResult(null);
      setGeminiError(null);
  };

  const closeModal = () => { 
      setIsModalOpen(false); 
      resetForm(); 
  };

  const openNewEventModal = (dateStr) => {
      setSelectedDate(dateStr);
      resetForm();
      setIsModalOpen(true);
  };

  const addNotification = (msg) => {
      const id = Date.now();
      setNotifications(prev => [...prev, { id, message: msg }]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  };
  
  // Helpers de Fecha y Color
  const getDaysInMonth = (date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      return { days: new Date(year, month + 1, 0).getDate(), firstDay: new Date(year, month, 1).getDay() };
  };
  const formatDateStr = (date) => date.toISOString().split('T')[0];
  const createDateFromDay = (year, monthIndex, day) => formatDateStr(new Date(year, monthIndex, day));
  const getTypeColor = (type, isSolid = false) => {
      const c = COLOR_MAP[type] || COLOR_MAP.lecture;
      return isSolid ? c.solid : c.bg;
  };

  // --- LÓGICA CRUD ---
  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (!user) return alert("Debes iniciar sesión.");

    const eventsRef = collection(db, 'users', user.uid, 'events');
    const eventData = { ...newEvent, date: selectedDate };

    try {
        if (editingId) {
            await updateDoc(doc(eventsRef, editingId), eventData);
            addNotification('Actualizado correctamente');
        } else {
            await addDoc(eventsRef, eventData);
            addNotification('Creado exitosamente');
        }
        closeModal(); 
    } catch (error) {
        console.error("Error guardando:", error);
        alert("Error al guardar en la nube.");
    }
  };

  const handleDeleteEvent = async (e, id) => {
    if (e) e.stopPropagation();
    if (!window.confirm('¿Eliminar?')) return;
    try {
        await deleteDoc(doc(db, 'users', user.uid, 'events', id));
        addNotification('Eliminado');
        if (editingId === id) closeModal();
    } catch (error) { console.error(error); }
  };
  
  const handleDrop = async (e, targetDate) => {
    e.preventDefault();
    if (!draggedEvent || !user) return;
    try {
        await updateDoc(doc(db, 'users', user.uid, 'events', draggedEvent.id), { date: targetDate });
        addNotification(`Movido al ${targetDate}`);
        setDraggedEvent(null);
    } catch (error) { console.error(error); }
  };

  // --------------------------------------------------------------------------
  // --- VISTA DE LOGIN (Si no hay usuario) ---
  // --------------------------------------------------------------------------
  if (authLoading) return <div className="h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

  if (!user) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans">
           <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
              <div className="bg-indigo-100 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
                  <GraduationCap size={40} className="text-indigo-600" />
              </div>
              <h1 className="text-3xl font-extrabold text-slate-800 mb-2">UniPlanner</h1>
              <p className="text-slate-500 mb-8">Tu agenda académica en la nube. Accede desde cualquier dispositivo.</p>
              
              <button 
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-xl transition-all shadow-sm"
              >
                 <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-6 h-6" />
                 Continuar con Google
              </button>
           </div>
        </div>
      );
  }

  // --------------------------------------------------------------------------
  // --- VISTA PRINCIPAL (Calendario) ---
  // --------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 text-slate-800 font-sans pb-8">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2 rounded-lg text-white"><GraduationCap size={20} /></div>
                <h1 className="text-xl font-extrabold text-gray-900 tracking-tight hidden sm:block">UniPlanner <span className="text-indigo-600">.</span></h1>
            </div>
            
            <div className="flex items-center gap-3">
                <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full">
                    {user.photoURL ? <img src={user.photoURL} className="w-6 h-6 rounded-full" alt="user"/> : <User size={16}/>}
                    <span className="text-xs font-bold text-gray-600 truncate max-w-[100px]">{user.displayName}</span>
                </div>
                <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Cerrar Sesión">
                    <LogOut size={20} />
                </button>
                <button onClick={() => openNewEventModal(new Date().toISOString().split('T')[0])} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2">
                    <Plus size={18}/> <span className="hidden sm:inline">Nueva</span>
                </button>
            </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 py-6">
         <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 min-h-[500px]">
            <div className="flex justify-between mb-4 items-center">
                <h2 className="text-2xl font-bold capitalize flex items-center gap-2">
                    <CalendarIcon className="text-indigo-500" size={24}/>
                    {currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric'})}
                </h2>
                <div className="flex gap-2 bg-gray-50 p-1 rounded-lg">
                    <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth()-1)))} className="p-2 hover:bg-white hover:shadow-sm rounded-md"><ChevronLeft size={20}/></button>
                    <button onClick={() => setCurrentDate(new Date())} className="px-3 text-xs font-bold text-indigo-600 hover:bg-white hover:shadow-sm rounded-md">Hoy</button>
                    <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth()+1)))} className="p-2 hover:bg-white hover:shadow-sm rounded-md"><ChevronRight size={20}/></button>
                </div>
            </div>
            
            <div className="grid grid-cols-7 gap-2 mb-2">
                 {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map(d => (
                     <div key={d} className="text-center text-xs font-bold text-gray-400 uppercase tracking-wider">{d}</div>
                 ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
                {[...Array(getDaysInMonth(currentDate).firstDay).keys()].map(i => <div key={`e-${i}`} className="bg-gray-50/30 rounded-lg"/>)}
                {[...Array(getDaysInMonth(currentDate).days).keys()].map(i => {
                    const day = i + 1;
                    const d = createDateFromDay(currentDate.getFullYear(), currentDate.getMonth(), day);
                    const dayEvents = events.filter(e => e.date === d);
                    const isToday = d === formatDateStr(new Date());
                    
                    return (
                        <div key={day} onClick={() => openNewEventModal(d)} 
                             onDragOver={(e) => {e.preventDefault(); e.dataTransfer.dropEffect = "move";}}
                             onDrop={(e) => handleDrop(e, d)}
                             className={`min-h-[100px] border rounded-xl p-2 cursor-pointer transition-all hover:shadow-md group relative
                                ${isToday ? 'border-indigo-300 bg-indigo-50/50' : 'border-gray-100 hover:border-indigo-200 bg-white'}`}>
                            <span className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold mb-1
                                ${isToday ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 group-hover:bg-gray-100'}`}>
                                {day}
                            </span>
                            <div className="space-y-1 overflow-y-auto max-h-[70px]">
                                {dayEvents.map(e => (
                                    <div 
                                        key={e.id} 
                                        draggable
                                        onDragStart={(ev) => { setDraggedEvent(e); ev.dataTransfer.effectAllowed = "move"; }}
                                        onClick={(ev) => { ev.stopPropagation(); setEditingId(e.id); setSelectedDate(e.date); setNewEvent({...e}); setIsModalOpen(true); }}
                                        className={`text-[10px] px-1.5 py-1 rounded border truncate shadow-sm hover:scale-105 transition-transform cursor-grab active:cursor-grabbing ${getTypeColor(e.type)}`}>
                                        {e.title}
                                    </div>
                                ))}
                            </div>
                            <button 
                                className="absolute top-2 right-2 text-indigo-400 opacity-0 group-hover:opacity-100 hover:text-indigo-600 transition-opacity"
                                onClick={(e) => { e.stopPropagation(); openNewEventModal(d); }}
                            >
                                <Plus size={16}/>
                            </button>
                        </div>
                    );
                })}
            </div>
         </div>
      </main>

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className="bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in-up pointer-events-auto border border-gray-700">
            <Bell size={18} className="text-yellow-400" /> <span className="text-xs font-bold">{n.message}</span>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-fade-in-up transform transition-all scale-100">
              <div className="flex justify-between items-center p-5 border-b border-gray-100">
                  <h3 className="font-extrabold text-xl text-gray-800 flex items-center gap-2">
                    {editingId ? <Edit2 size={20} className="text-indigo-600"/> : <Plus size={20} className="text-indigo-600"/>}
                    {editingId ? 'Editar Actividad' : 'Nueva Actividad'}
                  </h3>
                  <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"><X size={20}/></button>
              </div>
              <form onSubmit={handleSaveEvent} className="p-6 space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Título</label>
                    <input required autoFocus type="text" placeholder="Ej. Parcial de Cálculo" className="w-full border border-gray-200 bg-gray-50 p-3 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Fecha</label>
                        <input required type="date" className="w-full border border-gray-200 bg-gray-50 p-3 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none" value={selectedDate || ''} onChange={e => setSelectedDate(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Hora</label>
                        <input required type="time" className="w-full border border-gray-200 bg-gray-50 p-3 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none" value={newEvent.time} onChange={e => setNewEvent({...newEvent, time: e.target.value})} />
                      </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Categoría</label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            {id:'lecture', label:'Clase', icon:'📘'},
                            {id:'exam', label:'Examen', icon:'📕'},
                            {id:'assignment', label:'Entrega', icon:'📙'},
                            {id:'study', label:'Estudio', icon:'📗'}
                        ].map(cat => (
                            <button 
                                key={cat.id}
                                type="button" 
                                onClick={() => setNewEvent({...newEvent, type: cat.id})} 
                                className={`py-2 rounded-lg text-xs font-bold border transition-all flex flex-col items-center gap-1
                                ${newEvent.type === cat.id 
                                    ? getTypeColor(cat.id, true) + ' text-white border-transparent shadow-md scale-105' 
                                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                                <span className="text-sm">{cat.icon}</span>
                                {cat.label}
                            </button>
                        ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Notas</label>
                    <textarea placeholder="Detalles adicionales..." className="w-full border border-gray-200 bg-gray-50 p-3 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none h-24 resize-none" value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})}></textarea>
                  </div>
                  
                  <div className="flex gap-2">
                      <button type="button" onClick={handleGenerateStudyPlan} disabled={isGeminiLoading} className="flex-1 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 flex justify-center items-center gap-2 transition-colors">
                          <Sparkles size={14}/> Generar Plan
                      </button>
                      <button type="button" onClick={handleAnalyzeNotes} disabled={isGeminiLoading} className="flex-1 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-100 flex justify-center items-center gap-2 transition-colors">
                          <NotebookText size={14}/> Analizar Notas
                      </button>
                  </div>

                  <div className="flex gap-3 pt-2">
                      {editingId && (
                          <button type="button" onClick={handleDeleteEvent} className="px-4 py-3 rounded-xl bg-red-50 text-red-600 font-bold hover:bg-red-100 transition-colors"><Trash2 size={20}/></button>
                      )}
                      <button type="submit" className="flex-1 bg-gray-900 text-white font-bold py-3 rounded-xl hover:bg-black shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 flex justify-center items-center gap-2">
                          <CheckCircle size={18}/>
                          {editingId ? 'Guardar Cambios' : 'Crear Actividad'}
                      </button>
                  </div>
              </form>
          </div>
        </div>
      )}
    </div>
  );
}
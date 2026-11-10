// Spanish for technicians. Each person picks their language (Account & security → Language).
// Screen labels come from the dictionary below; SOP steps and checklist text (written by each company)
// are translated by the translate function and saved, so each text is translated once.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { useSession } from './session';
import { callFunction } from './supabase';

export type Lang = 'en' | 'es';

/** English label → Spanish. Missing entries fall back to English. */
export const ES: Record<string, string> = {
  // Navigation
  Dashboard: 'Inicio', Jobs: 'Trabajos', Customers: 'Clientes', Services: 'Servicios', More: 'Más', Schedule: 'Agenda',
  // Job screen
  'Start job': 'Empezar trabajo', 'Resume job': 'Reanudar trabajo', 'Add before photos to start': 'Agrega fotos de antes para empezar',
  'Clock in on this job': 'Marcar entrada en este trabajo', 'Clock out': 'Marcar salida', 'Clock in': 'Marcar entrada',
  Checklist: 'Lista de pasos', 'Before photos': 'Fotos de antes', 'After photos': 'Fotos de después',
  'Damage documentation': 'Daños encontrados', 'Crew time': 'Tiempo del equipo', 'Notes & activity': 'Notas y actividad',
  'Add note': 'Agregar nota', Note: 'Nota', Directions: 'Cómo llegar', 'Call customer': 'Llamar al cliente', Ask: 'Preguntar',
  'Supplies used': 'Productos usados', 'Log supplies used': 'Registrar productos usados', 'Customer sign-off': 'Firma del cliente',
  'Capture signature': 'Tomar firma', 'Check condition': 'Revisar condición', 'Put on hold': 'Poner en pausa',
  'How to do this step': 'Cómo hacer este paso', 'Add step': 'Agregar paso', 'Heads up': 'Atención', Water: 'Agua', Power: 'Electricidad',
  'No water': 'Sin agua', 'No power': 'Sin electricidad', 'Hangar available': 'Hangar disponible', 'Crew & resources': 'Equipo y recursos',
  'Mark done': 'Marcar como hecho', 'Mark not done': 'Marcar como pendiente', 'Quality check': 'Revisión de calidad',
  'Checklist incomplete': 'Lista incompleta', 'Complete anyway?': '¿Terminar de todos modos?',
  'No checklist steps. Steps come from each service’s SOP.': 'No hay pasos. Los pasos vienen del SOP de cada servicio.',
  Tentative: 'Tentativo', Scheduled: 'Programado', 'In progress': 'En progreso', 'On hold': 'En pausa', Completed: 'Terminado',
  Invoiced: 'Facturado', Cancelled: 'Cancelado',
  'Confirm I’ll be there': 'Confirmo que estaré', 'Undo my confirmation': 'Quitar mi confirmación', 'No time logged on this job yet.': 'Aún no hay tiempo registrado en este trabajo.',
  Customer: 'Cliente', logged: 'registrado',
  // Photos and offline
  'Photo saved on this phone': 'Foto guardada en este teléfono',
  'No signal right now. It uploads to the job automatically when you’re back online.': 'Sin señal ahora. Se sube al trabajo automáticamente cuando vuelvas a tener conexión.',
  'waiting to send. They send automatically when you’re back online.': 'esperando para enviarse. Se envían automáticamente cuando vuelvas a tener conexión.',
  Retry: 'Reintentar', Dismiss: 'Cerrar', 'Something went wrong': 'Algo salió mal',
  // Dashboard / clock
  'Time clock': 'Reloj', "You're clocked in": 'Estás trabajando', 'Not clocked in': 'Sin marcar entrada', 'Today': 'Hoy',
  // SOP sheet
  Products: 'Productos', Safety: 'Seguridad', Tools: 'Herramientas', 'Watch the video': 'Ver el video', Close: 'Cerrar', Done: 'Hecho',
  // Language setting
  Language: 'Idioma', English: 'English', Spanish: 'Español',
};

/** Translate a screen label. Keep the English text as the key so missing entries still read fine. */
export const tr = (lang: Lang, en: string) => (lang === 'es' ? ES[en] ?? en : en);

export function useLang(): Lang {
  const { profile } = useSession();
  return (profile as { language?: Lang } | null)?.language === 'es' ? 'es' : 'en';
}

/** const t = useT(); t('Clock out') */
export function useT() {
  const lang = useLang();
  return (en: string) => tr(lang, en);
}

// ---------------------------------------------------------------- company text (SOP steps, checklists)
const memory = new Map<string, string>();
const STORE = 'translations-es:v1';
let loaded = false;
async function loadStore() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORE);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) memory.set(k, v);
  } catch { /* none saved */ }
}
async function persist() {
  try {
    // Keep the most recent 2,000 so storage stays small.
    const entries = [...memory.entries()].slice(-2000);
    await AsyncStorage.setItem(STORE, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* storage full */ }
}

/** Company-written texts in the person's language: English right away, Spanish once translated (cached). */
export function useTranslated(orgId: string | null | undefined, texts: string[]): string[] {
  const lang = useLang();
  const key = texts.join('\u0001');
  const [, bump] = useState(0);
  useEffect(() => {
    if (lang !== 'es' || !orgId || !texts.length) return;
    let alive = true;
    (async () => {
      await loadStore();
      const missing = [...new Set(texts.filter((t) => t.trim() && !memory.has(t)))];
      if (!missing.length) { if (alive) bump((n) => n + 1); return; }
      for (let i = 0; i < missing.length; i += 100) {
        const part = missing.slice(i, i + 100);
        try {
          const { translations } = await callFunction<{ translations: string[] }>('translate', { org_id: orgId, language: 'es', texts: part });
          part.forEach((src, j) => { if (translations[j]) memory.set(src, translations[j]); });
        } catch { break; /* offline or busy: keep English */ }
      }
      await persist();
      if (alive) bump((n) => n + 1);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, orgId, key]);
  return lang === 'es' ? texts.map((t) => memory.get(t) ?? t) : texts;
}

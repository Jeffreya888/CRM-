// Voice for Ask Tarmo: speak a question (speech recognition) and hear answers (text to speech).
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { speechText } from '../../lib/speechText';

// Detailing words the recognizer would otherwise mishear.
const VOCABULARY = [
  'Tarmo', 'gelcoat', 'ceramic coating', 'brightwork', 'pitot', 'static port', 'de-ice boot', 'leading edge', 'isinglass',
  'teak', 'non-skid', 'oxidation', 'compound', 'polish', 'sealant', 'PPF', 'Gulfstream', 'Challenger', 'Citation',
  'King Air', 'Falcon', 'Embraer', 'Phenom', 'Pilatus', 'turboprop', 'FBO', 'hangar', 'SOP',
];

// --- Reading answers aloud: one at a time, app-wide ---------------------------
let speakingId: string | null = null;
const listeners = new Set<() => void>();
const setSpeaking = (id: string | null) => { speakingId = id; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

// Spoken and heard language follows the person's language setting (set from the app layout).
let voiceLang: 'en' | 'es' = 'en';
export const setVoiceLanguage = (lang: 'en' | 'es') => { voiceLang = lang; };

/** Reads an answer aloud; stops whatever was playing first. */
export function speakAnswer(id: string, markdown: string) {
  Speech.stop().catch(() => {});
  setSpeaking(id);
  Speech.speak(speechText(markdown), {
    language: voiceLang === 'es' ? 'es-US' : 'en-US',
    onDone: () => { if (speakingId === id) setSpeaking(null); },
    onStopped: () => { if (speakingId === id) setSpeaking(null); },
    onError: () => { if (speakingId === id) setSpeaking(null); },
  });
}

export function stopSpeaking() {
  setSpeaking(null);
  Speech.stop().catch(() => {});
}

/** The id of the answer being read aloud, or null. */
export function useSpeakingId() {
  return useSyncExternalStore(subscribe, () => speakingId, () => null);
}

// --- Speaking a question ------------------------------------------------------
function recognitionAvailable(): boolean {
  try { return ExpoSpeechRecognitionModule.isRecognitionAvailable(); } catch { return false; }
}

/**
 * Tap to talk: live transcript while listening; `onFinal` gets the whole question once the person stops.
 * `available` is false where the device or browser has no speech recognition (the mic button is hidden).
 */
export function useVoiceInput(onFinal: (text: string) => void) {
  const [available] = useState(recognitionAvailable);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const finalText = useRef('');
  const onFinalRef = useRef(onFinal);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results[0]?.transcript ?? '';
    setTranscript(t);
    if (e.isFinal) finalText.current = t;
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (e.error !== 'aborted' && e.error !== 'no-speech') {
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Allow microphone and speech recognition for Tarmo in your settings to ask by voice.'
        : 'Couldn’t hear that. Try again, or type your question.');
    }
  });
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    const t = finalText.current.trim();
    finalText.current = '';
    setTranscript('');
    if (t) onFinalRef.current(t);
  });

  const start = useCallback(async () => {
    setError(null);
    stopSpeaking();
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setError('Allow microphone and speech recognition for Tarmo in your settings to ask by voice.');
      return;
    }
    finalText.current = '';
    setTranscript('');
    ExpoSpeechRecognitionModule.start({ lang: voiceLang === 'es' ? 'es-US' : 'en-US', interimResults: true, continuous: false, addsPunctuation: true, contextualStrings: VOCABULARY });
  }, []);

  const stop = useCallback(() => { ExpoSpeechRecognitionModule.stop(); }, []);

  // Stop listening if the screen closes mid-sentence.
  useEffect(() => () => { try { ExpoSpeechRecognitionModule.abort(); } catch { /* not started */ } }, []);

  return { available, listening, transcript, error, start, stop };
}

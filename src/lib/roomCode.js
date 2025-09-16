// src/lib/roomCode.js
import supabase  from './supabaseClient';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

/** Generate a unique 5-letter code with up to 5 retries */
export async function generateUniqueRoomCode() {
  const client = supabase;
  for (let tries = 0; tries < 5; tries++) {
    const code = randomCode();
    const { data, error } = await client.from('rooms').select('id').eq('code', code).maybeSingle();
    if (error) throw error;
    if (!data) return code; // free
  }
  throw new Error('Δεν ήταν δυνατή η δημιουργία μοναδικού κωδικού δωματίου.');
}

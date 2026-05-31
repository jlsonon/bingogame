import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

// Load variables from .env file
dotenv.config();

/**
 * LUCKY BINGO - VOiCE GENERATOR
 * Run this script to generate all 75 Bingo ball calls using ElevenLabs.
 * 
 * USAGE:
 * 1. Ensure .env file has ELEVEN_API_KEY
 * 2. Run: node scripts/generate_voices.js
 */

const API_KEY = process.env.ELEVEN_API_KEY;
const VOICE_ID = process.env.VOICE_ID || '24JGmqE2AvYy6abpAy3g';
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'assets', 'voices');

if (!API_KEY) {
  console.error('❌ ERROR: ELEVEN_API_KEY environment variable is required.');
  process.exit(1);
}

// Ensure directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function generateBall(number) {
  const letter = number <= 15 ? 'B' : number <= 30 ? 'I' : number <= 45 ? 'N' : number <= 60 ? 'G' : 'O';
  const text = `${letter}... ${number}`;
  const filename = `${letter}${number}.mp3`;
  const filePath = path.join(OUTPUT_DIR, filename);

  if (fs.existsSync(filePath)) {
    console.log(`⏩ Skipping ${filename} (already exists)`);
    return;
  }

  console.log(`🎙️ Generating ${text}...`);

  try {
    const response = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      data: {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.8 }
      },
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (err) {
    console.error(`❌ Failed to generate ${filename}:`, err.response?.data?.detail || err.message);
    throw err;
  }
}

async function main() {
  console.log('🚀 Starting Voice Generation for 75 balls...');
  console.log(`📁 Saving to: ${OUTPUT_DIR}`);

  for (let i = 1; i <= 75; i++) {
    try {
      await generateBall(i);
      // Small delay to be nice to the API
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error('🛑 Stopping due to error.');
      break;
    }
  }

  console.log('\n✅ Done! Check your public/assets/voices folder.');
  console.log('💡 TIP: You can now use "/assets/voices/{filename}" as your Voice URL in the app.');
}

main();

const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const {generateImage} = require('./image.js')
const app = express();
app.use(express.json()); // To parse JSON payloads
app.use(cors()); // Enable CORS for all routes

const MEDIA_FOLDER = process.env.MMAPI_MEDIA_FOLDER || 'media';
const BASE_URL = process.env.MMAPI_BASE_URL || 'http://localhost:8000';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
// Ensure the MEDIA_FOLDER directory exists
async function ensureDir(dir) {
  try {
    await fsp.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

(async () => {
  await ensureDir(MEDIA_FOLDER);
})();

const audioCache = {}; // { [scriptHash]: audioFilePath }

function parseScript(script) {
  const segments = script.trim().split('\n\n');
  const parsedSegments = [];

  for (const segment of segments) {
    const [speaker_name, ...contentParts] = segment.split(': ');
    const content = contentParts.join(': ');
    parsedSegments.push({ speaker_name, content });
  }

  return parsedSegments;
}

async function runOpenAITTS(text, audioFilename, voiceId, ttsModel='tts-1') {
    
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set.');
  }

  // Replace the URL below with the actual OpenAI TTS endpoint if available
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ttsModel,
      voice: voiceId,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI TTS request failed: ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fsp.writeFile(audioFilename, buffer);
}

async function generateAudio(speakerName, content) {
  const voiceLookupTable = {
    DEFAULT: 'alloy',
    ALICE: 'shimmer',
    BOB: 'echo',
    JENNIFER: 'nova',
    PROFESSOR: 'fable',
    MALE_GUEST: 'onyx',
    FEMALE_GUEST: 'alloy',
  };

  const actualVoiceId = voiceLookupTable[speakerName] || voiceLookupTable['DEFAULT'];
  const fileName = path.join(MEDIA_FOLDER, `${uuidv4()}.mp3`);

  await runOpenAITTS(content, fileName, actualVoiceId, 'tts-1-hd');
  return fileName;
}

function concatenateAudioFiles(audioFiles, outputFilePath) {
  return new Promise((resolve, reject) => {
    if (audioFiles.length === 1) {
      // If only one audio file, copy it directly
      fs.copyFileSync(audioFiles[0], outputFilePath);
      resolve();
      return;
    }

    const listContent = audioFiles.join('|');

    // Run FFmpeg with the concat protocol
    // ffmpeg -i "concat:file1.mp3|file2.mp3" -acodec copy output.mp3

    const ffmpeg = spawn('ffmpeg', [
      '-i',
      `concat:${listContent}`,
      '-acodec',
      'copy',
      outputFilePath,
    ]);

    ffmpeg.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    ffmpeg.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg failed with exit code ${code}`));
      }
    });
  });
}

// Existing GET endpoint (unchanged)
app.get('/list-models', (req, res) => {
  // Placeholder for listing models, replace with actual implementation if needed
  res.json(['Model 1', 'Model 2', 'Model 3']);
});

// Existing GET endpoint (unchanged)
app.get('/generate/speech', async (req, res) => {
  try {
    const apiKey = req.query.api_key || 'their_api_key';
    if (apiKey !== 'their_api_key') {
      // Replace "their_api_key" with your actual method of managing API keys
      res.status(401).send('Unauthorized');
      return;
    }

    const script = req.query.payload;
    if (!script) {
      res.status(400).send('Bad Request: Missing payload');
      return;
    }

    const hash = crypto.createHash('sha1');
    hash.update(script);
    const scriptHash = hash.digest('hex');

    if (audioCache[scriptHash]) {
      const filePath = audioCache[scriptHash];
      res.sendFile(path.resolve(filePath), { headers: { 'Content-Type': 'audio/mpeg' } });
      return;
    }

    const parsedSegments = parseScript(script);
    const audioSegments = [];

    for (const segment of parsedSegments) {
      const audioPath = await generateAudio(segment.speaker_name, segment.content);
      audioSegments.push(audioPath);
    }

    if (audioSegments.length === 0) {
      res.status(400).send('No audio generated');
      return;
    }

    // Concatenate audio files into one using FFmpeg
    const combinedAudioPath = path.join(MEDIA_FOLDER, `combined_${uuidv4()}.mp3`);
    await concatenateAudioFiles(audioSegments, combinedAudioPath);

    audioCache[scriptHash] = combinedAudioPath;
    res.sendFile(path.resolve(combinedAudioPath), { headers: { 'Content-Type': 'audio/mpeg' } });
  } catch (error) {
    console.error('Error generating speech:', error);
    res.status(500).send('Internal Server Error');
  }
});

// New POST endpoint with SSE support
app.post('/generate/speech/stream', async (req, res) => {
  try {
    const apiKey = req.query.api_key || 'their_api_key';
    if (apiKey !== 'their_api_key') {
      // Replace "their_api_key" with your actual method of managing API keys
      res.status(401).send('Unauthorized');
      return;
    }

    const script = req.body.payload;
    if (!script) {
      res.status(400).send('Bad Request: Missing payload');
      return;
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const hash = crypto.createHash('sha1');
    hash.update(script);
    const scriptHash = hash.digest('hex');

    if (audioCache[scriptHash]) {
      // If audio is cached, send the final SSE with the combined audio URL
      const filePath = audioCache[scriptHash];
      console.log(filePath)


      res.write(`event: audio_complete\ndata: ${req.protocol}://${req.get('host')}/${filePath}\n\n`);
      res.end();
      return;
    }

    const parsedSegments = parseScript(script);
    const audioSegments = [];

    for (const segment of parsedSegments) {
      const audioPath = await generateAudio(segment.speaker_name, segment.content);
      audioSegments.push(audioPath);

      // Send SSE with the URL of the generated audio segment
      res.write(`event: audio_segment\ndata: ${req.protocol}://${req.get('host')}/${audioPath}\n\n`);
    }

    if (audioSegments.length === 0) {
      res.write(`event: error\ndata: No audio generated\n\n`);
      res.end();
      return;
    }

    // Concatenate audio files into one using FFmpeg
    const combinedAudioPath = path.join(MEDIA_FOLDER, `combined_${uuidv4()}.mp3`);
    await concatenateAudioFiles(audioSegments, combinedAudioPath);

    audioCache[scriptHash] = combinedAudioPath;
    console.log(combinedAudioPath)
    // Send SSE with the URL of the combined audio
    res.write(`event: audio_complete\ndata: ${req.protocol}://${req.get('host')}/${combinedAudioPath}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error generating speech:', error);
    res.write(`event: error\ndata: Internal Server Error\n\n`);
    res.end();
  }
});

//for prompt-in-url: <img src="https://yourserver.com/generate/image?prompt=A%20large%20hamster&width=1024&height=1024"
app.get('/generate/image', async (req, res) => {
  const responseFormat = req.query.response_format || 'image';
  await generateImage(req.query, res, responseFormat)
});

app.post("/generate/image", async(req, res)=> {
  const responseFormat = req.query.response_format || 'url';
  await generateImage(req.body, res, responseFormat)
}) 



// Serve static files from the MEDIA_FOLDER
app.use('/media', express.static(MEDIA_FOLDER));

const port = 8000;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

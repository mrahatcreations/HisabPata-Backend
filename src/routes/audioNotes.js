const { prisma } = require('../config/database');
const fs = require('fs');

module.exports = function(app, { authenticateToken, upload, transcribeWithBanglaSpeechApi, uploadToS3, useS3, getAsrConfig }) {

// BanglaSpeechAPI proxy — Flutter sends audio_file + JWT; API key stays on server.
app.post('/api/asr/transcribe', authenticateToken, upload.single('audio_file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });
    const { enabled } = getAsrConfig();
    if (!enabled) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(503).json({
        error: 'ASR not configured',
        hint: 'Set ASR_BASE_URL and ASR_API_KEY on the backend (BanglaSpeechAPI VALID_API_KEYS).',
      });
    }

    const text = await transcribeWithBanglaSpeechApi(
      req.file.path,
      req.file.originalname,
      req.file.mimetype
    );

    try { fs.unlinkSync(req.file.path); } catch (_) {}

    if (!text) {
      return res.status(502).json({ error: 'Transcription failed' });
    }

    res.json({ text });
  } catch (err) {
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    console.error('ASR transcribe error:', err);
    res.status(500).json({ error: 'Server error during transcription' });
  }
});

// --- AUDIO NOTES ENDPOINTS ---
app.get('/api/audio-notes', authenticateToken, async (req, res) => {
  try {
    const notes = await prisma.audioNote.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(notes);
  } catch (err) {
    console.error('Error fetching audio notes:', err);
    res.status(500).json({ error: 'Server error fetching audio notes' });
  }
});

app.post('/api/audio-notes/upload', authenticateToken, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(400).json({ error: 'User not found' });

    let transcribedText = await transcribeWithBanglaSpeechApi(
      req.file.path,
      req.file.originalname,
      req.file.mimetype
    );

    if (!transcribedText) {
      transcribedText = 'Unclear audio / Processing failed';
    }

    let audioUrl = `/uploads/${req.file.filename}`;
    if (useS3) {
      // Audio notes always go to the 'audio' folder
      const storedPath = await uploadToS3(req.file.path, req.file.filename, req.file.mimetype, 'audio');
      if (storedPath) audioUrl = `/uploads/${storedPath}`;
    }

    const note = await prisma.audioNote.create({
      data: {
        userId: user.id,
        audioUrl: audioUrl,
        text: transcribedText,
        status: transcribedText.includes('Unclear audio') ? 'pending' : 'processed',
        recordedAt: new Date(req.body.recordedAt || Date.now()),
      }
    });

    res.status(201).json(note);
  } catch (err) {
    console.error('Error processing audio note:', err);
    res.status(500).json({ error: 'Server error processing audio' });
  }
});

app.post('/api/audio-notes', authenticateToken, async (req, res) => {
  try {
    const { audioUrl, text, recordedAt } = req.body;
    const note = await prisma.audioNote.create({
      data: {
        userId: req.user.id,
        audioUrl: audioUrl || null,
        text: text || "Unprocessed Audio Note",
        status: text ? 'processed' : 'pending',
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      }
    });
    res.status(201).json(note);
  } catch (err) {
    console.error('Error creating audio note:', err);
    res.status(500).json({ error: 'Server error creating audio note' });
  }
});

app.delete('/api/audio-notes/:id', authenticateToken, async (req, res) => {
  try {
    const noteId = req.params.id;
    const note = await prisma.audioNote.findUnique({ where: { id: noteId } });
    if (!note || note.userId !== req.user.id) {
      return res.status(404).json({ error: 'Audio note not found' });
    }
    await prisma.audioNote.delete({ where: { id: noteId } });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error('Error deleting audio note:', err);
    res.status(500).json({ error: 'Server error deleting audio note' });
  }
});

};

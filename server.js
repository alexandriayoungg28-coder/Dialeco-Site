require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const multer = require('multer');
const path = require('path');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - Enable CORS with credentials
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve your front-end files
app.use('/audio_files', express.static(path.join(__dirname, 'audio_files'))); // Serve audio files

// Initialize Firebase Admin SDK using environment variables
let db, firestore, bucket;
let firebaseInitialized = false;

try {
  const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CERT_URL
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://dialeco-d7b8f-default-rtdb.firebaseio.com",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "dialeco-d7b8f-user-recordings"
  });
  
  db = admin.database();
  firestore = admin.firestore();
  bucket = admin.storage().bucket();
  firebaseInitialized = true;
  console.log('✅ Firebase initialized successfully');
  console.log('✅ Firestore initialized successfully');
} catch (error) {
  console.warn('⚠️ Firebase initialization error:', error.message);
  console.log('Running in limited mode - some features will not work until Firebase credentials are added to .env');
}

// Configure multer for audio file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

// ==========================================
// ROUTES - Serve HTML pages
// ==========================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/audio-pod', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'audio-pod.html'));
});

// Simple upload endpoint for audio files (no auth required for testing)
app.post('/upload-audio', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }
    
    console.log('✅ Audio file received:', req.file.originalname, req.file.size, 'bytes');
    
    // Skip Firebase upload if billing is disabled - just acknowledge receipt
    // Optionally save to local file system if needed in the future
    
    res.json({ success: true, message: 'Audio uploaded successfully' });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// API ENDPOINTS
// ==========================================

// Root API endpoint
app.get('/api', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Dialeco API is running',
    version: '1.0.0',
    firebaseStatus: firebaseInitialized ? 'Connected' : 'Not Connected',
    endpoints: {
      health: '/api/health',
      auth: {
        register: '/api/auth/register (POST)',
        profile: '/api/auth/profile (GET)'
      },
      audio: {
        upload: '/api/audio/upload (POST)',
        get: '/api/audio/user (GET)',
        delete: '/api/audio/:audioId (DELETE)'
      },
      dashboard: '/api/dashboard (GET)',
      survey: '/api/survey (POST)'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Dialeco API is running',
    firebaseStatus: firebaseInitialized ? 'Connected' : 'Not Connected',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// SURVEY ENDPOINTS
// ==========================================

// Submit survey feedback
app.post('/api/survey', verifyToken, async (req, res) => {
  if (!firebaseInitialized) {
    return res.status(503).json({ 
      success: false, 
      error: 'Firebase not initialized' 
    });
  }

  try {
    const { responses } = req.body;

    if (!responses) {
      return res.status(400).json({ 
        success: false, 
        error: 'Survey responses are required' 
      });
    }

    // Get user info from verified token
    const userId = req.user.uid;
    const userEmail = req.user.email;

    // Store survey responses in Firestore
    const surveyDoc = await firestore.collection('surveyResponses').add({
      userId: userId,
      userEmail: userEmail,
      responses: responses,
      submittedAt: admin.firestore.Timestamp.now(),
      activityType: 'audioPod'
    });

    console.log(`✅ Survey response submitted by ${userEmail}: ${surveyDoc.id}`);

    res.json({
      success: true,
      message: 'Survey submitted successfully',
      surveyId: surveyDoc.id
    });

  } catch (error) {
    console.error('Survey submission error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

// Verify user token (middleware for protected routes)
async function verifyToken(req, res, next) {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'No token provided' 
      });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    res.status(401).json({ 
      success: false, 
      error: 'Invalid or expired token',
      details: error.message
    });
  }
}

// GET /api/auth - Info endpoint
app.get('/api/auth', (req, res) => {
  res.json({
    success: true,
    message: 'Authentication endpoints available',
    endpoints: {
      register: 'POST /api/auth/register',
      profile: 'GET /api/auth/profile'
    }
  });
});

// Register new user (store user data after Firebase auth)
app.post('/api/auth/register', verifyToken, async (req, res) => {
  try {
    const { email, username } = req.body;

    if (!email || !username) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and username are required' 
      });
    }

    const uid = req.user.uid;

    // Store user data in database only if Firebase is initialized
    if (firebaseInitialized && db) {
      await db.ref(`users/${uid}`).set({
        username: username,
        email: email,
        createdAt: Date.now(),
        audioCount: 0
      });

      console.log(`✅ User registered: ${uid} - ${username}`);
    } else {
      console.warn('⚠️ Firebase Database not initialized, skipping user data storage');
    }

    res.json({
      success: true,
      message: 'User registered successfully',
      user: {
        uid: uid,
        email: email,
        username: username
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get user profile
app.get('/api/auth/profile', verifyToken, async (req, res) => {
  try {
    if (firebaseInitialized && db) {
      const userSnapshot = await db.ref(`users/${req.user.uid}`).once('value');
      const userData = userSnapshot.val();

      return res.json({
        success: true,
        user: {
          uid: req.user.uid,
          email: req.user.email,
          username: userData?.username || req.user.name || 'User',
          audioCount: userData?.audioCount || 0
        }
      });
    } else {
      // Return basic user info if database not initialized
      return res.json({
        success: true,
        user: {
          uid: req.user.uid,
          email: req.user.email,
          username: req.user.name || 'User',
          audioCount: 0
        }
      });
    }
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==========================================
// AUDIO ENDPOINTS
// ==========================================

// Upload audio recording (User-spoken audio)
app.post('/api/audio/upload', verifyToken, upload.single('audio'), async (req, res) => {
  if (!firebaseInitialized) {
    return res.status(503).json({ 
      success: false, 
      error: 'Firebase not initialized' 
    });
  }

  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No audio file provided' 
      });
    }

    const { conversationIndex } = req.body;
    const fileName = `audio_${req.user.uid}_${Date.now()}.m4a`;
    const file = bucket.file(`userResponses/${fileName}`);

    // Upload to Firebase Storage
    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
        metadata: {
          userId: req.user.uid,
          uploadedAt: new Date().toISOString()
        }
      }
    });

    // Make file publicly accessible
    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;

    // Store metadata in Firestore under 'userAudio' collection
    const userAudioDoc = await firestore.collection('userAudio').add({
      userId: req.user.uid,
      fileName: fileName,
      storageUrl: publicUrl,
      conversationIndex: conversationIndex || 0,
      duration: req.body.duration || null,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedAt: admin.firestore.Timestamp.now(),
      audioType: 'user-spoken',
      activityType: 'audioPod'
    });

    // Also store in Realtime Database for backward compatibility
    const audioRef = db.ref('audioResponses').push();
    await audioRef.set({
      userId: req.user.uid,
      fileName: fileName,
      url: publicUrl,
      conversationIndex: conversationIndex || 0,
      timestamp: Date.now()
    });

    // Update user's audio count
    const userRef = db.ref(`users/${req.user.uid}`);
    await userRef.update({
      audioCount: admin.database.ServerValue.increment(1)
    });

    console.log(`✅ User-spoken audio uploaded: ${fileName}`);

    res.json({
      success: true,
      message: 'Audio uploaded successfully',
      audioUrl: publicUrl,
      audioId: userAudioDoc.id,
      firestoreId: userAudioDoc.id
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /api/audio/prerecorded - Register pre-recorded audio (instructor audio)
app.post('/api/audio/prerecorded', verifyToken, async (req, res) => {
  if (!firebaseInitialized) {
    return res.status(503).json({ 
      success: false, 
      error: 'Firebase not initialized' 
    });
  }

  try {
    const { storageUrl, fileName, duration, conversationIndex, lesson, difficulty } = req.body;

    if (!storageUrl || !fileName) {
      return res.status(400).json({ 
        success: false, 
        error: 'storageUrl and fileName are required' 
      });
    }

    // Store pre-recorded audio metadata in Firestore under 'prerecordedAudio' collection
    const prerecordedDoc = await firestore.collection('prerecordedAudio').add({
      fileName: fileName,
      storageUrl: storageUrl,
      duration: duration || null,
      conversationIndex: conversationIndex || 0,
      lesson: lesson || 'default',
      difficulty: difficulty || 'beginner',
      audioType: 'prerecorded',
      activityType: 'audioPod',
      uploadedAt: admin.firestore.Timestamp.now(),
      isActive: true
    });

    console.log(`✅ Pre-recorded audio registered: ${fileName}`);

    res.json({
      success: true,
      message: 'Pre-recorded audio registered successfully',
      audioId: prerecordedDoc.id,
      metadata: {
        id: prerecordedDoc.id,
        fileName: fileName,
        storageUrl: storageUrl,
        duration: duration,
        conversationIndex: conversationIndex
      }
    });

  } catch (error) {
    console.error('Pre-recorded audio registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/audio/prerecorded - Get all pre-recorded audio
app.get('/api/audio/prerecorded', async (req, res) => {
  if (!firebaseInitialized) {
    return res.status(503).json({ 
      success: false, 
      error: 'Firebase not initialized' 
    });
  }

  try {
    const snapshot = await firestore.collection('prerecordedAudio')
      .where('isActive', '==', true)
      .orderBy('conversationIndex')
      .get();

    const prerecordedAudio = [];
    snapshot.forEach(doc => {
      prerecordedAudio.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log(`✅ Retrieved ${prerecordedAudio.length} pre-recorded audio files`);

    res.json({
      success: true,
      audio: prerecordedAudio,
      count: prerecordedAudio.length
    });

  } catch (error) {
    console.error('Fetch pre-recorded audio error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/audio/prerecorded/:audioId - Get specific pre-recorded audio
app.get('/api/audio/prerecorded/:audioId', async (req, res) => {
  if (!firebaseInitialized) {
    return res.status(503).json({ 
      success: false, 
      error: 'Firebase not initialized' 
    });
  }

  try {
    const doc = await firestore.collection('prerecordedAudio').doc(req.params.audioId).get();

    if (!doc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Pre-recorded audio not found' 
      });
    }

    res.json({
      success: true,
      audio: {
        id: doc.id,
        ...doc.data()
      }
    });

  } catch (error) {
    console.error('Fetch pre-recorded audio error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/audio/user - Get user's spoken audio recordings
app.get('/api/audio/user', verifyToken, async (req, res) => {
  try {
    if (!firebaseInitialized) {
      return res.status(503).json({ 
        success: false, 
        error: 'Firebase not initialized' 
      });
    }

    // Get from Firestore (primary source)
    const snapshot = await firestore.collection('userAudio')
      .where('userId', '==', req.user.uid)
      .orderBy('uploadedAt', 'desc')
      .get();

    const userAudio = [];
    snapshot.forEach(doc => {
      userAudio.push({
        id: doc.id,
        ...doc.data(),
        uploadedAt: doc.data().uploadedAt?.toDate?.() || new Date()
      });
    });

    console.log(`✅ Retrieved ${userAudio.length} user audio files from Firestore`);

    res.json({
      success: true,
      audio: userAudio,
      count: userAudio.length
    });

  } catch (error) {
    console.error('Fetch user audio error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/audio/session/:sessionId - Get all audio (pre-recorded + user-spoken) for a session
app.get('/api/audio/session/:sessionId', verifyToken, async (req, res) => {
  if (!firebaseInitialized) {
    return res.status(503).json({ 
      success: false, 
      error: 'Firebase not initialized' 
    });
  }

  try {
    const { sessionId } = req.params;

    // Get pre-recorded audio for this session
    const prerecordedSnapshot = await firestore.collection('prerecordedAudio')
      .where('lesson', '==', sessionId)
      .where('isActive', '==', true)
      .orderBy('conversationIndex')
      .get();

    const prerecorded = [];
    prerecordedSnapshot.forEach(doc => {
      prerecorded.push({
        id: doc.id,
        type: 'prerecorded',
        ...doc.data()
      });
    });

    // Get user-spoken audio for this session
    const userSnapshot = await firestore.collection('userAudio')
      .where('userId', '==', req.user.uid)
      .where('activityType', '==', sessionId)
      .orderBy('uploadedAt', 'desc')
      .get();

    const userSpoken = [];
    userSnapshot.forEach(doc => {
      userSpoken.push({
        id: doc.id,
        type: 'user-spoken',
        ...doc.data(),
        uploadedAt: doc.data().uploadedAt?.toDate?.() || new Date()
      });
    });

    console.log(`✅ Retrieved ${prerecorded.length} prerecorded + ${userSpoken.length} user-spoken audio for session ${sessionId}`);

    res.json({
      success: true,
      session: {
        sessionId: sessionId,
        prerecordedAudio: prerecorded,
        userSpokenAudio: userSpoken,
        totalAudio: prerecorded.length + userSpoken.length
      }
    });

  } catch (error) {
    console.error('Fetch session audio error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// DELETE /api/audio/:audioId - Delete user-spoken audio recording
app.delete('/api/audio/:audioId', verifyToken, async (req, res) => {
  try {
    if (!firebaseInitialized) {
      return res.status(503).json({ 
        success: false, 
        error: 'Firebase not initialized' 
      });
    }

    const { audioId } = req.params;

    // Get audio from Firestore
    const audioDoc = await firestore.collection('userAudio').doc(audioId).get();

    if (!audioDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Audio not found' 
      });
    }

    const audioData = audioDoc.data();

    // Verify ownership
    if (audioData.userId !== req.user.uid) {
      return res.status(403).json({ 
        success: false, 
        error: 'Unauthorized' 
      });
    }

    // Delete from Storage
    const file = bucket.file(`userResponses/${audioData.fileName}`);
    await file.delete().catch(err => console.log('File already deleted:', err));

    // Delete from Firestore
    await firestore.collection('userAudio').doc(audioId).delete();

    // Update user's audio count in Realtime Database
    const userRef = db.ref(`users/${req.user.uid}`);
    await userRef.update({
      audioCount: admin.database.ServerValue.increment(-1)
    });

    console.log(`✅ Audio deleted: ${audioId}`);

    res.json({
      success: true,
      message: 'Audio deleted successfully'
    });

  } catch (error) {
    console.error('Delete audio error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/audio/statistics - Get audio usage statistics for a user
app.get('/api/audio/statistics', verifyToken, async (req, res) => {
  if (!firebaseInitialized) {
    return res.status(503).json({ 
      success: false, 
      error: 'Firebase not initialized' 
    });
  }

  try {
    // Get user's audio count
    const userSnapshot = await firestore.collection('userAudio')
      .where('userId', '==', req.user.uid)
      .get();

    const totalUserAudio = userSnapshot.size;
    let totalDuration = 0;
    let audioByActivity = {};

    userSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.duration) totalDuration += data.duration;
      
      const activity = data.activityType || 'unknown';
      audioByActivity[activity] = (audioByActivity[activity] || 0) + 1;
    });

    // Get total pre-recorded audio available
    const prerecordedSnapshot = await firestore.collection('prerecordedAudio')
      .where('isActive', '==', true)
      .get();

    const totalPrerecorded = prerecordedSnapshot.size;

    res.json({
      success: true,
      statistics: {
        totalUserAudio: totalUserAudio,
        totalPrerecordedAudio: totalPrerecorded,
        totalDurationSeconds: totalDuration,
        audioByActivity: audioByActivity,
        averageDuration: totalUserAudio > 0 ? Math.round(totalDuration / totalUserAudio) : 0
      }
    });

  } catch (error) {
    console.error('Statistics fetch error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Simple endpoint for uploading audio files from the front-end (audio-pod.html)
app.post('/upload-audio', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No audio file provided' 
      });
    }

    const fs = require('fs');
    const audioDir = path.join(__dirname, 'audio_files', 'user_recordings');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    const fileName = req.file.originalname || `recording_${Date.now()}.webm`;
    const filePath = path.join(audioDir, fileName);

    // Save file to disk
    fs.writeFileSync(filePath, req.file.buffer);

    console.log(`✅ Audio file saved: ${fileName}`);

    res.json({
      success: true,
      message: 'Audio file uploaded successfully',
      fileName: fileName,
      filePath: `/audio_files/user_recordings/${fileName}`
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==========================================
// DASHBOARD ENDPOINTS
// ==========================================

// Get dashboard data
app.get('/api/dashboard', verifyToken, async (req, res) => {
  try {
    if (!firebaseInitialized) {
      return res.status(503).json({ 
        success: false, 
        error: 'Firebase not initialized' 
      });
    }

    const userSnapshot = await db.ref(`users/${req.user.uid}`).once('value');
    const userData = userSnapshot.val();

    res.json({
      success: true,
      dashboard: {
        username: userData?.username || 'User',
        audioCount: userData?.audioCount || 0,
        activities: {
          audioPod: { unlocked: true, completed: userData?.audioCount > 0 },
          peerExchange: { unlocked: false, completed: false },
          culturalVideos: { unlocked: false, completed: false }
        }
      }
    });

  } catch (error) {
    console.error('Dashboard fetch error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==========================================
// ERROR HANDLING
// ==========================================

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: err.message
  });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log(`🚀 Dialeco backend server running on port ${PORT}`);
  console.log(`📍 API available at http://localhost:${PORT}/api`);
});
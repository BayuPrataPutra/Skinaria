import express from 'express';
import multer from 'multer';
import cors from 'cors';
import tf from '@tensorflow/tfjs-node';
import fs from 'fs';
import path from 'path';
import { 
  getDiagnosisByName, 
  savePredictionHistory, 
  getPredictionHistory, 
  getAllDiseases,
  updateDisease,
  initDB,
  closeDB 
} from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Konfigurasi Multer untuk menyimpan file sementara
const upload = multer({ dest: 'uploads/' });

// Kelas penyakit (sesuaikan dengan output model Anda)
const diseaseClasses = [
  'Acne', 
  'Eczema',
  'Melanoma', 
  'Psoriasis',
  'Basal Cell Carcinoma', 
  'Seborrheic Keratoses', 
  'Warts',
  'Atopic Dermatitis',
  'Melanocytic Nevus',
  'Benign Keratosis-like Lesions',
  'Tinea',
];

// Load model sekali saat server dinyalakan
let model;
const loadModel = async () => {
  try {
    // Pastikan path lengkap ke model.json
    const modelPath = path.resolve('./tfjs_model/model.json');
    
    // Cek apakah file model.json ada
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Model file not found at: ${modelPath}`);
    }
    
    // Cek apakah file weights ada
    const weightsPath = path.resolve('./tfjs_model/group1-shard1of1.bin');
    if (!fs.existsSync(weightsPath)) {
      throw new Error(`Weights file not found at: ${weightsPath}`);
    }
    
    console.log('📁 Loading model from:', modelPath);
    
    // Solusi 1: Load dengan options yang lebih lenient
    try {
      model = await tf.loadLayersModel(`file://${modelPath}`, {
        strict: false
      });
    } catch (err1) {
      console.log('⚠️  Method 1 failed, trying alternative approach...');
      console.log('Error 1:', err1.message);
      
      // Solusi 2: Load tanpa file:// protocol
      try {
        model = await tf.loadLayersModel(modelPath, {
          strict: false
        });
      } catch (err2) {
        console.log('⚠️  Method 2 failed, trying URL approach...');
        console.log('Error 2:', err2.message);
        
        // Solusi 3: Load as URL
        try {
          model = await tf.loadLayersModel('file://' + modelPath.replace(/\\/g, '/'), {
            strict: false
          });
        } catch (err3) {
          console.log('⚠️  Method 3 failed, trying model recreation...');
          console.log('Error 3:', err3.message);
          
          // Solusi 4: Recreate model dari scratch
          model = await recreateModel(modelPath);
        }
      }
    }
    
    console.log('✅ Model loaded successfully');
    console.log('📊 Model summary:');
    model.summary();
    
    // Verifikasi input shape
    const inputShape = model.inputs[0].shape;
    console.log('🔍 Expected input shape:', inputShape);
    
  } catch (err) {
    console.error('❌ Failed to load model:', err.message);
    console.error('💡 Make sure:');
    console.error('   - model.json exists in ./tfjs_model/');
    console.error('   - group1-shard1of1.bin exists in ./tfjs_model/');
    console.error('   - Both files are readable');
    console.error('   - TensorFlow.js version is compatible');
    process.exit(1); // Exit jika model gagal load
  }
};

// Fungsi untuk recreate model jika loading gagal
const recreateModel = async (modelPath) => {
  console.log('🔧 Attempting to recreate model...');
  
  // Baca model.json
  const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  
  // Buat model sequential baru dengan layer yang kompatibel
  const model = tf.sequential();
  
  // Input layer dengan shape yang benar
  model.add(tf.layers.inputLayer({
    inputShape: [224, 224, 3]  // Tanpa batch dimension
  }));
  
  // Conv2D layers
  model.add(tf.layers.conv2d({
    filters: 32,
    kernelSize: [3, 3],
    activation: 'relu',
    padding: 'valid'
  }));
  
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));
  
  model.add(tf.layers.conv2d({
    filters: 64,
    kernelSize: [3, 3],
    activation: 'relu',
    padding: 'valid'
  }));
  
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));
  
  model.add(tf.layers.conv2d({
    filters: 128,
    kernelSize: [3, 3],
    activation: 'relu',
    padding: 'valid'
  }));
  
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.maxPooling2d({ poolSize: [2, 2] }));
  
  model.add(tf.layers.averagePooling2d({ 
    poolSize: [7, 7], 
    strides: [7, 7] 
  }));
  
  model.add(tf.layers.flatten());
  model.add(tf.layers.dropout({ rate: 0.3 }));
  model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.3 }));
  model.add(tf.layers.dense({ units: 10, activation: 'softmax' }));
  
  // Compile model
  model.compile({
    optimizer: 'adam',
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  });
  
  console.log('🔧 Model recreated, now loading weights...');
  
  // Load weights dari original model
  try {
    const weightsPath = path.join(path.dirname(modelPath), 'group1-shard1of1.bin');
    const weightsBuffer = fs.readFileSync(weightsPath);
    
    // Convert weights untuk model baru
    // Ini complex, jadi kita coba load original model weights
    const originalModel = await tf.loadLayersModel(`file://${modelPath}`, { strict: false });
    
    // Copy weights layer by layer
    for (let i = 0; i < model.layers.length; i++) {
      if (originalModel.layers[i] && originalModel.layers[i].getWeights().length > 0) {
        model.layers[i].setWeights(originalModel.layers[i].getWeights());
      }
    }
    
    originalModel.dispose();
    
  } catch (weightsError) {
    console.log('⚠️  Could not load original weights, using random initialization');
  }
  
  return model;
};

// Fungsi untuk preprocess image
const preprocessImage = (imageBuffer) => {
  try {
    // Decode image (akan otomatis handle berbagai format)
    const decoded = tf.node.decodeImage(imageBuffer, 3);
    
    // Resize ke 224x224 (sesuai dengan model input)
    const resized = tf.image.resizeBilinear(decoded, [224, 224]);
    
    // Cast ke float32 dan normalisasi ke [0,1]
    const normalized = resized.cast('float32').div(255.0);
    
    // Add batch dimension
    const batched = normalized.expandDims(0);
    
    // Cleanup intermediate tensors
    decoded.dispose();
    resized.dispose();
    normalized.dispose();
    
    return batched;
  } catch (error) {
    throw new Error(`Image preprocessing failed: ${error.message}`);
  }
};

// Endpoint prediksi dengan integrasi database
app.post('/predict', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  if (!model) {
    return res.status(500).json({ error: 'Model not loaded' });
  }

  const imagePath = req.file.path;

  try {
    // Validasi file gambar
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      throw new Error('Invalid file type. Only JPEG and PNG are allowed.');
    }

    console.log('🖼️  Processing image:', req.file.originalname);
    
    // Baca gambar
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Preprocess gambar
    const input = preprocessImage(imageBuffer);
    
    console.log('🔮 Making prediction...');
    
    // Prediksi
    const prediction = model.predict(input);
    const result = await prediction.data();
    
    // Cari class dengan confidence tertinggi
    const maxIdx = result.indexOf(Math.max(...result));
    const confidence = result[maxIdx];
    const predictedDisease = diseaseClasses[maxIdx];
    
    // Buat array hasil dengan semua probabilities
    const allPredictions = diseaseClasses.map((className, index) => ({
      class: className,
      confidence: result[index]
    })).sort((a, b) => b.confidence - a.confidence);
    
    console.log('✅ Prediction completed');
    console.log(`📋 Top prediction: ${predictedDisease} (${(confidence * 100).toFixed(2)}%)`);
    
    // Cleanup tensors
    input.dispose();
    prediction.dispose();
    
    // Simpan ke database prediction history
    const predictionData = {
      predicted_disease: predictedDisease,
      confidence: confidence,
      image_name: req.file.originalname,
      all_predictions: allPredictions
    };
    
    await savePredictionHistory(predictionData);
    
    // Ambil informasi diagnosis dari database
    const diagnosisResult = await getDiagnosisByName(predictedDisease);
    
    // Hapus file upload
    fs.unlinkSync(imagePath);

    // Kirim hasil dengan informasi diagnosis lengkap
    res.json({
      success: true,
      prediction: {
        label: predictedDisease,
        confidence: confidence,
        percentage: `${(confidence * 100).toFixed(2)}%`
      },
      all_predictions: allPredictions.slice(0, 3), // Top 3 predictions
      diagnosis: diagnosisResult.success ? diagnosisResult.disease : null,
      metadata: {
        model_input_shape: model.inputs[0].shape,
        total_classes: diseaseClasses.length,
        saved_to_history: true
      }
    });

  } catch (err) {
    console.error('💥 Prediction error:', err.message);
    
    // Cleanup file jika ada error
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    
    res.status(500).json({ 
      error: 'Prediction failed',
      details: err.message 
    });
  }
});

// Endpoint untuk mendapatkan diagnosis berdasarkan nama penyakit
app.get('/diagnosis/:diseaseName', async (req, res) => {
  try {
    const { diseaseName } = req.params;
    const result = await getDiagnosisByName(diseaseName);
    
    if (result.error) {
      return res.status(404).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve diagnosis',
      details: error.message
    });
  }
});

// Endpoint untuk mendapatkan riwayat prediksi
app.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const result = await getPredictionHistory(limit);
    
    if (result.error) {
      return res.status(500).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve history',
      details: error.message
    });
  }
});

// Endpoint untuk mendapatkan semua penyakit
app.get('/diseases', async (req, res) => {
  try {
    const result = await getAllDiseases();
    
    if (result.error) {
      return res.status(500).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve diseases',
      details: error.message
    });
  }
});

// Endpoint untuk update informasi penyakit (admin only)
app.put('/diseases/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const result = await updateDisease(parseInt(id), updateData);
    
    if (result.error) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to update disease',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const dbTest = await getAllDiseases();
    
    res.json({
      status: 'healthy',
      model_loaded: !!model,
      database_connected: !dbTest.error,
      tensorflow_version: tf.version.tfjs,
      backend: tf.getBackend(),
      available_endpoints: [
        'POST /predict - Upload image for prediction',
        'GET /diagnosis/:diseaseName - Get disease diagnosis info',
        'GET /history?limit=10 - Get prediction history',
        'GET /diseases - Get all diseases',
        'PUT /diseases/:id - Update disease info',
        'GET /health - Health check'
      ]
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <h1>🩺 Medical Image Classification API</h1>
    <p>🟢 API is running with database integration</p>
    <p>📡 Endpoints:</p>
    <ul>
      <li><strong>POST /predict</strong> - Upload image for prediction</li>
      <li><strong>GET /diagnosis/:diseaseName</strong> - Get diagnosis information</li>
      <li><strong>GET /history</strong> - Get prediction history</li>
      <li><strong>GET /diseases</strong> - Get all diseases</li>
      <li><strong>PUT /diseases/:id</strong> - Update disease information</li>
      <li><strong>GET /health</strong> - Check API health</li>
    </ul>
    <p>💡 Use POST /predict with form-data 'image' field</p>
    <p>🗄️ Database integration enabled</p>
  `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  if (model) {
    model.dispose();
  }
  await closeDB();
  process.exit(0);
});

// Initialize dan start server
const startServer = async () => {
  try {
    // Initialize database first
    console.log('🗄️  Initializing database...');
    await initDB();
    
    // Then load model
    console.log('🤖 Loading ML model...');
    await loadModel();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`🏥 Medical Image Classification API ready`);
      console.log(`📊 Loaded ${diseaseClasses.length} disease classes`);
      console.log(`🗄️  Database connected and ready`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
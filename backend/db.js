import pkg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pkg;

// Konfigurasi database PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('rlwy.net') ? { 
    rejectUnauthorized: false 
  } : false
});

// Test koneksi database
const initDatabase = async () => {
  try {
    const client = await pool.connect();
    console.log('📦 PostgreSQL Database connected successfully');

    // Buat tabel diseases jika belum ada
    await client.query(`
      CREATE TABLE IF NOT EXISTS diseases (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        causes TEXT,
        prevention TEXT,
        treatment TEXT,
        severity_level VARCHAR(50) DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Buat tabel prediction_history untuk menyimpan riwayat prediksi
    await client.query(`
      CREATE TABLE IF NOT EXISTS prediction_history (
        id SERIAL PRIMARY KEY,
        predicted_disease VARCHAR(255) NOT NULL,
        confidence DECIMAL(5,4) NOT NULL,
        image_name VARCHAR(255),
        prediction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        all_predictions JSONB
      )
    `);

    console.log('🏗️  Database tables created successfully');

    // Seed data jika tabel kosong
    await seedInitialData(client);
    
    client.release();

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

// Seed data awal
const seedInitialData = async (client) => {
  try {
    // Cek apakah data sudah ada
    const result = await client.query('SELECT COUNT(*) as count FROM diseases');
    const count = parseInt(result.rows[0].count);
    
    if (count === 0) {
      console.log('🌱 Seeding initial disease data...');
      
      const diseaseData = [
        {
          name: 'Acne',
          description: 'Kondisi kulit yang terjadi ketika folikel rambut tersumbat oleh minyak dan sel kulit mati, menyebabkan komedo, jerawat, dan kista.',
          causes: 'Produksi sebum berlebih, bakteri Propionibacterium acnes, perubahan hormon (terutama saat pubertas), faktor genetik, stres, dan penggunaan produk kosmetik yang tidak cocok.',
          prevention: 'Cuci wajah 2 kali sehari dengan pembersih lembut, hindari memencet jerawat, gunakan produk non-comedogenic, kelola stres, konsumsi makanan sehat rendah gula dan susu.',
          treatment: 'Obat topikal: benzoyl peroxide, retinoid, antibiotik topikal. Obat oral: antibiotik (tetrasiklin, doksisiklin), isotretinoin untuk kasus berat. Konsultasi dermatologi untuk perawatan profesional.',
          severity_level: 'mild'
        },
        {
          name: 'Eczema',
          description: 'Dermatitis atopik yang menyebabkan kulit merah, gatal, dan meradang. Kondisi kronis yang sering kambuh.',
          causes: 'Faktor genetik, sistem imun yang terlalu aktif, alergen (debu, bulu hewan, makanan), iritasi (sabun, deterjen), cuaca ekstrem, stres.',
          prevention: 'Gunakan pelembab secara teratur, hindari pemicu alergi, mandi air hangat (bukan panas), gunakan sabun lembut bebas pewangi, kelola stres, pakai pakaian berbahan lembut.',
          treatment: 'Krim/salep kortikosteroid topikal, kalsineurin inhibitor topikal, antihistamin untuk mengurangi gatal, pelembab khusus eczema, terapi cahaya untuk kasus berat.',
          severity_level: 'medium'
        },
        {
          name: 'Melanoma',
          description: 'Jenis kanker kulit paling berbahaya yang berkembang dari sel melanosit (sel penghasil pigmen). Dapat menyebar ke organ lain jika tidak ditangani.',
          causes: 'Paparan sinar UV berlebihan, riwayat terbakar matahari, banyak tahi lalat, faktor genetik, kulit putih, sistem imun lemah, usia lanjut.',
          prevention: 'Gunakan tabir surya SPF 30+, hindari paparan matahari pukul 10-16, pakai pakaian pelindung, hindari tanning bed, periksa tahi lalat secara rutin (ABCDE rule).',
          treatment: 'SEGERA konsultasi onkologi! Pembedahan eksisi, sentinel lymph node biopsy, imunoterapi, targeted therapy, kemoterapi, radioterapi. Deteksi dini sangat penting.',
          severity_level: 'severe'
        },
        {
          name: 'Psoriasis',
          description: 'Penyakit autoimun kronis yang menyebabkan penumpukan sel kulit dengan cepat, membentuk sisik tebal berwarna keperakan dan bercak merah yang gatal.',
          causes: 'Sistem autoimun yang menyerang sel kulit sehat, faktor genetik, pemicu: stres, infeksi, obat-obatan tertentu, cedera kulit, merokok, alkohol.',
          prevention: 'Kelola stres dengan baik, hindari cedera kulit, jaga kelembaban kulit, hindari merokok dan alkohol berlebihan, identifikasi dan hindari pemicu personal.',
          treatment: 'Kortikosteroid topikal, vitamin D analog, tar batubara, retinoid topikal, fototerapi UV, obat sistemik (methotrexate, biologics) untuk kasus berat.',
          severity_level: 'medium'
        },
        {
          name: 'Basal Cell Carcinoma',
          description: 'Jenis kanker kulit paling umum yang berkembang lambat dari sel basal epidermis. Jarang menyebar tapi dapat merusak jaringan lokal.',
          causes: 'Paparan sinar UV kronis, kulit putih, usia lanjut, riwayat terbakar matahari, paparan radiasi, sistem imun lemah, paparan arsen.',
          prevention: 'Gunakan tabir surya broad-spectrum SPF 30+, hindari matahari tengah hari, pakai topi dan pakaian pelindung, periksa kulit rutin, hindari tanning bed.',
          treatment: 'Eksisi bedah, Mohs surgery, elektrodesikasi dan kuretase, cryotherapy, terapi radiasi, krim imiquimod untuk lesi superfisial. Konsultasi dermatologi.',
          severity_level: 'medium'
        },
        {
          name: 'Seborrheic Keratoses',
          description: 'Pertumbuhan kulit jinak berwarna coklat atau hitam dengan permukaan kasar seperti kutil. Umum pada usia lanjut.',
          causes: 'Penuaan alami, faktor genetik, paparan sinar matahari, tidak bersifat kanker dan tidak menular.',
          prevention: 'Lindungi kulit dari sinar UV, gunakan tabir surya, pakai pakaian pelindung. Kondisi ini sebagian besar tidak dapat dicegah karena faktor usia.',
          treatment: 'Biasanya tidak perlu pengobatan kecuali mengganggu. Pilihan: cryotherapy (nitrogen cair), elektrokauter, laser, shave excision. Konsultasi dermatologi.',
          severity_level: 'mild'
        },
        {
          name: 'Warts',
          description: 'Pertumbuhan kulit jinak yang disebabkan oleh human papillomavirus (HPV). Dapat muncul di berbagai bagian tubuh.',
          causes: 'Infeksi human papillomavirus (HPV), kontak langsung dengan penderita, sistem imun lemah, kulit lembab atau terluka, jalan kaki tanpa alas kaki di tempat umum.',
          prevention: 'Jaga kebersihan tangan, hindari kontak langsung dengan kutil, gunakan alas kaki di tempat umum, jaga sistem imun, hindari menggigit kuku.',
          treatment: 'Salicylic acid topikal, cryotherapy (nitrogen cair), elektrokauter, laser therapy, imiquimod cream, kadang hilang sendiri dalam 2 tahun.',
          severity_level: 'mild'
        },
        {
          name: 'Atopic Dermatitis',
          description: 'Bentuk eczema yang paling umum, kondisi kulit kronis yang menyebabkan kulit kering, gatal, dan meradang.',
          causes: 'Predisposisi genetik, barrier kulit yang lemah, sistem imun overaktif, alergen (makanan, tungau debu, serbuk sari), iritasi, stres.',
          prevention: 'Rutin menggunakan pelembab, hindari sabun keras, kontrol suhu dan kelembaban ruangan, identifikasi dan hindari alergen, kelola stres.',
          treatment: 'Emolien dan pelembab intensif, kortikosteroid topikal, kalsineurin inhibitor, antihistamin, terapi basah (wet wrap), probiotik.',
          severity_level: 'medium'
        },
        {
          name: 'Melanocytic Nevus',
          description: 'Tahi lalat jinak yang terbentuk dari sel melanosit. Sebagian besar tidak berbahaya tapi perlu dipantau perubahannya.',
          causes: 'Faktor genetik, paparan sinar UV, perubahan hormon (kehamilan, pubertas), sebagian besar bersifat kongenital atau berkembang di masa kanak-kanak.',
          prevention: 'Lindungi dari sinar UV berlebihan, monitor perubahan dengan ABCDE rule (Asymmetry, Border, Color, Diameter, Evolving), foto dokumentasi tahi lalat.',
          treatment: 'Observasi rutin, eksisi bedah jika ada perubahan mencurigakan, biopsy jika diperlukan. Konsultasi dermatologi untuk evaluasi berkala.',
          severity_level: 'mild'
        },
        {
          name: 'Benign Keratosis-like Lesions',
          description: 'Lesi kulit jinak yang menyerupai keratosis, termasuk seborrheic keratosis dan solar lentigo (age spots).',
          causes: 'Penuaan alami, paparan sinar matahari kronis, faktor genetik, tidak bersifat ganas dan tidak menular.',
          prevention: 'Gunakan tabir surya konsisten, hindari paparan UV berlebihan, pakai pakaian pelindung, topi lebar, kacamata UV.',
          treatment: 'Umumnya tidak memerlukan pengobatan. Jika mengganggu: cryotherapy, laser therapy, chemical peeling, IPL (Intense Pulsed Light).',
          severity_level: 'mild'
        },
        {
          name: 'Tinea',
          description: 'Infeksi jamur pada kulit yang dapat menyerang berbagai bagian tubuh (kurap, athlete\'s foot, jock itch).',
          causes: 'Infeksi jamur dermatofita, lingkungan lembab dan hangat, kontak dengan penderita, berbagi handuk/pakaian, sistem imun lemah, kebersihan kurang.',
          prevention: 'Jaga kebersihan dan kekeringan kulit, tidak berbagi handuk/pakaian, gunakan alas kaki di tempat umum basah, ganti pakaian dalam secara teratur.',
          treatment: 'Antijamur topikal (clotrimazole, terbinafine), antijamur oral untuk kasus berat (griseofulvin, itraconazole), jaga area tetap kering dan bersih.',
          severity_level: 'mild'
        }
      ];

      // Insert data menggunakan parameterized query
      for (const disease of diseaseData) {
        await client.query(`
          INSERT INTO diseases (name, description, causes, prevention, treatment, severity_level)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (name) DO NOTHING
        `, [
          disease.name,
          disease.description,
          disease.causes,
          disease.prevention,
          disease.treatment,
          disease.severity_level
        ]);
      }

      console.log('✅ Disease data seeded successfully');
    }
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  }
};

// Fungsi untuk mendapatkan diagnosis berdasarkan nama penyakit
export const getDiagnosisByName = async (diseaseName) => {
  try {
    const result = await pool.query(
      'SELECT * FROM diseases WHERE LOWER(name) = LOWER($1)',
      [diseaseName]
    );
    
    if (result.rows.length === 0) {
      return {
        error: 'Disease not found in database',
        disease_name: diseaseName
      };
    }

    const disease = result.rows[0];
    return {
      success: true,
      disease: {
        id: disease.id,
        name: disease.name,
        description: disease.description,
        causes: disease.causes,
        prevention: disease.prevention,
        treatment: disease.treatment,
        severity_level: disease.severity_level,
        created_at: disease.created_at
      }
    };
  } catch (error) {
    console.error('Database query error:', error);
    return {
      error: 'Database query failed',
      details: error.message
    };
  }
};

// Fungsi untuk menyimpan riwayat prediksi
export const savePredictionHistory = async (predictionData) => {
  try {
    const result = await pool.query(`
      INSERT INTO prediction_history (predicted_disease, confidence, image_name, all_predictions)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [
      predictionData.predicted_disease,
      predictionData.confidence,
      predictionData.image_name || 'unknown',
      JSON.stringify(predictionData.all_predictions)
    ]);

    return {
      success: true,
      prediction_id: result.rows[0].id
    };
  } catch (error) {
    console.error('Failed to save prediction history:', error);
    return {
      error: 'Failed to save prediction',
      details: error.message
    };
  }
};

// Fungsi untuk mendapatkan riwayat prediksi
export const getPredictionHistory = async (limit = 10) => {
  try {
    const result = await pool.query(`
      SELECT * FROM prediction_history 
      ORDER BY prediction_date DESC 
      LIMIT $1
    `, [limit]);

    return {
      success: true,
      history: result.rows.map(record => ({
        ...record,
        all_predictions: typeof record.all_predictions === 'string' 
          ? JSON.parse(record.all_predictions) 
          : record.all_predictions
      }))
    };
  } catch (error) {
    console.error('Failed to get prediction history:', error);
    return {
      error: 'Failed to retrieve history',
      details: error.message
    };
  }
};

// Fungsi untuk mendapatkan semua penyakit
export const getAllDiseases = async () => {
  try {
    const result = await pool.query('SELECT * FROM diseases ORDER BY name');
    return {
      success: true,
      diseases: result.rows
    };
  } catch (error) {
    console.error('Failed to get all diseases:', error);
    return {
      error: 'Failed to retrieve diseases',
      details: error.message
    };
  }
};

// Fungsi untuk update informasi penyakit
export const updateDisease = async (id, updateData) => {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && key !== 'id') {
        fields.push(`${key} = $${paramCount}`);
        values.push(updateData[key]);
        paramCount++;
      }
    });
    
    if (fields.length === 0) {
      return { error: 'No fields to update' };
    }
    
    // Add updated_at
    fields.push(`updated_at = $${paramCount}`);
    values.push(new Date());
    paramCount++;
    
    // Add id for WHERE clause
    values.push(id);
    
    const query = `UPDATE diseases SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return { error: 'Disease not found' };
    }
    
    return { 
      success: true, 
      updated_disease: result.rows[0]
    };
  } catch (error) {
    console.error('Failed to update disease:', error);
    return {
      error: 'Failed to update disease',
      details: error.message
    };
  }
};

// Inisialisasi database saat modul dimuat
export const initDB = initDatabase;

// Graceful shutdown
export const closeDB = async () => {
  await pool.end();
  console.log('📦 PostgreSQL connection pool closed');
};
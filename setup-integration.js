#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setting up Retail Assistant Web Integration');
console.log('=' * 50);

// Check if backend exists
const backendPath = path.join(__dirname, '..', 'backend');
if (!fs.existsSync(backendPath)) {
  console.error('❌ Backend directory not found. Please ensure the backend is in the parent directory.');
  process.exit(1);
}

console.log('✅ Backend directory found');

// Check if required backend files exist
const requiredFiles = [
  'rag_system.py',
  'vector_store.py',
  'validation_system.py',
  'requirements.txt'
];

const missingFiles = requiredFiles.filter(file => 
  !fs.existsSync(path.join(backendPath, file))
);

if (missingFiles.length > 0) {
  console.error('❌ Missing backend files:', missingFiles);
  process.exit(1);
}

console.log('✅ All required backend files found');

// Install Python dependencies
console.log('📦 Installing Python dependencies...');
try {
  execSync('pip install -r requirements.txt', { 
    cwd: backendPath, 
    stdio: 'inherit' 
  });
  console.log('✅ Python dependencies installed');
} catch (error) {
  console.error('❌ Failed to install Python dependencies:', error.message);
  process.exit(1);
}

// Install Node.js dependencies
console.log('📦 Installing Node.js dependencies...');
try {
  execSync('npm install', { 
    cwd: __dirname, 
    stdio: 'inherit' 
  });
  console.log('✅ Node.js dependencies installed');
} catch (error) {
  console.error('❌ Failed to install Node.js dependencies:', error.message);
  process.exit(1);
}

// Create sample data if it doesn't exist
const sampleDataPath = path.join(backendPath, 'sample_retail_data.parquet');
if (!fs.existsSync(sampleDataPath)) {
  console.log('📊 Creating sample data...');
  try {
    execSync('python setup.py --create-sample', { 
      cwd: backendPath, 
      stdio: 'inherit' 
    });
    console.log('✅ Sample data created');
  } catch (error) {
    console.error('❌ Failed to create sample data:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ Sample data already exists');
}

// Check if .env file exists
const envPath = path.join(backendPath, '.env');
if (!fs.existsSync(envPath)) {
  console.log('⚠️  .env file not found. Creating template...');
  const envContent = `# OpenAI API Key (required for AI responses)
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Custom model settings
EMBEDDING_MODEL=all-MiniLM-L6-v2
CHROMA_PERSIST_DIRECTORY=./chroma_db
`;
  fs.writeFileSync(envPath, envContent);
  console.log('✅ .env template created. Please add your OpenAI API key.');
} else {
  console.log('✅ .env file exists');
}

console.log('\n' + '=' * 50);
console.log('🎉 Integration setup complete!');
console.log('=' * 50);

console.log('\n📋 Next steps:');
console.log('1. Add your OpenAI API key to backend/.env file');
console.log('2. Start the development server: npm run dev');
console.log('3. Open http://localhost:4000 in your browser');

console.log('\n🔧 Available commands:');
console.log('- npm run dev: Start development server');
console.log('- npm run build: Build for production');
console.log('- npm run start: Start production server');

console.log('\n📚 Backend commands:');
console.log('- python setup.py --data-file your_data.parquet: Setup with your data');
console.log('- python test_system.py: Test the backend system');
console.log('- python data_explorer.py your_data.parquet: Explore your data');

# Retail Assistant Web

A modern Next.js frontend for the Retail Transaction Knowledge Base, providing an intuitive chat interface for analyzing retail transaction data with AI-powered insights.

## Features

- **AI-Powered Chat Interface**: Interactive chat with the retail transaction knowledge base
- **Real-time Analytics**: Get instant insights from your retail data
- **Modern UI**: Beautiful, responsive design with dark/light mode
- **Conversation Management**: Save and manage chat sessions
- **Source Attribution**: See which data sources inform each response
- **Suggested Questions**: Get relevant follow-up questions

## Architecture

### Frontend Components
- **ChatInterface**: Main chat component with AI integration
- **TopNav**: Navigation with retail-specific menu items
- **API Routes**: Next.js API routes connecting to Python backend
- **Supabase Integration**: User authentication and conversation storage

### Backend Integration
- **Python RAG System**: Advanced retrieval-augmented generation
- **Vector Database**: ChromaDB for semantic search
- **Validation System**: Multi-layer response validation
- **Data Processing**: Intelligent chunking and embedding

## Quick Start

### 1. Setup Integration
```bash
# Run the integration setup script
node setup-integration.js
```

### 2. Configure Environment
Add your OpenAI API key to `../backend/.env`:
```env
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Start Development Server
```bash
npm run dev
```

### 4. Open in Browser
Navigate to `http://localhost:4000`

## 📊 Data Requirements

The system expects retail transaction data with these columns:
- `entity_id`: Unique identifier for retail entities
- `location_count`: Number of locations (1 = single store, >1 = chain)
- `period_end`: End date of reporting period
- `sales_volume`: Number of units sold
- `product_group_code`: Product category (A, B, C, D, E, etc.)

## 🔧 API Endpoints

### Chat API
- `POST /api/chat` - Send messages to the AI
- `GET /api/chat` - Get API status

### Data API
- `GET /api/data?action=stats` - Get knowledge base statistics
- `GET /api/data?action=suggestions` - Get suggested queries
- `POST /api/data` - Upload data (future feature)

### Health API
- `GET /api/health` - System health check

## Sample Queries

- "What are the top performing product groups by sales volume?"
- "Which entities have the highest sales in the most recent period?"
- "How do single-location stores compare to multi-location chains?"
- "What is the average sales volume per transaction for each product group?"
- "Which entities have the most diverse product offerings?"

### Key Components

#### ChatInterface.tsx
- Main chat component
- Integrates with Python backend via API routes
- Handles conversation management
- Provides suggested questions

#### API Routes
- `/api/chat/route.ts` - Chat functionality
- `/api/data/route.ts` - Data operations
- `/api/health/route.ts` - System health

### Environment Variables
```env
# Supabase (for user management)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key

# Backend (for AI responses)
OPENAI_API_KEY=your_openai_key
```

## Backend Integration

The frontend connects to the Python backend through:

1. **API Routes**: Next.js API routes that spawn Python processes
2. **Data Exchange**: JSON communication between frontend and backend
3. **File System**: Shared data files between frontend and backend
4. **Environment**: Shared environment variables

### Backend Requirements
- Python 3.8+
- Required packages in `../backend/requirements.txt`
- OpenAI API key
- Retail transaction data in parquet format

## User Interface

### Chat Interface
- **Message History**: Scrollable conversation history
- **Typewriter Effect**: Animated AI responses
- **Source Attribution**: Shows data sources used
- **Suggested Questions**: Context-aware follow-ups
- **File Attachments**: Support for data file uploads

### Navigation
- **Chat**: Main conversation interface
- **Reports**: Analytics and insights
- **Spotlight**: Featured insights
- **Settings**: User preferences

### Responsive Design
- Mobile-first approach
- Dark/light mode support
- Touch-friendly interface
- Keyboard shortcuts

## Deployment

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm run start
```

### Docker (Future)
```bash
docker build -t retail-assistant-web .
docker run -p 4000:4000 retail-assistant-web
```

## Troubleshooting

### Common Issues

1. **Backend Not Found**
   - Ensure backend is in parent directory
   - Check Python dependencies are installed
   - Verify .env file exists

2. **API Errors**
   - Check OpenAI API key is valid
   - Verify data file exists and is accessible
   - Check system health: `GET /api/health`

3. **Chat Not Working**
   - Verify backend is running
   - Check browser console for errors
   - Ensure data is loaded in vector store

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm run dev
```

## Performance

### Optimization Features
- **Caching**: API responses cached for performance
- **Lazy Loading**: Components loaded on demand
- **Code Splitting**: Optimized bundle sizes
- **Image Optimization**: Next.js automatic optimization

### Monitoring
- Health check endpoint
- Error logging
- Performance metrics
- User analytics
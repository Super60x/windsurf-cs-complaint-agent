require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const path = require('path');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3001;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// Validate required environment variables
if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is required but not set');
    process.exit(1);
}

// Configure axios for OpenAI
const openaiAxios = axios.create({
    baseURL: 'https://api.openai.com/v1',
    headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY.trim()}`,
        'Content-Type': 'application/json'
    }
});

// Test OpenAI connection
const testOpenAIConnection = async () => {
    try {
        console.log('Testing OpenAI connection with model: gpt-4');
        const response = await openaiAxios.post('/chat/completions', {
            model: "gpt-4",
            messages: [{ 
                role: "user", 
                content: "Respond with 'OK' if you can read this." 
            }],
            max_tokens: 5
        });
        
        console.log('OpenAI Response:', response.data.choices[0]?.message?.content);
        console.log('✓ OpenAI connection successful');
    } catch (error) {
        console.error('✗ OpenAI connection failed');
        console.error('Error message:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
};

// Security middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware setup
app.use(limiter);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'frontend/build')));

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter(req, file, cb) {
        if (!file.originalname.match(/\.(txt|doc|docx|pdf)$/)) {
            return cb(new Error('Alleen .txt, .doc, .docx en .pdf bestanden zijn toegestaan.'));
        }
        cb(null, true);
    }
});

// Input validation middleware
const validateTextInput = (req, res, next) => {
    const { text, type } = req.body;

    if (!text || typeof text !== 'string') {
        return res.status(400).json({ 
            error: 'Tekst is verplicht en moet een string zijn.' 
        });
    }

    if (text.length > 4000) {
        return res.status(400).json({ 
            error: 'Tekst mag niet langer zijn dan 4000 karakters.' 
        });
    }

    if (!type || !['rewrite', 'response'].includes(type)) {
        return res.status(400).json({ 
            error: 'Type moet "rewrite" of "response" zijn.' 
        });
    }
    
    next();
};

// OpenAI Prompts Configuration
const OPENAI_PROMPTS = {
    system: {
        base: "Je bent een professionele klantenservice medewerker die expert is in het behandelen van klachtenbrieven in het Nederlands. " +
              "Je communiceert altijd beleefd, empathisch en oplossingsgericht. " +
              "Je gebruikt een professionele maar toegankelijke schrijfstijl.",
    },
    user: {
        rewrite: (text) => 
            `Herschrijf deze klachtenbrief of bericht professioneel en duidelijk. Instructies:
             - Behoud de kernboodschap en belangrijke feiten
             - Verbeter de toon naar professioneel en respectvol
             - Structureer de brief logisch met inleiding, kern en afsluiting
             - Structureer met achtergrond/feiten, oorzaak, getroffen maatregelen om herhaling te voorkomen
             - Gebruik correcte spelling en grammatica
             - Maak de tekst beknopt maar volledig
             - Geen informatie uitvinden. Als je de informatie niet hebt plaats [xx] met daarin de informatie die door de gebruiker moet worden aangevuld
             - Gebruik steeds als afsluiting: Met Vriendelijke Groeten
             
             De brief:
             ${text}`,
        
        response: (text) => 
            `Schrijf een professioneel antwoord op deze klachtenbrief. Instructies:
             - Begin met begrip tonen voor de situatie
             - Behandel elk genoemd punt serieus
             - Structureer met achtergrond/feiten, oorzaak, getroffen maatregelen om herhaling te voorkomen
             - Sluit af met een constructieve toon
             - Gebruik een empathische maar professionele schrijfstijl
             - Voeg een passende aanhef
             - Gebruik steeds als afsluiting: Met Vriendelijke Groeten
             
             De klachtenbrief:
             ${text}`
    }
};

// Routes
app.post('/api/process-text', validateTextInput, async (req, res) => {
    try {
        const { text, type } = req.body;
        console.log('Processing request:', { type, textLength: text.length });

        const response = await openaiAxios.post('/chat/completions', {
            model: "gpt-4",
            messages: [
                { 
                    role: "system", 
                    content: OPENAI_PROMPTS.system.base
                },
                { 
                    role: "user", 
                    content: OPENAI_PROMPTS.user[type](text)
                }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });

        if (!response.data.choices?.[0]?.message?.content) {
            throw new Error('Ongeldig antwoord van AI service');
        }

        console.log('Successfully processed text');
        res.json({ 
            processedText: response.data.choices[0].message.content 
        });
    } catch (error) {
        console.error('Error processing text:', error.message);
        if (error.response?.data) {
            console.error('OpenAI API error:', error.response.data);
        }
        res.status(500).json({ 
            error: 'Er is een fout opgetreden bij het verwerken van de tekst',
            details: error.message
        });
    }
});

app.post('/api/upload-file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Geen bestand geüpload.' });
        }

        // Handle different file types and extract text
        let text = '';
        const buffer = req.file.buffer;
        const filename = req.file.originalname.toLowerCase();

        if (filename.endsWith('.txt')) {
            text = buffer.toString('utf-8');
        } else if (filename.endsWith('.pdf')) {
            const pdf = require('pdf-parse');
            const data = await pdf(buffer);
            text = data.text;
        } else if (filename.endsWith('.doc') || filename.endsWith('.docx')) {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer });
            text = result.value;
        }

        if (!text.trim()) {
            throw new Error('Kon geen tekst uit het bestand halen.');
        }

        res.json({ text });
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ 
            error: 'Er is een fout opgetreden bij het uploaden van het bestand.' 
        });
    }
});

// Test endpoint for verifying prompts
app.get('/api/test-prompts', async (req, res) => {
    const testLetter = `
    Beste,

    Ik schrijf deze brief omdat ik erg ontevreden ben over de levering van mijn nieuwe windsurfplank. 
    De plank die ik op 15 november heb besteld, zou binnen 5 werkdagen geleverd worden, maar na 2 weken 
    heb ik nog steeds niks ontvangen! Ik heb al 3x gebeld maar krijg steeds andere verhalen te horen. 
    Dit is echt belachelijk! Ik heb wel 899 euro betaald en dan verwacht ik ook gewoon goede service.
    
    Ik wil nu eindelijk weten waar mijn plank blijft en wanneer ik hem krijg. Als dit nog langer duurt 
    wil ik mijn geld terug! En ik ga zeker een slechte review achterlaten op alle websites.

    gr,
    Jan Jansen`;

    try {
        // Test rewrite
        const rewriteResponse = await openaiAxios.post('/chat/completions', {
            model: "gpt-4",
            messages: [
                { role: "system", content: OPENAI_PROMPTS.system.base },
                { role: "user", content: OPENAI_PROMPTS.user.rewrite(testLetter) }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });

        // Test response
        const responseResponse = await openaiAxios.post('/chat/completions', {
            model: "gpt-4",
            messages: [
                { role: "system", content: OPENAI_PROMPTS.system.base },
                { role: "user", content: OPENAI_PROMPTS.user.response(testLetter) }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });

        res.json({
            rewrite: rewriteResponse.data.choices[0]?.message?.content,
            response: responseResponse.data.choices[0]?.message?.content
        });
    } catch (error) {
        console.error('Test prompts error:', error.message);
        res.status(500).json({ error: 'Error testing prompts', details: error.message });
    }
});

// Add root route handler
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Er is een fout opgetreden bij het verwerken van uw verzoek.' 
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    testOpenAIConnection();
});

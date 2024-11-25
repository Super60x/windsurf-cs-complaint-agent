# Klantenservice Klachtenbrief Verwerker

Een applicatie voor het verwerken en beantwoorden van klachtenbrieven voor klantenservice medewerkers.

## Functionaliteiten

- Tekst direct invoeren of document uploaden (PDF, DOC)
- Brieven herschrijven voor verbeterde helderheid en professionaliteit
- Automatisch genereren van empathische antwoorden
- Opslag van brieven en antwoorden
- Volledig Nederlandstalige interface

## Technische Vereisten

- Node.js (v14 of hoger)
- MongoDB
- OpenAI API key

## Installatie

1. Clone de repository
2. Installeer dependencies:
   ```bash
   npm install
   ```
3. Kopieer `.env.example` naar `.env` en vul de juiste waarden in:
   ```
   PORT=3000
   OPENAI_API_KEY=your_openai_api_key_here
   MONGODB_URI=your_mongodb_connection_string_here
   ```

## Ontwikkeling

Start de ontwikkelingsserver:
```bash
npm run dev
```

De server draait standaard op `http://localhost:3000`

## API Endpoints

### POST /api/process-text
Verwerkt ingevoerde tekst voor herschrijven of antwoord genereren.

### POST /api/upload-file
Handelt bestandsuploads af (PDF, DOC).

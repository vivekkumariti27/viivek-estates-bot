import express from 'express';
import axios from 'axios';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();
const app = express();
app.use(express.json());

// MongoDB Database Connection
mongoose.connect(process.env.MONGODB_URI).then(() => console.log("MongoDB Memory Connected!")).catch(e => console.log("DB Error:", e));

// Memory Schema for AI
const chatSchema = new mongoose.Schema({
    phone: String,
    role: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', chatSchema);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    try {
        const payload = req.body;
        if (payload.event === 'messages.upsert' && !payload.data.key.fromMe) {
            const messageData = payload.data.message;
            const userMessage = messageData.conversation || messageData.extendedTextMessage?.text;
            const userPhone = payload.data.key.remoteJid;
            
            if (!userMessage) return;

            // Step 1: Customer ka message save karo
            await new Chat({ phone: userPhone, role: 'Customer', message: userMessage }).save();

            // Step 2: Pichli chat history fetch karo (Memory)
            const history = await Chat.find({ phone: userPhone }).sort({ timestamp: 1 }).limit(10);
            const chatContext = Array.isArray(history) ? history.map(msg => `${msg.role}: ${msg.message}`).join('\n') : '';

            // Step 3: Elite Broker Prompt
            const systemPrompt = `Tum 'Viivek Estates' ke elite real estate consultant ho. Target: Jaipur mein buyers ko unke budget aur location ke hisaab se best property suggest karna. 
            Rules:
            1. Sirf ek baar mein ek hi sawal poocho. 
            2. Hamesha chota aur professional Hinglish mein reply karo. 
            3. Lead Qualification: Jab customer apna Budget aur Area dono bata de, tab usko bolo ki "Main Viivek sir ko details pass kar raha hu, wo aapse property options aur site visit ke liye direct connect karenge."
            
            Pichli Chat History:
            ${chatContext}`;

            const response = await ai.models.generateContent({
                model: 'gemini-1.5-flash',
                contents: systemPrompt,
            });
            const aiReply = response.text;

            // Step 4: AI ka reply DB mein save karo aur bhejo
            await new Chat({ phone: userPhone, role: 'Bot', message: aiReply }).save();

            const evolutionUrl = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.INSTANCE_NAME}`;
            await axios.post(evolutionUrl, { number: userPhone, text: aiReply }, { headers: { 'apikey': process.env.EVOLUTION_API_KEY } });
            
            console.log("Memory updated & Replied to:", userPhone);
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
});

app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('Viivek Estates AI Server is LIVE!'));

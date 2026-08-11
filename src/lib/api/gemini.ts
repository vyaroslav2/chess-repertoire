import { GoogleGenAI } from "@google/genai";
import { Chess } from "chess.js";
import * as dotenv from "dotenv";
import * as fs from "fs";

if (fs.existsSync("C:\\Files\\.env")) {
  dotenv.config({ path: "C:\\Files\\.env" });
}
dotenv.config();

const ai = new GoogleGenAI({ 
  apiKey: "DUMMY_KEY",
  httpOptions: { baseUrl: "http://127.0.0.1:55555/gemini" }
});

export async function fallbackGeminiMove(whiteFirstMove: string, chess: Chess, candidateMoves: any[]) {
    try {
        const prompt = `White just played ${whiteFirstMove} on move 1. I am a Black player who plays the Caro-Kann against 1.e4 and QGD/Slav structures against 1.d4 (starting with 1...d5). 
Reply ONLY with the exact standard algebraic notation of the single best move (e.g. c6). Do not include any other text.`;
        const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
        const suggestedMove = response.text?.trim().replace(/[^a-zA-Z0-9]/g, '');
        if (suggestedMove && chess.moves().includes(suggestedMove)) {
            const selectedStats = candidateMoves.find(m => m.san === suggestedMove) || null;
            return { san: suggestedMove, stats: selectedStats };
        }
    } catch (e) {}
    return null;
}
